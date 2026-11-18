// Force-layout presets (CONFIG.graph.forcePresets): the renderer starts from the saved preset,
// and switching preset reconfigures the live simulation, reheats it, and persists the choice.
// Same real jsdom + d3 + data pipeline setup as GraphRenderer.incrementalUpdate.test.js.

import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import { materials, reactionSources, materialAssociations } from "./fixtures.js";

async function setupDom(savedPreset = null) {
  const dom = new JSDOM("<!doctype html><html><body><div id='graphContainer'></div></body></html>", {
    url: "https://example.test/",
  });
  global.window = dom.window;
  global.document = dom.window.document;
  if (savedPreset) window.localStorage.setItem("noitalambic.graph.forcePreset", savedPreset);

  const { EventBus } = await import("../core/EventBus.js");
  const { DataRepository } = await import("../core/DataRepository.js");
  const { AppState } = await import("../core/AppState.js");
  const { ReactionFilter } = await import("../filters/ReactionFilter.js");
  const { GraphDataBuilder } = await import("../graph/GraphDataBuilder.js");
  const { GraphRenderer } = await import("../graph/GraphRenderer.js");
  const { ShortcutManager } = await import("../core/ShortcutManager.js");
  const { InMemoryStorage } = await import("../core/ReactionSetManager.js");

  const eventBus = new EventBus();
  const dataRepo = new DataRepository(materials, reactionSources, materialAssociations);
  const state = new AppState(eventBus, dataRepo);
  const reactionFilter = new ReactionFilter(dataRepo);
  const graphRenderer = new GraphRenderer(dataRepo, state, new GraphDataBuilder(dataRepo), new ShortcutManager(new InMemoryStorage()));
  graphRenderer.render(reactionFilter.getFilteredReactionsAdvanced({ reagents: ["fire"] }));
  return { graphRenderer, state, reactionFilter };
}

test("the renderer starts from the saved preset, or the default one", async () => {
  const { CONFIG } = await import("../config/config.js");
  assert.equal((await setupDom()).graphRenderer.forcePresetId, CONFIG.graph.defaultForcePreset);
  assert.equal((await setupDom("spacious")).graphRenderer.forcePresetId, "spacious");
  assert.equal((await setupDom("no-such-preset")).graphRenderer.forcePresetId, CONFIG.graph.defaultForcePreset);
});

test("switching preset reconfigures and reheats the live simulation, and persists the choice", async () => {
  const { CONFIG } = await import("../config/config.js");
  const { graphRenderer } = await setupDom();
  const simulation = graphRenderer._simulation;
  simulation.alpha(0.001);

  graphRenderer.setForcePreset("spacious");
  const spacious = CONFIG.graph.forcePresets.spacious;
  assert.equal(simulation.force("link").distance()(), spacious.linkDistance);
  assert.equal(simulation.force("charge").strength()({ degree: 1 }), spacious.untangleCharge, "a new layout starts untangling again");
  assert.equal(simulation.force("charge").distanceMax(), spacious.chargeDistanceMax);
  assert.equal(simulation.force("x").strength()(), spacious.gravity);
  assert.ok(simulation.alpha() > 0.5, "the simulation is reheated");
  assert.equal(window.localStorage.getItem("noitalambic.graph.forcePreset"), "spacious");
  simulation.stop();
});

test("every preset defines all force settings", async () => {
  const { CONFIG } = await import("../config/config.js");
  const keys = ["label", "linkDistance", "linkStrength", "tagLinkStrength", "untangleCharge", "compactCharge",
    "compactAlpha", "chargeDistanceMax", "gravity", "collisionPadding", "degreeCharge"];
  for (const [id, preset] of Object.entries(CONFIG.graph.forcePresets)) {
    for (const key of keys) assert.ok(key in preset, `${id} is missing ${key}`);
  }
  assert.ok(CONFIG.graph.defaultForcePreset in CONFIG.graph.forcePresets);
});

test("repulsion scales with each node's visible degree, so hubs get room for their star", async () => {
  const { graphRenderer } = await setupDom();
  const simulation = graphRenderer._simulation;
  const nodes = simulation.nodes();
  const links = simulation.force("link").links();
  for (const node of nodes) {
    assert.equal(node.degree, links.filter((l) => l.source === node || l.target === node).length, `${node.id} degree`);
  }
  const strength = simulation.force("charge").strength();
  assert.ok(strength({ degree: 9 }) < strength({ degree: 1 }), "a hub repels harder (more negative) than a leaf");

  graphRenderer.setForcePreset("classic");
  const classic = simulation.force("charge").strength();
  assert.equal(classic({ degree: 9 }), classic({ degree: 1 }), "classic keeps uniform repulsion");
  simulation.stop();
});

