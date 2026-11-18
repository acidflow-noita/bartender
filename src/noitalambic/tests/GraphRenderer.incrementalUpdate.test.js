// Targeted tests for the incremental-update rewrite of GraphRenderer.render(): the core claim
// being guarded is that nodes/links persisting across two render() calls keep their exact DOM
// element (and simulated position) instead of the whole graph being torn down and rebuilt, which
// is what used to make every change visibly "reload" the graph. Uses the real d3 (installed as a
// dev dependency for tests only - the app itself loads it from a CDN <script> tag) and the real
// data pipeline (DataRepository/ReactionFilter/GraphDataBuilder/AppState) against the shared
// fixtures, so this exercises actual rendering code, not a mock of it.

import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import { materials, reactionSources, materialAssociations } from "./fixtures.js";

async function setupDom() {
  const dom = new JSDOM("<!doctype html><html><body><div id='graphContainer'></div></body></html>", {
    url: "https://example.test/",
  });
  global.window = dom.window;
  global.document = dom.window.document;
  global.d3 = await import("d3");

  const { EventBus } = await import("../core/EventBus.js");
  const { DataRepository } = await import("../core/DataRepository.js");
  const { AppState } = await import("../core/AppState.js");
  const { ReactionFilter } = await import("../filters/ReactionFilter.js");
  const { GraphDataBuilder } = await import("../graph/GraphDataBuilder.js");
  const { GraphRenderer } = await import("../graph/GraphRenderer.js");

  const eventBus = new EventBus();
  const dataRepo = new DataRepository(materials, reactionSources, materialAssociations);
  const state = new AppState(eventBus, dataRepo);
  const reactionFilter = new ReactionFilter(dataRepo);
  const graphDataBuilder = new GraphDataBuilder(dataRepo);
  const graphRenderer = new GraphRenderer(dataRepo, state, graphDataBuilder);

  return { graphRenderer, reactionFilter };
}

function filteredEntries(reactionFilter, reagents) {
  return reactionFilter.getFilteredReactionsAdvanced({ reagents });
}

function nodesById(nodeSelection) {
  const map = new Map();
  nodeSelection.each(function (d) {
    map.set(d.id, this);
  });
  return map;
}

test("a second render() with overlapping data reuses the same <svg>, not a fresh one", async () => {
  const { graphRenderer, reactionFilter } = await setupDom();

  graphRenderer.render(filteredEntries(reactionFilter, ["fire"])); // {0,2,4}
  const svgAfterFirst = document.querySelector("#graphContainer svg");
  assert.ok(svgAfterFirst);

  graphRenderer.render(filteredEntries(reactionFilter, ["water"])); // {0,1,4}, overlaps on 0 and 4
  const svgAfterSecond = document.querySelector("#graphContainer svg");

  assert.equal(svgAfterSecond, svgAfterFirst, "the same <svg> element must be reused, not recreated");
});

test("nodes present in both renders keep the exact same DOM element (no reload/jump)", async () => {
  const { graphRenderer, reactionFilter } = await setupDom();

  graphRenderer.render(filteredEntries(reactionFilter, ["fire"]));
  const before = nodesById(graphRenderer._nodeSelection);

  graphRenderer.render(filteredEntries(reactionFilter, ["water"]));
  const after = nodesById(graphRenderer._nodeSelection);

  const commonIds = [...before.keys()].filter((id) => after.has(id));
  assert.ok(commonIds.length > 0, "expected at least one node to persist between the two filters");

  commonIds.forEach((id) => {
    assert.equal(after.get(id), before.get(id), `node "${id}" should keep the same DOM element across renders`);
  });
});

test("a node no longer in the new result is actually removed from the DOM", async () => {
  const { graphRenderer, reactionFilter } = await setupDom();

  graphRenderer.render(filteredEntries(reactionFilter, ["fire"])); // includes reaction 2 (oil+fire), not matched by water
  const before = nodesById(graphRenderer._nodeSelection);
  assert.ok(before.has("reaction_2"));

  graphRenderer.render(filteredEntries(reactionFilter, ["water"])); // {0,1,4}: no reaction 2
  const after = nodesById(graphRenderer._nodeSelection);

  assert.equal(after.has("reaction_2"), false);
  // The old element must be gone from the live document too, not just absent from the new selection.
  assert.equal(document.querySelectorAll(".node").length, after.size, "stale nodes must not linger in the DOM");
});

