// DOM tests for the tag right-click context menu (GraphRenderer._showTagContextMenu and
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

  // The outside-click listener is attached on a deferred timer to avoid closing on the very
  // event that opened it.
  await new Promise((resolve) => setTimeout(resolve, 0));
  document.body.dispatchEvent(new window.Event("click", { bubbles: true }));

  assert.equal(document.querySelector('[role="menu"]'), null);
  assert.equal(state.visibleTagMaterials.has("water"), false);
});

test("right-clicking a material node does not open the tag menu (browser default is left alone)", async () => {
  await setupDom();

  const materialEl = document.querySelector(".material-node");
  assert.ok(materialEl);
  const event = fireEvent(materialEl, "contextmenu");

  assert.equal(document.querySelector('[role="menu"]'), null);
  assert.equal(event.defaultPrevented, false, "the native context menu must not be suppressed for materials");
});