test("grid snapping puts every node on its own lattice point, and turning it off hides the grid", async () => {
  const { CONFIG } = await import("../config/config.js");
  const { getSnapGrid } = await import("../graph/gridSnap.js");
  const { graphRenderer } = await setupDom();
  const simulation = graphRenderer._simulation;
  simulation.stop();
  CONFIG.graph.snapAnimationMs = 0;

  graphRenderer.setSnapGrid("hexagonal");
  graphRenderer.setSnapEnabled(true);
  const grid = getSnapGrid("hexagonal");
  const nodes = simulation.nodes();
  const cells = new Set();
  for (const node of nodes) {
    const cell = grid.nearest(node.x, node.y);
    assert.deepEqual([node.x, node.y], [cell.x, cell.y], `${node.id} is on a lattice point`);
    assert.equal(node.fx, null, `${node.id} stays free: snapping does not pin`);
    cells.add(grid.key(cell.i, cell.j));
  }
  assert.equal(cells.size, nodes.length, "no two nodes share a cell");
  assert.equal(window.localStorage.getItem("noitalambic.graph.snapGrid"), "hexagonal");
  assert.notEqual(document.querySelector("canvas.snap-grid").style.display, "none", "the grid backdrop is shown");

  graphRenderer.setSnapEnabled(false);
  assert.ok(nodes.every((node) => node.fx == null && node.fy == null));
  assert.equal(document.querySelector("canvas.snap-grid").style.display, "none");
  simulation.stop();
});

test("with a grid on, a layout change re-lays out and snaps back right away (no waiting for it to settle)", async () => {
  const { CONFIG } = await import("../config/config.js");
  const { getSnapGrid } = await import("../graph/gridSnap.js");
  const { graphRenderer } = await setupDom();
  const simulation = graphRenderer._simulation;
  simulation.stop();
  CONFIG.graph.snapAnimationMs = 0;
  graphRenderer.setSnapGrid("square");
  graphRenderer.setSnapEnabled(true);

  graphRenderer.setForcePreset("spacious");
  const grid = getSnapGrid("square");
  const nodes = simulation.nodes();
  assertAllOnDistinctCells(nodes, grid); // synchronously, no waiting
  assert.ok(simulation.alpha() < CONFIG.graph.snapAlpha, "the new layout was settled before snapping");
  simulation.stop();
});

function assertAllOnDistinctCells(nodes, grid) {
  const cells = new Set();
  for (const node of nodes) {
    const cell = grid.nearest(node.x, node.y);
    assert.deepEqual([node.x, node.y], [cell.x, cell.y], `${node.id} is on a lattice point`);
    cells.add(grid.key(cell.i, cell.j));
  }
  assert.equal(cells.size, nodes.length, "no two nodes share a cell");
}

test("with a grid on, showing a tag's materials or loading another selection re-balances everything, then snaps", async () => {
  const { CONFIG } = await import("../config/config.js");
  const { getSnapGrid } = await import("../graph/gridSnap.js");
  const { graphRenderer, state, reactionFilter } = await setupDom();
  graphRenderer._simulation.stop();
  CONFIG.graph.snapAnimationMs = 0;
  graphRenderer.setSnapGrid("hexagonal");
  graphRenderer.setSnapEnabled(true);
  const grid = getSnapGrid("hexagonal");
  const entries = reactionFilter.getFilteredReactionsAdvanced({ reagents: ["fire"] });

  // Show the [liquids] tag's materials: new nodes come in next to the tag.
  state.showTagMaterials("[liquids]");
  graphRenderer.render(entries);
  const simulation = graphRenderer._simulation;
  assert.ok(simulation.nodes().some((n) => n.id === "blood"), "the tag's materials are now shown");
  assert.ok(simulation.alpha() < CONFIG.graph.snapAlpha, "the layout was settled, not blocked by pinned nodes");
  assertAllOnDistinctCells(simulation.nodes(), grid);

  // A mostly different selection (like loading a saved config).
  state.hideTagMaterials("[liquids]");
  graphRenderer.render(reactionFilter.getFilteredReactionsAdvanced({ reagents: ["acid"] }));
  assert.ok(simulation.alpha() < CONFIG.graph.snapAlpha);
  assertAllOnDistinctCells(simulation.nodes(), grid);
  simulation.stop();
});

