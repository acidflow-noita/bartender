// Multi-selection: a left-drag rectangle on the background selects nodes (Shift adds), a plain
// background click or Escape clears, a selected node drags its whole selection along, and the
// right button pans (no browser menu on the background). Real jsdom + d3 + data pipeline.

import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import { materials, reactionSources, materialAssociations } from "./fixtures.js";

async function setupDom() {
  const dom = new JSDOM("<!doctype html><html><body><div id='graphContainer'></div></body></html>", { url: "https://example.test/" });
  global.window = dom.window;
  global.document = dom.window.document;
  const { EventBus } = await import("../core/EventBus.js");
  const { DataRepository } = await import("../core/DataRepository.js");
  const { AppState } = await import("../core/AppState.js");
  const { ReactionFilter } = await import("../filters/ReactionFilter.js");
  const { GraphDataBuilder } = await import("../graph/GraphDataBuilder.js");
  const { GraphRenderer } = await import("../graph/GraphRenderer.js");
  const { ShortcutManager } = await import("../core/ShortcutManager.js");
  const { InMemoryStorage } = await import("../core/ReactionSetManager.js");
  const repo = new DataRepository(materials, reactionSources, materialAssociations);
  const renderer = new GraphRenderer(repo, new AppState(new EventBus(), repo), new GraphDataBuilder(repo), new ShortcutManager(new InMemoryStorage()));
  renderer.render(new ReactionFilter(repo).getFilteredReactionsAdvanced({ reagents: ["fire"] }));
  renderer._simulation.stop();
  return { renderer, svg: document.querySelector("svg") };
}

function mouse(target, type, { x = 0, y = 0, button = 0, shiftKey = false } = {}) {
  const event = new window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button, shiftKey });
  target.dispatchEvent(event);
  return event;
}

// Draws a selection rectangle from (x0, y0) to (x1, y1), in svg/screen coordinates.
function drawRectangle(svg, [x0, y0], [x1, y1], options = {}) {
  mouse(svg, "mousedown", { x: x0, y: y0, ...options });
  mouse(window, "mousemove", { x: (x0 + x1) / 2, y: (y0 + y1) / 2, ...options });
  mouse(window, "mousemove", { x: x1, y: y1, ...options });
  mouse(window, "mouseup", { x: x1, y: y1, ...options });
  mouse(svg, "click", { x: x1, y: y1, ...options });
}

test("a rectangle drawn on the background selects the nodes inside it, marked with a ring", async () => {
  const { renderer, svg } = await setupDom();
  const nodes = renderer._simulation.nodes();
  const xs = nodes.map((n) => n.x), ys = nodes.map((n) => n.y);
  drawRectangle(svg, [Math.min(...xs) - 5, Math.min(...ys) - 5], [Math.max(...xs) + 5, Math.max(...ys) + 5]);
  assert.equal(renderer.selectedNodes().length, nodes.length, "every node inside is selected");
  assert.equal(document.querySelectorAll(".selection-ring").length, nodes.length);
  assert.equal(document.querySelector(".selection-rectangle"), null, "the rectangle goes away on release");
});

test("Shift adds to the selection; a plain background click and Escape clear it", async () => {
  const { renderer, svg } = await setupDom();
  const [a, b] = [...renderer._simulation.nodes()].sort((p, q) => p.x - q.x);
  drawRectangle(svg, [a.x - 2, a.y - 2], [a.x + 2, a.y + 2]);
  assert.deepEqual(renderer.selectedNodes().map((n) => n.id), [a.id]);
  drawRectangle(svg, [b.x - 2, b.y - 2], [b.x + 2, b.y + 2], { shiftKey: true });
  assert.deepEqual(new Set(renderer.selectedNodes().map((n) => n.id)), new Set([a.id, b.id]));

  // A click without dragging clears.
  mouse(svg, "mousedown", { x: 1, y: 1 });
  mouse(window, "mouseup", { x: 1, y: 1 });
  assert.equal(renderer.selectedNodes().length, 0);

  drawRectangle(svg, [a.x - 2, a.y - 2], [a.x + 2, a.y + 2]);
  document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(renderer.selectedNodes().length, 0);
  assert.equal(document.querySelector(".selection-ring"), null);
});

