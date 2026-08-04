import test from "node:test";
import assert from "node:assert/strict";

import { GraphRenderer } from "../graph/GraphRenderer.js";
import { ShortcutManager } from "../core/ShortcutManager.js";
import { InMemoryStorage } from "../core/ReactionSetManager.js";

// _handleNodeClick/_handleNodeContextMenu only touch this.state / this.shortcutManager /
// this.onQuickAddSet / this._showTagContextMenu before returning early on a match, so they can
// be exercised directly on a minimal fake "this" without needing a real DOM/d3 render.
function buildFakeThis(overrides) {
  return {
    state: {
      toggleTagVisibility: () => {},
      showTagMaterials: () => {},
      hideTagMaterials: () => {},
      selectProduct: () => false,
      selectReagent: () => false,
      eventBus: { emit: () => {} },
    },
    shortcutManager: null,
    onQuickAddSet: null,
    _highlightConnections: () => {},
    _showTagContextMenu: () => {},
    // Real prototype implementations by default, so tests only need to override the parts they
    // actually want to observe/stub.
    _openMaterialWiki: GraphRenderer.prototype._openMaterialWiki,
    _selectMaterialAsProduct: GraphRenderer.prototype._selectMaterialAsProduct,
    _selectMaterialAsReagent: GraphRenderer.prototype._selectMaterialAsReagent,
    ...overrides,
  };
}

function callHandleNodeClick(overrides, event, node) {
  return GraphRenderer.prototype._handleNodeClick.call(buildFakeThis(overrides), event, node, [], []);
}

function callHandleNodeContextMenu(overrides, event, node) {
  return GraphRenderer.prototype._handleNodeContextMenu.call(buildFakeThis(overrides), event, node);
}

function clickEvent({ ctrlKey = false, shiftKey = false, altKey = false, detail = 1 } = {}) {
  return { type: "click", ctrlKey, shiftKey, altKey, detail, stopPropagation: () => {}, preventDefault: () => {} };
}

function contextMenuEvent({ ctrlKey = false, shiftKey = false, altKey = false } = {}) {
  return { type: "contextmenu", ctrlKey, shiftKey, altKey, stopPropagation: () => {}, preventDefault: () => {} };
}

test("Alt+Click on a material triggers onQuickAddSet with role 'reagent'", () => {
  const shortcutManager = new ShortcutManager(new InMemoryStorage());
  let called = null;
  callHandleNodeClick(
    { shortcutManager, onQuickAddSet: (id, role) => (called = { id, role }) },
    clickEvent({ altKey: true }),
    { type: "material", id: "water" },
  );
  assert.deepEqual(called, { id: "water", role: "reagent" });
});

test("Alt+Shift+Click on a material triggers onQuickAddSet with role 'product'", () => {
  const shortcutManager = new ShortcutManager(new InMemoryStorage());
  let called = null;
  callHandleNodeClick(
    { shortcutManager, onQuickAddSet: (id, role) => (called = { id, role }) },
    clickEvent({ altKey: true, shiftKey: true }),
    { type: "material", id: "water" },
  );
  assert.deepEqual(called, { id: "water", role: "product" });
});

test("Ctrl+Click on a material now goes through the configurable selectAsReagent action", () => {
  const shortcutManager = new ShortcutManager(new InMemoryStorage());
  let quickAddCalled = false;
  let selectReagentCalled = false;
  callHandleNodeClick(
    {
      shortcutManager,
      onQuickAddSet: () => (quickAddCalled = true),
      state: {
        selectReagent: () => {
          selectReagentCalled = true;
          return true;
        },
        eventBus: { emit: () => {} },
      },
    },
    clickEvent({ ctrlKey: true }),
    { type: "material", id: "water" },
  );
  assert.equal(quickAddCalled, false, "the quick-add-to-new-set shortcut must not fire on plain Ctrl+Click");
  assert.equal(selectReagentCalled, true);
});

test("Shift+Click on a material goes through the configurable selectAsProduct action", () => {
  const shortcutManager = new ShortcutManager(new InMemoryStorage());
  let selectProductCalled = false;
  callHandleNodeClick(
    {
      shortcutManager,
      state: {
        selectProduct: () => {
          selectProductCalled = true;
          return true;
        },
        eventBus: { emit: () => {} },
      },
    },
    clickEvent({ shiftKey: true }),
    { type: "material", id: "water" },
  );
  assert.equal(selectProductCalled, true);
});