test("new nodes start next to an already placed neighbor, not at d3's default spot", async () => {
  const { graphRenderer, state, reactionFilter } = await setupDom();
  graphRenderer._simulation.stop();
  const tag = graphRenderer._simulation.nodes().find((n) => n.id === "[liquids]");
  assert.ok(!graphRenderer._nodesById.has("blood"), "blood is not shown before the tag is opened");
  state.showTagMaterials("[liquids]");
  const r = graphRenderer;
  const original = r._incrementalUpdate;
  let seen = null;
  r._incrementalUpdate = function (nodes, ...rest) {
    // Positions before the layout runs: where the new tag materials start.
    seen = nodes.filter((n) => ["oil", "acid", "blood"].includes(n.id)).map((n) => ({ id: n.id, x: n.x, y: n.y }));
    return original.call(this, nodes, ...rest);
  };
  r.render(reactionFilter.getFilteredReactionsAdvanced({ reagents: ["fire"] }));
  r._simulation.stop();
  assert.ok(seen && seen.length > 0);
  const spread = 200;
  for (const node of seen) {
    assert.ok(Math.hypot(node.x - tag.x, node.y - tag.y) < spread, `${node.id} starts near the [liquids] tag`);
  }
});

test("changing the grid size re-snaps every node onto the resized grid and persists it", async () => {
  const { CONFIG } = await import("../config/config.js");
  const { getSnapGrid } = await import("../graph/gridSnap.js");
  const { graphRenderer } = await setupDom();
  graphRenderer._simulation.stop();
  CONFIG.graph.snapAnimationMs = 0;
  graphRenderer.setSnapGrid("square");
  graphRenderer.setSnapEnabled(true);

  graphRenderer.setSnapScale(40);
  assertAllOnDistinctCells(graphRenderer._simulation.nodes(), getSnapGrid("square", 40));
  assert.equal(window.localStorage.getItem("noitalambic.graph.snapGridScale"), "40");

  // A very fine grid: nodes still snap to it.
  graphRenderer.setSnapScale(5);
  assertAllOnDistinctCells(graphRenderer._simulation.nodes(), getSnapGrid("square", 5));
  graphRenderer._simulation.stop();
});

test("on a grid, nodes land on it but stay free, and a grid force keeps them there", async () => {
  const { CONFIG } = await import("../config/config.js");
  const { getSnapGrid } = await import("../graph/gridSnap.js");
  const { graphRenderer } = await setupDom();
  const simulation = graphRenderer._simulation;
  simulation.stop();
  CONFIG.graph.snapAnimationMs = 0;
  graphRenderer.setSnapScale(100);
  graphRenderer.setSnapGrid("square");
  graphRenderer.setSnapEnabled(true);

  const grid = getSnapGrid("square");
  const nodes = simulation.nodes();
  assert.ok(simulation.force("grid"), "a grid force is active");
  assert.ok(nodes.every((node) => node.fx == null), "nodes are free: gravity and links still act");
  for (const node of nodes) {
    const cell = grid.nearest(node.x, node.y);
    assert.deepEqual([node.x, node.y], [cell.x, cell.y], `${node.id} sits on a lattice point`);
  }

  // The grid force pulls a displaced free node back toward its cell.
  const node = nodes[0];
  node.x += 30;
  node.vx = 0;
  simulation.force("grid")(1);
  assert.ok(node.vx < 0, "pulled back toward its cell");

  graphRenderer.setSnapEnabled(false);
  assert.equal(simulation.force("grid"), undefined, "no grid, no grid force");
  simulation.stop();
});

test("pinning is explicit, from the node menu ('Pin position' / 'Unpin position')", async () => {
  const { CONFIG } = await import("../config/config.js");
  const { getSnapGrid } = await import("../graph/gridSnap.js");
  const { graphRenderer } = await setupDom();
  graphRenderer._simulation.stop();
  CONFIG.graph.snapAnimationMs = 0;
  graphRenderer.setSnapGrid("square");
  graphRenderer.setSnapEnabled(true);
  const node = graphRenderer._simulation.nodes().find((n) => n.type === "material");
  const entry = (label) => graphRenderer.menu.entries(node, null).find((e) => e.label === label);
  assert.ok(!entry("Unpin position"), "free nodes have nothing to unpin");
  node.x += 17;
  entry("Pin position").run();
  assert.equal(node.pinned, true);
  const cell = getSnapGrid("square").nearest(node.fx, node.fy);
  assert.deepEqual([node.fx, node.fy], [cell.x, cell.y], "pinned on a grid cell");
  assert.ok(document.querySelector(".pin-badge"), "a badge marks it");
  entry("Unpin position").run();
  assert.equal(node.fx, null);
  assert.equal(node.pinned, false);
  assert.equal(document.querySelector(".pin-badge"), null);
  graphRenderer._simulation.stop();
});