test("dragging a selected node moves the whole selection, offsets kept; an unselected node moves alone", async () => {
  const { renderer } = await setupDom();
  const [a, b, c] = renderer._simulation.nodes();
  renderer.setSelection([a.id, b.id]);
  const group = renderer.selection.dragGroup(a);
  assert.deepEqual(new Set(group.map((g) => g.node.id)), new Set([a.id, b.id]));
  const ofB = group.find((g) => g.node === b);
  assert.deepEqual([ofB.dx, ofB.dy], [b.x - a.x, b.y - a.y]);
  assert.deepEqual(renderer.selection.dragGroup(c).map((g) => g.node.id), [c.id]);
});

test("a selected node's menu acts on the selection (pin / unpin / clear)", async () => {
  const { renderer } = await setupDom();
  const [a, b] = renderer._simulation.nodes();
  renderer.setSelection([a.id, b.id]);
  const labels = renderer.menu.entries(a, null).map((e) => e.label);
  assert.ok(labels.includes("Pin selected (2)") && labels.includes("Clear selection"));
  renderer.menu.entries(a, null).find((e) => e.label === "Pin selected (2)").run();
  assert.ok(a.pinned && b.pinned);
  renderer.menu.entries(a, null).find((e) => e.label === "Unpin selected (2)").run();
  assert.ok(!a.pinned && !b.pinned);
  renderer.menu.entries(a, null).find((e) => e.label === "Clear selection").run();
  assert.equal(renderer.selectedNodes().length, 0);
  renderer._simulation.stop();
});

test("the right button pans: no browser menu on the background, nodes keep their own", async () => {
  const { renderer, svg } = await setupDom();
  assert.equal(mouse(svg, "contextmenu", { button: 2 }).defaultPrevented, true);
  // With its menu unbound, a node leaves the native menu alone (the background handler skips it).
  renderer.shortcutManager.clearBinding("openReactionMenu");
  const reactionNode = [...document.querySelectorAll(".node")].find((el) => el.__data__.type === "reaction");
  assert.equal(mouse(reactionNode, "contextmenu", { button: 2 }).defaultPrevented, false);
});

test("right-clicking a reaction opens its menu: readable title, highlight, select with its materials, pin", async () => {
  const { renderer } = await setupDom();
  const reactionNode = [...document.querySelectorAll(".node")].find((el) => el.__data__.type === "reaction");
  const event = mouse(reactionNode, "contextmenu", { button: 2, x: 30, y: 30 });
  assert.equal(event.defaultPrevented, true);
  const menu = document.querySelector('[role="menu"]');
  assert.ok(menu);
  assert.match(menu.firstChild.textContent, / → /, "the title spells the reaction out");
  const labels = [...menu.querySelectorAll("button")].map((b) => b.firstChild.textContent);
  assert.deepEqual(labels, ["Highlight connections", "Select with its materials", "Pin position"]);

  [...menu.querySelectorAll("button")].find((b) => b.firstChild.textContent === "Select with its materials").dispatchEvent(new window.Event("click", { bubbles: true }));
  const reaction = reactionNode.__data__;
  const linked = renderer._simulation.force("link").links()
    .filter((l) => l.source === reaction || l.target === reaction).map((l) => (l.source === reaction ? l.target : l.source).id);
  assert.deepEqual(new Set(renderer.selectedNodes().map((n) => n.id)), new Set([reaction.id, ...linked]));
});

test("a reaction's menu offers 'Exclude' only when excluding is possible, for the selection too", async () => {
  const { renderer } = await setupDom();
  const reactions = renderer._simulation.nodes().filter((n) => n.type === "reaction");
  const labels = (node) => renderer.menu.entries(node, null).map((e) => e.label);
  assert.ok(!labels(reactions[0]).some((l) => l.startsWith("Exclude")), "classic mode: no sets, nothing to exclude from");

  const excluded = [];
  renderer.onExcludeReactions = (list) => excluded.push(list);
  renderer.menu.entries(reactions[0], null).find((e) => e.label === "Exclude this reaction").run();
  assert.deepEqual(excluded[0], [reactions[0].reaction]);

  renderer.setSelection(reactions.slice(0, 2).map((n) => n.id));
  renderer.menu.entries(reactions[0], null).find((e) => e.label === "Exclude selected reactions (2)").run();
  assert.deepEqual(excluded[1], reactions.slice(0, 2).map((n) => n.reaction));
});

