import test from "node:test";
import assert from "node:assert/strict";

import { GraphRenderer } from "../graph/GraphRenderer.js";
import { ConnectionHighlighter } from "../graph/ConnectionHighlighter.js";
import { ShortcutManager } from "../core/ShortcutManager.js";
import { InMemoryStorage } from "../core/ReactionSetManager.js";

// _handleNodeEvent only touches a few members of the renderer, so it is exercised on a minimal
// fake "this" that records which action ran, without a DOM or d3 render.
function buildRenderer(overrides = {}) {
  const calls = [];
  const fake = {
    shortcutManager: new ShortcutManager(new InMemoryStorage()),
    onQuickAddSet: (id, role) => calls.push(["quickAdd", id, role]),
    state: { toggleTagVisibility: (id) => calls.push(["toggle", id]) },
    _pendingClick: null,
    highlighter: { highlight: (node) => calls.push(["highlight", node.id]) },
    menu: { show: (event, node) => calls.push([node.type === "tag" ? "tagMenu" : "materialMenu", node.id, event.clientX]) },
    _openMaterialWiki: (node) => calls.push(["wiki", node.id]),
    _selectMaterialAsProduct: (node) => calls.push(["product", node.id]),
    _selectMaterialAsReagent: (node) => calls.push(["reagent", node.id]),
    _actionHandler: GraphRenderer.prototype._actionHandler,
    _cancelPendingClick: GraphRenderer.prototype._cancelPendingClick,
    ...overrides,
  };
  const dispatch = (event, node) => GraphRenderer.prototype._handleNodeEvent.call(fake, event, node, [], []);
  return { fake, calls, dispatch };
}

function event(type, { ctrlKey = false, shiftKey = false, altKey = false, detail = 1, clientX = 10 } = {}) {
  const e = { type, ctrlKey, shiftKey, altKey, detail, clientX, clientY: 20, defaultPrevented: false, stopped: false };
  e.preventDefault = () => (e.defaultPrevented = true);
  e.stopPropagation = () => (e.stopped = true);
  return e;
}

const material = { type: "material", id: "water" };
const tag = { type: "tag", id: "liquids" };

test("default material shortcuts run their action", () => {
  const cases = [
    [{ ctrlKey: true }, ["reagent", "water"]],
    [{ shiftKey: true }, ["product", "water"]],
    [{ ctrlKey: true, shiftKey: true }, ["wiki", "water"]],
    [{ altKey: true }, ["quickAdd", "water", "reagent"]],
    [{ shiftKey: true, altKey: true }, ["quickAdd", "water", "product"]],
  ];
  for (const [mods, expected] of cases) {
    const { calls, dispatch } = buildRenderer();
    dispatch(event("click", mods), material);
    assert.deepEqual(calls, [expected], JSON.stringify(mods));
  }
});

test("plain click highlights, and so does an unbound combo", () => {
  const { calls, dispatch } = buildRenderer();
  dispatch(event("click"), material);
  dispatch(event("click", { ctrlKey: true, altKey: true }), material);
  assert.deepEqual(calls, [["highlight", "water"], ["highlight", "water"]]);
});

test("the second click of an unbound double-click does not re-highlight", () => {
  const { calls, dispatch } = buildRenderer();
  dispatch(event("click", { detail: 1 }), material);
  dispatch(event("click", { detail: 2 }), material);
  assert.deepEqual(calls, [["highlight", "water"]]);
});

test("double-click on a tag toggles all its materials by default", () => {
  const { calls, dispatch } = buildRenderer();
  dispatch(event("click", { detail: 1 }), tag);
  dispatch(event("click", { detail: 2 }), tag);
  assert.deepEqual(calls, [["highlight", "liquids"], ["toggle", "liquids"]]);
});

test("material shortcuts do not fire on tags (actions are scoped by node type)", () => {
  const { calls, dispatch } = buildRenderer();
  dispatch(event("click", { ctrlKey: true }), tag);
  assert.deepEqual(calls, [["highlight", "liquids"]]);
});