test("a pinned node is out of the physics' reach, and stays pinned through layout and grid changes", async () => {
  const { CONFIG } = await import("../config/config.js");
  const { getSnapGrid } = await import("../graph/gridSnap.js");
  const { graphRenderer, reactionFilter } = await setupDom();
  const simulation = graphRenderer._simulation;
  simulation.stop();
  CONFIG.graph.snapAnimationMs = 0;
  graphRenderer.setSnapScale(100);
  graphRenderer.setSnapGrid("square");
  graphRenderer.setSnapEnabled(true);
  const node = simulation.nodes().find((n) => n.type === "material");
  graphRenderer.menu.entries(node, null).find((e) => e.label === "Pin position").run();
  const at = [node.fx, node.fy];

  simulation.alpha(1);
  for (let i = 0; i < 50; i++) simulation.tick();
  assert.deepEqual([node.x, node.y], at, "physics does not move it");

  graphRenderer.setForcePreset("spacious");
  assert.deepEqual([node.fx, node.fy], at, "a re-layout leaves it where it was pinned");

  graphRenderer.render(reactionFilter.getFilteredReactionsAdvanced({ reagents: ["fire"] }));
  const same = graphRenderer._simulation.nodes().find((n) => n.id === node.id);
  assert.equal(same.pinned, true, "still pinned after the graph is updated");
  assert.deepEqual([same.fx, same.fy], at);

  graphRenderer.setSnapScale(50);
  const cell = getSnapGrid("square", 50).nearest(same.fx, same.fy);
  assert.equal(same.pinned, true);
  assert.deepEqual([same.fx, same.fy], [cell.x, cell.y], "moved onto the resized grid, still pinned");
  graphRenderer._simulation.stop();
});

test("without a grid, a node can be pinned too", async () => {
  const { graphRenderer } = await setupDom();
  graphRenderer._simulation.stop();
  graphRenderer.setSnapEnabled(false);
  const node = graphRenderer._simulation.nodes()[0];
  const [x, y] = [node.x, node.y];
  graphRenderer.menu.entries(node, null).find((e) => e.label === "Pin position").run();
  assert.deepEqual([node.fx, node.fy], [x, y], "pinned where it is");
  graphRenderer._simulation.stop();
});

test("the grid backdrop is a canvas under the SVG, outside it (so never exported)", async () => {
  const { graphRenderer } = await setupDom();
  graphRenderer._simulation.stop();
  graphRenderer.setSnapGrid("hexagonal");
  graphRenderer.setSnapEnabled(true);
  const canvas = document.querySelector("canvas.snap-grid");
  assert.ok(canvas);
  assert.equal(canvas.closest("svg"), null);
  assert.equal(canvas.nextElementSibling?.tagName.toLowerCase(), "svg", "drawn below the graph");
  assert.equal(document.querySelector("svg .snap-grid, svg pattern#snap-grid-pattern"), null);
  graphRenderer._simulation.stop();
});

test("settling time sets d3's cooling rate, on the live layout and later ones, and persists", async () => {
  const { alphaDecayFor, SETTLE_SECONDS, clampSettleSeconds } = await import("../graph/forcePresets.js");
  // 5 s at 60 fps = 300 ticks to go from alpha 1 to 0.001: d3's own default decay.
  assert.ok(Math.abs(alphaDecayFor(5) - (1 - Math.pow(0.001, 1 / 300))) < 1e-12);
  assert.ok(alphaDecayFor(10) < alphaDecayFor(2), "longer settling = slower cooling");
  assert.equal(clampSettleSeconds(0), SETTLE_SECONDS.min);
  assert.equal(clampSettleSeconds(99), SETTLE_SECONDS.max);

  const { graphRenderer } = await setupDom();
  const simulation = graphRenderer._simulation;
  simulation.stop();
  assert.ok(Math.abs(simulation.alphaDecay() - alphaDecayFor(5)) < 1e-12, "default is 5 s");
  graphRenderer.setSettleSeconds(2);
  assert.ok(Math.abs(simulation.alphaDecay() - alphaDecayFor(2)) < 1e-12, "applies to the running layout");
  assert.equal(window.localStorage.getItem("noitalambic.graph.settleSeconds"), "2");
  graphRenderer.setForcePreset("compact");
  assert.ok(Math.abs(simulation.alphaDecay() - alphaDecayFor(2)) < 1e-12, "kept across a re-layout");
  // Ticks to stop, as d3 counts them, match the requested time.
  simulation.alpha(1);
  let ticks = 0;
  while (simulation.alpha() >= simulation.alphaMin()) { simulation.tick(); ticks++; }
  assert.ok(Math.abs(ticks - 120) <= 1, `2 s = ~120 ticks (got ${ticks})`);
  simulation.stop();
});