test("Ctrl+Shift+Click on a material opens the wiki via openMaterialWiki", () => {
  const shortcutManager = new ShortcutManager(new InMemoryStorage());
  let openedUrl = null;
  global.window = { open: (url) => (openedUrl = url) };

  callHandleNodeClick(
    { shortcutManager },
    clickEvent({ ctrlKey: true, shiftKey: true }),
    { type: "material", id: "water", material: { wikipage: "Water" } },
  );

  assert.match(openedUrl, /Water/);
});

test("without a shortcutManager configured, Alt+Click falls through to plain highlight (no crash)", () => {
  let highlightCalled = false;
  callHandleNodeClick(
    { _highlightConnections: () => (highlightCalled = true) },
    clickEvent({ altKey: true }),
    { type: "material", id: "water" },
  );
  assert.equal(highlightCalled, true);
});

test("without a shortcutManager configured, legacy Ctrl/Shift/Ctrl+Shift click combos still work", () => {
  let reagentCalled = false;
  callHandleNodeClick(
    { state: { selectReagent: () => ((reagentCalled = true), true), eventBus: { emit: () => {} } } },
    clickEvent({ ctrlKey: true }),
    { type: "material", id: "water" },
  );
  assert.equal(reagentCalled, true);
});

test("without a shortcutManager configured, double-click on a tag still toggles visibility (legacy fallback)", () => {
  let toggled = null;
  callHandleNodeClick(
    { state: { toggleTagVisibility: (id) => (toggled = id), eventBus: { emit: () => {} } } },
    clickEvent({ detail: 2 }),
    { type: "tag", id: "liquids" },
  );
  assert.equal(toggled, "liquids");
});

test("with a shortcutManager configured (default bindings), double-click on a tag no longer toggles - it falls through to highlight", () => {
  const shortcutManager = new ShortcutManager(new InMemoryStorage());
  let toggled = null;
  let highlightCalled = false;
  callHandleNodeClick(
    {
      shortcutManager,
      state: { toggleTagVisibility: (id) => (toggled = id), eventBus: { emit: () => {} } },
      _highlightConnections: () => (highlightCalled = true),
    },
    clickEvent({ detail: 2 }),
    { type: "tag", id: "liquids" },
  );
  assert.equal(toggled, null, "double-click must no longer toggle by default now that openTagMenu defaults to right-click");
  assert.equal(highlightCalled, true);
});

test("right-click (contextmenu) on a tag opens the tag menu by default", () => {
  const shortcutManager = new ShortcutManager(new InMemoryStorage());
  let menuOpenedFor = null;
  callHandleNodeContextMenu(
    { shortcutManager, _showTagContextMenu: (event, node) => (menuOpenedFor = node.id) },
    contextMenuEvent(),
    { type: "tag", id: "liquids" },
  );
  assert.equal(menuOpenedFor, "liquids");
});

test("right-click on a material does nothing special (lets the browser's native menu show)", () => {
  const shortcutManager = new ShortcutManager(new InMemoryStorage());
  let menuOpened = false;
  callHandleNodeContextMenu(
    { shortcutManager, _showTagContextMenu: () => (menuOpened = true) },
    contextMenuEvent(),
    { type: "material", id: "water" },
  );
  assert.equal(menuOpened, false);
});

test("reassigning openTagMenu to dblclick makes double-click open the menu instead of right-click", () => {
  const shortcutManager = new ShortcutManager(new InMemoryStorage());
  shortcutManager.setBinding("openTagMenu", { trigger: "dblclick", ctrl: false, shift: false, alt: false });

  let menuOpenedViaClick = null;
  callHandleNodeClick(
    { shortcutManager, _showTagContextMenu: (event, node) => (menuOpenedViaClick = node.id) },
    clickEvent({ detail: 2 }),
    { type: "tag", id: "liquids" },
  );
  assert.equal(menuOpenedViaClick, "liquids");

  let menuOpenedViaContextMenu = false;
  callHandleNodeContextMenu(
    { shortcutManager, _showTagContextMenu: () => (menuOpenedViaContextMenu = true) },
    contextMenuEvent(),
    { type: "tag", id: "liquids" },
  );
  assert.equal(menuOpenedViaContextMenu, false, "right-click must no longer open the menu once reassigned away from it");
});