test("right-click on a tag opens its menu and suppresses the native menu", () => {
  const { calls, dispatch } = buildRenderer();
  const e = event("contextmenu", { clientX: 42 });
  dispatch(e, tag);
  assert.deepEqual(calls, [["tagMenu", "liquids", 42]]);
  assert.equal(e.defaultPrevented, true);
});

test("right-click on a material opens its actions menu by default", () => {
  const { calls, dispatch } = buildRenderer();
  const e = event("contextmenu");
  dispatch(e, material);
  assert.deepEqual(calls, [["materialMenu", "water", 10]]);
  assert.equal(e.defaultPrevented, true);
});

test("right-click with nothing bound leaves the native menu alone", () => {
  const { fake, calls, dispatch } = buildRenderer();
  fake.shortcutManager.clearBinding("openMaterialMenu");
  const e = event("contextmenu");
  dispatch(e, material);
  assert.deepEqual(calls, []);
  assert.equal(e.defaultPrevented, false);
});

test("a material action bound to right-click works (previously ignored)", () => {
  const { fake, calls, dispatch } = buildRenderer();
  fake.shortcutManager.setBinding("openMaterialWiki", "RightClick");
  const e = event("contextmenu");
  dispatch(e, material);
  assert.deepEqual(calls, [["wiki", "water"]]);
  assert.equal(e.defaultPrevented, true);
});

test("rebinding the tag menu to double-click swaps it with the toggle", () => {
  const { fake, calls, dispatch } = buildRenderer();
  fake.shortcutManager.setBinding("openTagMenu", "DoubleClick");
  dispatch(event("contextmenu"), tag);
  dispatch(event("click", { detail: 1 }), tag);
  dispatch(event("click", { detail: 2 }), tag);
  assert.deepEqual(calls, [["toggle", "liquids"], ["highlight", "liquids"], ["tagMenu", "liquids", 10]]);
});

test("quick-add shortcuts are no-ops without an onQuickAddSet callback", () => {
  const { calls, dispatch } = buildRenderer({ onQuickAddSet: null });
  dispatch(event("click", { altKey: true }), material);
  assert.deepEqual(calls, []);
});

test("a single click waits when the same modifiers are also bound to a double-click", async () => {
  const { fake, calls, dispatch } = buildRenderer();
  fake.shortcutManager.setBinding("openMaterialWiki", "Ctrl+DoubleClick");

  // Real double-click: only the double-click action runs.
  dispatch(event("click", { ctrlKey: true, detail: 1 }), material);
  dispatch(event("click", { ctrlKey: true, detail: 2 }), material);
  await new Promise((resolve) => setTimeout(resolve, GraphRenderer.DOUBLE_CLICK_DELAY + 50));
  assert.deepEqual(calls, [["wiki", "water"]]);

  // Lone click: the single-click action runs after the delay.
  calls.length = 0;
  dispatch(event("click", { ctrlKey: true, detail: 1 }), material);
  assert.deepEqual(calls, []);
  await new Promise((resolve) => setTimeout(resolve, GraphRenderer.DOUBLE_CLICK_DELAY + 50));
  assert.deepEqual(calls, [["reagent", "water"]]);
});

test("withoutHighlight clears the current highlight for fn() and restores it after, even if fn throws", () => {
  const log = [];
  const fake = {
    current: null,
    reset() {
      this.current = null;
      log.push("reset");
    },
    highlight(node, allNodes, linkArray) {
      this.current = { node, allNodes, linkArray };
      log.push(`highlight:${node.id}`);
    },
  };
  const withoutHighlight = (fn) => ConnectionHighlighter.prototype.without.call(fake, fn);

  assert.equal(withoutHighlight(() => "plain"), "plain");
  assert.deepEqual(log, [], "nothing highlighted: nothing to undo");

  fake.current = { node: material, allNodes: [], linkArray: [] };
  assert.throws(() => withoutHighlight(() => {
    log.push(`during:${fake.current}`);
    throw new Error("boom");
  }));
  assert.deepEqual(log, ["reset", "during:null", "highlight:water"]);
  assert.equal(fake.current.node, material);
});