test("Recenter fits every node (labels included) in the view, centered, never past 100%", async () => {
  const { renderer, svg } = await setupDom();
  const width = 800, height = 600;
  svg.setAttribute("width", width);
  svg.setAttribute("height", height);
  const nodes = renderer._simulation.nodes();
  nodes.forEach((n, i) => { n.x = 5000 + i * 300; n.y = -3000 + i * 50; });
  renderer.fitToView({ duration: 0 });
  const t = renderer._zoomTransform;
  for (const n of nodes) {
    const [sx, sy] = t.apply([n.x, n.y]);
    assert.ok(sx >= 0 && sx <= width && sy >= 0 && sy <= height, `${n.id} is in view`);
  }
  assert.ok(t.k <= 1);

  // A tiny graph is centered, not zoomed in.
  nodes.forEach((n, i) => { n.x = i; n.y = i; });
  renderer.fitToView({ duration: 0 });
  assert.equal(renderer._zoomTransform.k, 1);
});

// Real d3-drag gestures: mousedown on the node, then mousemove/mouseup on the window.
function gesture(nodeEl, moves) {
  const at = (type, target, [x, y]) => target.dispatchEvent(new window.MouseEvent(type, { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0 }));
  at("mousedown", nodeEl, [100, 100]);
  moves.forEach((point) => at("mousemove", window, point));
  at("mouseup", window, moves.at(-1) ?? [100, 100]);
}

test("a plain click on a node (no settling, grid on) leaves it where it is", async () => {
  const { CONFIG } = await import("../config/config.js");
  const { renderer } = await setupDom();
  CONFIG.graph.snapAnimationMs = 0;
  renderer.setSettleSeconds(0);
  renderer.setSnapGrid("square");
  renderer.setSnapEnabled(true);
  const nodeEl = [...document.querySelectorAll(".node")].find((el) => el.__data__.type === "material");
  const node = nodeEl.__data__;
  const before = [node.x, node.y];
  assert.notDeepEqual(before, [0, 0]);

  gesture(nodeEl, []);
  assert.deepEqual([node.x, node.y], before, "not teleported to (0, 0)");
  assert.ok(node.fx == null);
  renderer.setSnapEnabled(false);
  renderer.setSettleSeconds(5);
  renderer._simulation.stop();
});

test("a plain click doesn't wake the layout up; an actual drag does and moves the node", async () => {
  const { renderer } = await setupDom();
  const simulation = renderer._simulation;
  simulation.stop();
  simulation.alpha(0);
  const nodeEl = [...document.querySelectorAll(".node")].find((el) => el.__data__.type === "material");
  const node = nodeEl.__data__;

  gesture(nodeEl, []);
  assert.equal(simulation.alpha(), 0, "a click doesn't reheat the simulation");
  assert.ok(node.fx == null, "not grabbed");

  const start = [node.x, node.y];
  renderer.setSettleSeconds(0); // no ticking: positions are set by hand, easy to check
  gesture(nodeEl, [[130, 100], [160, 120]]);
  assert.ok(Math.abs(node.x - (start[0] + 60)) < 1e-9 && Math.abs(node.y - (start[1] + 20)) < 1e-9, "moved by the drag");
  assert.ok(node.fx == null, "released (not pinned) on drop");
  renderer.setSettleSeconds(5);
  simulation.stop();
});

test("a middle-button press on the graph doesn't trigger the browser's own action (autoscroll, paste)", async () => {
  const { svg } = await setupDom();
  assert.equal(mouse(svg, "mousedown", { button: 1 }).defaultPrevented, true);
  assert.equal(mouse(svg, "auxclick", { button: 1 }).defaultPrevented, true);
  assert.equal(document.querySelector(".selection-rectangle"), null, "and it draws no selection rectangle");
});