test("settling time 0: nothing simulates - nodes stay put (centered in view), re-layouts and updates don't move them", async () => {
  const { CONFIG } = await import("../config/config.js");
  const { getSnapGrid } = await import("../graph/gridSnap.js");
  const { graphRenderer, state, reactionFilter } = await setupDom("balanced");
  graphRenderer._simulation.stop();
  CONFIG.graph.snapAnimationMs = 0;
  graphRenderer.setSnapEnabled(false);
  graphRenderer.setSettleSeconds(0);
  assert.equal(window.localStorage.getItem("noitalambic.graph.settleSeconds"), "0");

  // A fresh graph with no settling: d3's seed spiral, put in the middle of the view.
  graphRenderer._teardown(document.getElementById("graphContainer"));
  graphRenderer.render(reactionFilter.getFilteredReactionsAdvanced({ reagents: ["fire"] }));
  const simulation = graphRenderer._simulation;
  const nodes = simulation.nodes();
  const width = Number(graphRenderer._svg.attr("width")), height = Number(graphRenderer._svg.attr("height"));
  const cx = nodes.reduce((t, n) => t + n.x, 0) / nodes.length, cy = nodes.reduce((t, n) => t + n.y, 0) / nodes.length;
  assert.ok(Math.abs(cx - width / 2) < 60 && Math.abs(cy - height / 2) < 60, "centered in the view");

  const positions = () => simulation.nodes().map((n) => `${n.id}:${n.x.toFixed(3)},${n.y.toFixed(3)}`).sort().join(" ");
  const before = positions();
  graphRenderer.setForcePreset("spacious");
  assert.equal(positions(), before, "a preset change does not re-lay out");
  state.showTagMaterials("[liquids]");
  graphRenderer.render(reactionFilter.getFilteredReactionsAdvanced({ reagents: ["fire"] }));
  const kept = new Map(before.split(" ").map((p) => p.split(":")));
  for (const node of graphRenderer._simulation.nodes()) {
    if (kept.has(node.id)) assert.equal(`${node.x.toFixed(3)},${node.y.toFixed(3)}`, kept.get(node.id), `${node.id} did not move`);
    assert.ok(Number.isFinite(node.x) && Number.isFinite(node.y), `${node.id} has a position`);
  }

  // A grid still applies, straight from where nodes are.
  graphRenderer.setSnapGrid("square");
  graphRenderer.setSnapEnabled(true);
  const grid = getSnapGrid("square");
  for (const node of graphRenderer._simulation.nodes()) {
    const cell = grid.nearest(node.x, node.y);
    assert.deepEqual([node.x, node.y], [cell.x, cell.y]);
  }
  graphRenderer.setSnapEnabled(false);
  graphRenderer.setSettleSeconds(5);
  graphRenderer._simulation.stop();
});

test("pause freezes the physics where it is (settling time kept); play lets the layout balance again", async () => {
  const { graphRenderer, reactionFilter } = await setupDom();
  const simulation = graphRenderer._simulation;
  simulation.stop();
  graphRenderer.setSettleSeconds(3);
  const positions = () => simulation.nodes().map((n) => `${n.id}:${n.x.toFixed(3)},${n.y.toFixed(3)}`).sort().join(" ");

  graphRenderer.setPaused(true);
  assert.equal(graphRenderer.paused, true);
  assert.equal(graphRenderer.settleSeconds, 3, "the settling time is untouched");
  const frozen = positions();
  graphRenderer.setForcePreset("spacious");
  graphRenderer.render(reactionFilter.getFilteredReactionsAdvanced({ reagents: ["fire"] }));
  assert.equal(positions(), frozen, "neither a re-layout nor an update moves anything while paused");

  graphRenderer.setPaused(false);
  assert.equal(graphRenderer.paused, false);
  assert.ok(graphRenderer._simulation.alpha() > 0.1, "play wakes the layout up");
  graphRenderer._simulation.stop();
  assert.equal(window.localStorage.getItem("noitalambic.graph.paused"), null, "pause isn't saved");
});
