// DOM tests for the node right-click context menus (GraphRenderer._showNodeContextMenu and
// friends), using the same real jsdom + d3 + data pipeline setup as
// GraphRenderer.incrementalUpdate.test.js.

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
  const { ShortcutManager } = await import("../core/ShortcutManager.js");
  const { InMemoryStorage } = await import("../core/ReactionSetManager.js");

  const eventBus = new EventBus();
  const dataRepo = new DataRepository(materials, reactionSources, materialAssociations);
  const state = new AppState(eventBus, dataRepo);
  const reactionFilter = new ReactionFilter(dataRepo);
  const graphDataBuilder = new GraphDataBuilder(dataRepo);
  const shortcutManager = new ShortcutManager(new InMemoryStorage());
  const graphRenderer = new GraphRenderer(dataRepo, state, graphDataBuilder, shortcutManager, () => {});

  // reagents=["fire"] includes fixture reaction 4 ([liquids] + fire -> steam), which brings a
  // "[liquids]" tag node into the graph.
  graphRenderer.render(reactionFilter.getFilteredReactionsAdvanced({ reagents: ["fire"] }));

  return { graphRenderer, state, shortcutManager };
}

function fireEvent(el, type, extra = {}) {
  const event = new window.Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { ctrlKey: false, shiftKey: false, altKey: false, clientX: 50, clientY: 50, ...extra });
  el.dispatchEvent(event);
  return event;
}

function findTagNodeGroup() {
  return document.querySelector(".tag-node");
}

test("right-clicking a tag node opens a menu with explicit show/hide actions", async () => {
  await setupDom();

  const tagEl = findTagNodeGroup();
  assert.ok(tagEl, "expected a tag node to be present in the graph");

  fireEvent(tagEl, "contextmenu");

  const menu = document.querySelector('[role="menu"]');
  assert.ok(menu, "a context menu should have been added to the document");
  const buttons = [...menu.querySelectorAll("button")].map((b) => b.textContent);
  assert.ok(buttons.includes("Show all materials"));
  assert.ok(buttons.includes("Hide all materials"));
});

test("clicking 'Show all materials' makes every material of that tag visible and closes the menu", async () => {
  const { state } = await setupDom();

  const tagEl = findTagNodeGroup();
  fireEvent(tagEl, "contextmenu");

  const menu = document.querySelector('[role="menu"]');
  const showButton = [...menu.querySelectorAll("button")].find((b) => b.textContent === "Show all materials");
  showButton.dispatchEvent(new window.Event("click", { bubbles: true }));

  assert.ok(state.visibleTagMaterials.has("water"));
  assert.ok(state.visibleTagMaterials.has("oil"));
  assert.equal(document.querySelector('[role="menu"]'), null, "the menu should close after choosing an action");
});

test("'Hide all materials' can always close a tag that was previously opened", async () => {
  const { state } = await setupDom();
  state.showTagMaterials("[liquids]");
  assert.ok(state.visibleTagMaterials.has("water"));

  const tagEl = findTagNodeGroup();
  fireEvent(tagEl, "contextmenu");
  const menu = document.querySelector('[role="menu"]');
  const hideButton = [...menu.querySelectorAll("button")].find((b) => b.textContent === "Hide all materials");
  hideButton.dispatchEvent(new window.Event("click", { bubbles: true }));

  assert.equal(state.visibleTagMaterials.has("water"), false);
  assert.equal(state.visibleTagMaterials.has("oil"), false);
});

test("clicking outside the menu closes it without changing anything", async () => {
  const { state } = await setupDom();

  const tagEl = findTagNodeGroup();
  fireEvent(tagEl, "contextmenu");
  assert.ok(document.querySelector('[role="menu"]'));

  // A click reaching the document on release (Firefox/Linux open the menu on mouse down) must
  // not close it; only a new press outside does.
  await new Promise((resolve) => setTimeout(resolve, 0));
  document.body.dispatchEvent(new window.Event("click", { bubbles: true }));
  assert.ok(document.querySelector('[role="menu"]'), "release click must not close the menu");

  document.body.dispatchEvent(new window.Event("pointerdown", { bubbles: true }));

  assert.equal(document.querySelector('[role="menu"]'), null);
  assert.equal(state.visibleTagMaterials.has("water"), false);
});

test("Escape closes the menu", async () => {
  await setupDom();
  fireEvent(findTagNodeGroup(), "contextmenu");
  document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(document.querySelector('[role="menu"]'), null);
});

test("right-clicking a material node opens its actions menu, listing each action with its shortcut", async () => {
  const { graphRenderer } = await setupDom();
  const picked = [];
  graphRenderer._selectMaterialAsProduct = (node) => picked.push(node.id);

  const materialEl = document.querySelector(".material-node");
  assert.ok(materialEl);
  const event = fireEvent(materialEl, "contextmenu");

  const menu = document.querySelector('[role="menu"]');
  assert.ok(menu, "a context menu should have been added to the document");
  assert.equal(event.defaultPrevented, true);
  const items = [...menu.querySelectorAll("button")];
  const labelOf = (b) => b.firstChild.textContent;
  assert.ok(items.some((b) => labelOf(b) === "Set as reagent" && b.querySelector(".context-menu-shortcut")?.textContent === "Ctrl+Click"));
  assert.ok(items.some((b) => labelOf(b) === "Set as product"));
  assert.ok(items.some((b) => labelOf(b) === "Open wiki page"));
  assert.ok(!items.some((b) => labelOf(b) === "Open actions menu"), "the menu does not list itself");
  assert.ok(!items.some((b) => labelOf(b).includes("all materials")), "tag entries are not shown for materials");

  const materialId = materialEl.__data__.id;
  items.find((b) => labelOf(b) === "Set as product").dispatchEvent(new window.Event("click", { bubbles: true }));
  assert.equal(document.querySelector('[role="menu"]'), null, "running an entry closes the menu");
  assert.deepEqual(picked, [materialId]);
});

test("the material menu leaves out set actions when there are no sets (classic mode)", async () => {
  const { graphRenderer } = await setupDom();
  graphRenderer.onQuickAddSet = null;
  const materialEl = document.querySelector(".material-node");
  fireEvent(materialEl, "contextmenu");
  const labels = [...document.querySelectorAll('[role="menu"] button')].map((b) => b.firstChild.textContent);
  assert.ok(!labels.some((l) => l.includes("new set")));
});

test("in fullscreen the menu is attached inside the fullscreen element (otherwise it is not rendered)", async () => {
  await setupDom();
  const fullscreenHost = document.body.appendChild(document.createElement("div"));
  Object.defineProperty(document, "fullscreenElement", { value: fullscreenHost, configurable: true });
  try {
    fireEvent(findTagNodeGroup(), "contextmenu");
    const menu = document.querySelector('[role="menu"]');
    assert.ok(menu);
    assert.equal(menu.parentElement, fullscreenHost);

    document.dispatchEvent(new window.Event("fullscreenchange"));
    assert.equal(document.querySelector('[role="menu"]'), null, "leaving fullscreen closes the menu");
  } finally {
    delete document.fullscreenElement;
  }
});