test("a brand new node absent from the first render is created on the second", async () => {
  const { graphRenderer, reactionFilter } = await setupDom();

  graphRenderer.render(filteredEntries(reactionFilter, ["fire"])); // {0,2,4}: no reaction 1 (fungus+water)
  const before = nodesById(graphRenderer._nodeSelection);
  assert.equal(before.has("reaction_1"), false);

  graphRenderer.render(filteredEntries(reactionFilter, ["water"])); // {0,1,4}: includes reaction 1
  const after = nodesById(graphRenderer._nodeSelection);

  assert.ok(after.has("reaction_1"), "a genuinely new node must still be created");
});

test("persisting nodes keep their simulated position (no snap back to a fresh start)", async () => {
  const { graphRenderer, reactionFilter } = await setupDom();

  graphRenderer.render(filteredEntries(reactionFilter, ["fire"]));
  const before = nodesById(graphRenderer._nodeSelection);

  // Manually move a node, as the force simulation would over time, then confirm render() does
  // not reset it back to a fresh starting position.
  const anyId = [...before.keys()][0];
  const nodeBefore = graphRenderer._nodesById.get(anyId);
  nodeBefore.x = 123.45;
  nodeBefore.y = 67.89;

  graphRenderer.render(filteredEntries(reactionFilter, ["water"]));

  if (graphRenderer._nodesById.has(anyId)) {
    const nodeAfter = graphRenderer._nodesById.get(anyId);
    assert.equal(nodeAfter.x, 123.45);
    assert.equal(nodeAfter.y, 67.89);
  }
});

test("going to zero results tears the graph down, and a later non-empty render rebuilds it", async () => {
  const { graphRenderer, reactionFilter } = await setupDom();

  graphRenderer.render(filteredEntries(reactionFilter, ["fire"]));
  assert.ok(document.querySelector("#graphContainer svg"));

  graphRenderer.render([]);
  assert.equal(document.querySelector("#graphContainer svg"), null);
  assert.match(document.getElementById("graphContainer").textContent, /No reactions found/);

  graphRenderer.render(filteredEntries(reactionFilter, ["fire"]));
  assert.ok(document.querySelector("#graphContainer svg"), "the graph must be rebuilt after recovering from empty");
});

test("toggling a material's highlight (selected reagent) updates a persisting node without recreating it", async () => {
  const { graphRenderer, reactionFilter } = await setupDom();

  graphRenderer.render(filteredEntries(reactionFilter, ["fire"]));
  const waterEl = nodesById(graphRenderer._nodeSelection).get("water");
  assert.ok(waterEl);

  graphRenderer.state.selectedReagents = ["water"];
  graphRenderer.render(filteredEntries(reactionFilter, ["fire"])); // same result set, selection changed

  const waterElAfter = nodesById(graphRenderer._nodeSelection).get("water");
  assert.equal(waterElAfter, waterEl, "the node itself must not be recreated");

  const highlightStroke = d3.select(waterElAfter).select("circle.material-highlight").attr("stroke");
  assert.notEqual(highlightStroke, "transparent", "the highlight ring must reflect the new selection");
});

test("links between persisting nodes are not stuck: they track fresh positions after other nodes change", async () => {
  const { graphRenderer, reactionFilter } = await setupDom();

  graphRenderer.render(filteredEntries(reactionFilter, ["fire"])); // {0,2,4}
  graphRenderer.render(filteredEntries(reactionFilter, ["water"])); // {0,1,4} - reaction_0 persists in both

  // Find a link-group connected to the persisting "reaction_0" node. Uses a plain DOM query
  // (not d3's .select()) to locate the <line>, since calling .select() on it would itself have
  // the side effect of refreshing its bound datum and mask the very bug being tested for.
  let targetLineEl = null;
  let persistingNodeId = null;
  let persistingIsSource = null;
  graphRenderer._linkGroupSelection.each(function (d) {
    if (targetLineEl) return;
    if (d.source.id === "reaction_0" || d.target.id === "reaction_0") {
      targetLineEl = this.querySelector("line");
      persistingIsSource = d.source.id === "reaction_0";
      persistingNodeId = "reaction_0";
    }
  });
  assert.ok(targetLineEl, "expected to find a link connected to the persisting reaction_0 node");

  // Move the persisting node, exactly like the force simulation naturally would once other
  // nodes are added or removed and it reheats.
  const liveNode = graphRenderer._nodesById.get(persistingNodeId);
  liveNode.x = 999;
  liveNode.y = 888;

  graphRenderer._onTick();

  const actualX = parseFloat(targetLineEl.getAttribute(persistingIsSource ? "x1" : "x2"));
  const actualY = parseFloat(targetLineEl.getAttribute(persistingIsSource ? "y1" : "y2"));

  assert.equal(actualX, 999, "the line must track the node's current (live) position, not a stale/frozen one");
  assert.equal(actualY, 888);
});
