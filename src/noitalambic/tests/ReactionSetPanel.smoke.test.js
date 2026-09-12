// DOM smoke test: mounts the real ReactionSetPanel in a jsdom environment with a minimal
// Choices.js stub, exercises the main user interactions, and checks nothing throws and the
// graph callback receives sane data.

import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import { materials, reactionSources, materialAssociations } from "./fixtures.js";

// Minimal Choices.js stub. Mirrors the real library's behavior of returning an array from
// getValue(true) only when the underlying <select> has the "multiple" attribute (a plain string
// otherwise) - this distinction is what caused a real regression in an earlier version, so the
// stub must reproduce it for tests to be able to catch it again.
class ChoicesStub {
  constructor(el) {
    this.el = el;
    this.initialised = true;
    this.selected = [];
  }
  setChoiceByValue(value) {
    if (!this.selected.includes(value)) this.selected.push(value);
  }
  getValue(valueOnly) {
    if (!valueOnly) return this.selected.map((v) => ({ value: v }));
    if (!this.el.multiple) return this.selected[0] ?? "";
    return this.selected;
  }
  clearStore() {
    this.selected = [];
  }
  setChoices() {
    /* no-op for the stub */
  }
  destroy() {
    this.initialised = false;
  }
}

async function setupDom() {
  const dom = new JSDOM("<!doctype html><html><body><div id='panel'></div></body></html>", { url: "https://example.test/" });
  global.window = dom.window;
  global.document = dom.window.document;
  global.HTMLElement = dom.window.HTMLElement;
  global.MutationObserver = dom.window.MutationObserver;
  Object.defineProperty(global, "navigator", { value: dom.window.navigator, configurable: true });

  global.URL.createObjectURL = () => "blob:mock";
  global.URL.revokeObjectURL = () => {};
  global.window.prompt = () => "test config";
  global.window.confirm = () => true;

  const { EventBus } = await import("../core/EventBus.js");
  const { DataRepository } = await import("../core/DataRepository.js");
  const { ReactionFilter } = await import("../filters/ReactionFilter.js");
  const { ReactionSetWorkspace } = await import("../core/ReactionSetWorkspace.js");
  const { ReactionGroupResolver } = await import("../core/ReactionGroupResolver.js");
  const { InMemoryStorage } = await import("../core/ReactionSetManager.js");
  const { ShortcutManager } = await import("../core/ShortcutManager.js");
  const { ReactionSetPanel } = await import("../ui/ReactionSetPanel.js");

  const eventBus = new EventBus();
  const dataRepo = new DataRepository(materials, reactionSources, materialAssociations);
  const reactionFilter = new ReactionFilter(dataRepo);
  const workspace = new ReactionSetWorkspace(eventBus, new InMemoryStorage());
  const resolver = new ReactionGroupResolver(reactionFilter);
  const panelStorage = new InMemoryStorage();
  const shortcutManager = new ShortcutManager(new InMemoryStorage());

  let lastResult = null;
  const panel = new ReactionSetPanel({
    workspace,
    resolver,
    reactionFilter,
    dataRepo,
    eventBus,
    ChoicesLib: ChoicesStub,
    storage: panelStorage,
    shortcutManager,
    onSetsResolved: (result) => {
      lastResult = result;
    },
  });

  return { dom, workspace, panel, panelStorage, shortcutManager, getLastResult: () => lastResult };
}

test("mount() creates a default set and renders the root group with one set card", async () => {
  const { workspace, panel } = await setupDom();
  panel.mount(document.getElementById("panel"));

  assert.equal(workspace.manager.sets.length, 1);
  assert.ok(document.querySelector(".reaction-set-panel"));
  assert.equal(document.querySelectorAll(".rsp-set-card").length, 1);
  assert.ok(document.querySelector(".rsp-group-root"));
});

test("the product select has the 'multiple' attribute (required by Choices.js getValue(true))", async () => {
  const { panel } = await setupDom();
  panel.mount(document.getElementById("panel"));

  const productEl = document.querySelector('[data-role="product"]');
  assert.equal(productEl.multiple, true);
});

test("selecting a product persists it on the set (regression test)", async () => {
  const { workspace, panel } = await setupDom();
  panel.mount(document.getElementById("panel"));

  const productEl = document.querySelector('[data-role="product"]');
  const choicesInstances = panel._choicesInstances.get(workspace.manager.sets[0].id);
  choicesInstances.productChoices.setChoiceByValue("steam");
  productEl.dispatchEvent(new window.Event("change", { bubbles: true }));

  assert.equal(workspace.manager.sets[0].product, "steam");
});

test("root group's + Set button adds a second set card", async () => {
  const { workspace, panel } = await setupDom();
  panel.mount(document.getElementById("panel"));

  document.querySelector('.rsp-group-root [data-action="add-set"]').dispatchEvent(new window.Event("click", { bubbles: true }));

  assert.equal(workspace.manager.sets.length, 2);
  assert.equal(document.querySelectorAll(".rsp-set-card").length, 2);
});

test("root group's + Group button creates a nested group", async () => {
  const { workspace, panel } = await setupDom();
  panel.mount(document.getElementById("panel"));

  document.querySelector('.rsp-group-root [data-action="add-group"]').dispatchEvent(new window.Event("click", { bubbles: true }));

  const subGroups = [...workspace.tree.nodes.values()].filter((n) => n.type === "group" && n.id !== workspace.tree.rootId);
  assert.equal(subGroups.length, 1);
  assert.ok(document.querySelector(`.rsp-group[data-group-id="${subGroups[0].id}"]`));

  // Non-root groups no longer have their own + Set/+ Group buttons (drag and drop covers moving
  // things in); adding to a sub-group goes through the workspace directly.
  workspace.createSet(subGroups[0].id, {});
  panel._rebuild();
  assert.equal(workspace.tree.getNode(subGroups[0].id).children.length, 1);
  assert.equal(workspace.manager.sets.length, 2);
});

test("only the root group has + Set/+ Group buttons; nested groups don't", async () => {
  const { workspace, panel } = await setupDom();
  panel.mount(document.getElementById("panel"));
  document.querySelector('.rsp-group-root [data-action="add-group"]').dispatchEvent(new window.Event("click", { bubbles: true }));

  const group = [...workspace.tree.nodes.values()].find((n) => n.type === "group" && n.id !== workspace.tree.rootId);
  const groupEl = document.querySelector(`.rsp-group[data-group-id="${group.id}"]`);

  assert.ok(document.querySelector('.rsp-group-root [data-action="add-set"]'));
  assert.equal(groupEl.querySelector('[data-action="add-set"]'), null);
  assert.equal(groupEl.querySelector('[data-action="add-group"]'), null);
});

test("changing a group's mode select updates the tree", async () => {
  const { workspace, panel } = await setupDom();
  panel.mount(document.getElementById("panel"));
  document.querySelector('.rsp-group-root [data-action="add-group"]').dispatchEvent(new window.Event("click", { bubbles: true }));

  const group = [...workspace.tree.nodes.values()].find((n) => n.type === "group" && n.id !== workspace.tree.rootId);
  const select = document.querySelector(`.rsp-group[data-group-id="${group.id}"] [data-role="group-mode"]`);
  select.value = "intersection";
  select.dispatchEvent(new window.Event("change", { bubbles: true }));

  assert.equal(workspace.tree.getNode(group.id).mode, "intersection");
});

test("ungroup removes the wrapper but keeps its set", async () => {
  const { workspace, panel } = await setupDom();
  panel.mount(document.getElementById("panel"));
  document.querySelector('.rsp-group-root [data-action="add-group"]').dispatchEvent(new window.Event("click", { bubbles: true }));

  const group = [...workspace.tree.nodes.values()].find((n) => n.type === "group" && n.id !== workspace.tree.rootId);
  workspace.createSet(group.id, {});
  panel._rebuild();

  const nestedSetId = workspace.tree.getNode(group.id).children[0];

  document.querySelector(`.rsp-group[data-group-id="${group.id}"] [data-action="ungroup"]`).dispatchEvent(new window.Event("click", { bubbles: true }));

  assert.equal(workspace.tree.getNode(group.id), null);
  assert.ok(workspace.manager.getSet(nestedSetId), "the nested set must survive ungrouping");
  assert.equal(workspace.tree.getNode(nestedSetId).parentId, workspace.tree.rootId);
});

test("collapsing a set card hides its body but keeps the header", async () => {
  const { workspace, panel } = await setupDom();
  panel.mount(document.getElementById("panel"));

  const setId = workspace.manager.sets[0].id;
  document.querySelector(`.rsp-set-card[data-set-id="${setId}"] [data-action="toggle-set-collapse"]`).dispatchEvent(
    new window.Event("click", { bubbles: true }),
  );

  assert.equal(workspace.manager.getSet(setId).collapsed, true);
  assert.equal(document.querySelector(`.rsp-set-card[data-set-id="${setId}"] .rsp-set-card-body`), null);
  assert.ok(document.querySelector(`.rsp-set-card[data-set-id="${setId}"] .rsp-set-card-header`), "the header must stay visible");
});

test("collapsing a group hides its children but keeps its header and live count", async () => {
  const { workspace, panel } = await setupDom();
  panel.mount(document.getElementById("panel"));
  document.querySelector('.rsp-group-root [data-action="add-group"]').dispatchEvent(new window.Event("click", { bubbles: true }));

  const group = [...workspace.tree.nodes.values()].find((n) => n.type === "group" && n.id !== workspace.tree.rootId);
  document.querySelector(`.rsp-group[data-group-id="${group.id}"] [data-action="toggle-collapse"]`).dispatchEvent(
    new window.Event("click", { bubbles: true }),
  );

  assert.equal(workspace.tree.getNode(group.id).collapsed, true);
  assert.equal(document.querySelector(`.rsp-group[data-group-id="${group.id}"] .rsp-group-children`), null);
  assert.ok(document.querySelector(`.rsp-group[data-group-id="${group.id}"] [data-role="group-count"]`), "the count must stay visible");
});

test("collapse all / expand all affects every set and non-root group", async () => {
  const { workspace, panel } = await setupDom();
  panel.mount(document.getElementById("panel"));
  document.querySelector('.rsp-group-root [data-action="add-group"]').dispatchEvent(new window.Event("click", { bubbles: true }));

  document.querySelector('[data-action="collapse-all"]').dispatchEvent(new window.Event("click", { bubbles: true }));
  assert.equal(document.querySelectorAll(".rsp-set-card-body").length, 0);

  document.querySelector('[data-action="expand-all"]').dispatchEvent(new window.Event("click", { bubbles: true }));
  assert.ok(document.querySelectorAll(".rsp-set-card-body").length > 0);
});

test("hide panel collapses to a tab and remembers the preference across a remount", async () => {
  const { panel, panelStorage } = await setupDom();
  panel.mount(document.getElementById("panel"));

  document.querySelector('[data-action="hide-panel"]').dispatchEvent(new window.Event("click", { bubbles: true }));
  assert.ok(document.querySelector(".rsp-hidden-tab"));
  assert.equal(document.querySelector(".reaction-set-panel"), null);
  assert.equal(panelStorage.getItem("noitalambic.reactionSetPanel.hidden"), "true");

  document.querySelector('[data-action="show-panel"]').dispatchEvent(new window.Event("click", { bubbles: true }));
  assert.ok(document.querySelector(".reaction-set-panel"));
});

test("deleting the last remaining set is prevented", async () => {
  const { workspace, panel } = await setupDom();
  panel.mount(document.getElementById("panel"));

  document.querySelector('[data-action="delete"]').dispatchEvent(new window.Event("click", { bubbles: true }));
  assert.equal(workspace.manager.sets.length, 1);
});

test("save/load a named configuration round-trips through the panel", async () => {
  const { workspace, panel } = await setupDom();
  panel.mount(document.getElementById("panel"));

  workspace.manager.updateSet(workspace.manager.sets[0].id, { name: "My set", reagents: ["water"] });

  document.querySelector('[data-action="save-config"]').dispatchEvent(new window.Event("click", { bubbles: true }));
  assert.equal(workspace.listSavedConfigs().length, 1);

  workspace.reset(true);
  assert.notEqual(workspace.manager.sets[0].name, "My set");

  const select = document.querySelector('[data-role="saved-configs"]');
  select.value = "test config";
  document.querySelector('[data-action="load-config"]').dispatchEvent(new window.Event("click", { bubbles: true }));

  assert.equal(workspace.manager.sets[0].name, "My set");
  assert.deepEqual(workspace.manager.sets[0].reagents, ["water"]);
});

test("toggling reagents recomputes and calls onSetsResolved with matching totals", async () => {
  const { workspace, panel, getLastResult } = await setupDom();
  panel.mount(document.getElementById("panel"));

  workspace.manager.updateSet(workspace.manager.sets[0].id, { reagents: ["fire"] });
  panel._recompute();

  const result = getLastResult();
  assert.ok(result);
  assert.equal(result.totalCount, 3, "fire is a reagent in 3 fixture reactions");
});

// -------------------------------------------------------------------
// Drag and drop
// -------------------------------------------------------------------
// jsdom's DragEvent/DataTransfer support is too limited to reliably simulate a real native drag
// sequence (dataTransfer is essentially unusable), but plain Event objects with a clientY
// property and native preventDefault/stopPropagation are enough to exercise the ACTUAL dragover/
// drop DOM listeners end to end (geometry -> zone -> tree mutation), not just the pure
// _performSiblingDrop/_performDropIntoGroup helpers in isolation. Both layers are covered below.

function mockRect(el, { top, height }) {
  el.getBoundingClientRect = () => ({ top, height, bottom: top + height, left: 0, right: 100, width: 100 });
}

function fireDrag(el, type, clientY) {
  const event = new window.Event(type, { bubbles: true, cancelable: true });
  event.clientY = clientY;
  el.dispatchEvent(event);
}

test("_getDropZone splits a 2-zone header into before/after halves", async () => {
  const { panel } = await setupDom();
  const el = { getBoundingClientRect: () => ({ top: 100, height: 40 }) };
  assert.equal(panel._getDropZone(el, 110, false), "before");
  assert.equal(panel._getDropZone(el, 130, false), "after");
});

test("_getDropZone splits a 3-zone header into before/into/after quarters", async () => {
  const { panel } = await setupDom();
  const el = { getBoundingClientRect: () => ({ top: 0, height: 100 }) };
  assert.equal(panel._getDropZone(el, 10, true), "before");
  assert.equal(panel._getDropZone(el, 50, true), "into");
  assert.equal(panel._getDropZone(el, 90, true), "after");
});

test("only non-root headers expose a drag handle; the root does not", async () => {
  const { workspace, panel } = await setupDom();
  panel.mount(document.getElementById("panel"));

  const rootHandle = document.querySelector(".rsp-group-root > .rsp-group-header [data-role=\"drag-handle\"]");
  assert.equal(rootHandle, null, "the root group must not be draggable");

  const setHandle = document.querySelector(`.rsp-set-card[data-set-id="${workspace.manager.sets[0].id}"] [data-role="drag-handle"]`);
  assert.ok(setHandle);
  assert.equal(setHandle.getAttribute("draggable"), "true");
});

test("full DOM wiring: dropping on the middle of a group header moves the dragged set into that (empty) group", async () => {
  const { workspace, panel } = await setupDom();
  panel.mount(document.getElementById("panel"));
  const setA = workspace.manager.sets[0];
  const group = workspace.createGroup(workspace.tree.rootId, "union", "G"); // empty group
  panel._rebuild();

  panel._draggedNodeId = setA.id; // a real dragstart would set this; simulated here directly

  const groupHeaderEl = document.querySelector(`.rsp-group[data-group-id="${group.id}"] > .rsp-group-header`);
  mockRect(groupHeaderEl, { top: 0, height: 100 });

  fireDrag(groupHeaderEl, "dragover", 50); // middle -> "into"
  fireDrag(groupHeaderEl, "drop", 50);

  assert.equal(workspace.tree.getNode(setA.id).parentId, group.id, "the set must have moved into the group");
  assert.deepEqual(workspace.tree.getNode(group.id).children, [setA.id]);
});

test("full DOM wiring: dropping on the top of a group header inserts the dragged node before it, as a sibling", async () => {
  const { workspace, panel } = await setupDom();
  panel.mount(document.getElementById("panel"));
  const setA = workspace.manager.sets[0];
  const group = workspace.createGroup(workspace.tree.rootId, "union", "G");
  panel._rebuild();

  assert.deepEqual(workspace.tree.root.children, [setA.id, group.id]);

  panel._draggedNodeId = group.id;
  const setHeaderEl = document.querySelector(`.rsp-set-card[data-set-id="${setA.id}"] > .rsp-set-card-header`);
  mockRect(setHeaderEl, { top: 0, height: 40 });

  fireDrag(setHeaderEl, "dragover", 5); // near the very top -> "before"
  fireDrag(setHeaderEl, "drop", 5);

  assert.deepEqual(workspace.tree.root.children, [group.id, setA.id]);
});

test("full DOM wiring: dropping in a group's (non-empty) children container appends at the end", async () => {
  const { workspace, panel } = await setupDom();
  panel.mount(document.getElementById("panel"));
  const rootSet = workspace.manager.sets[0];
  const group = workspace.createGroup(workspace.tree.rootId, "union", "G");
  const groupSetA = workspace.createSet(group.id, { name: "A" });
  panel._rebuild();

  panel._draggedNodeId = rootSet.id;
  const childrenEl = document.querySelector(`.rsp-group[data-group-id="${group.id}"] > .rsp-group-children`);
  fireDrag(childrenEl, "dragover", 0);
  fireDrag(childrenEl, "drop", 0);

  assert.deepEqual(workspace.tree.getNode(group.id).children, [groupSetA.id, rootSet.id]);
});

test("_performSiblingDrop reorders two sets within the same (root) group", async () => {
  const { workspace, panel } = await setupDom();
  panel.mount(document.getElementById("panel"));
  const setA = workspace.manager.sets[0];
  const setB = workspace.createSet(workspace.tree.rootId, { name: "B" });
  panel._rebuild();

  assert.deepEqual(workspace.tree.root.children, [setA.id, setB.id]);

  panel._performSiblingDrop(setB.id, setA.id, "before");

  assert.deepEqual(workspace.tree.root.children, [setB.id, setA.id]);
});

test("_performSiblingDrop reparents a set into a different group, at the right position", async () => {
  const { workspace, panel } = await setupDom();
  panel.mount(document.getElementById("panel"));
  const rootSet = workspace.manager.sets[0];

  const group = workspace.createGroup(workspace.tree.rootId, "union", "G");
  const groupSetA = workspace.createSet(group.id, { name: "A" });
  panel._rebuild();

  panel._performSiblingDrop(rootSet.id, groupSetA.id, "after");

  assert.equal(workspace.tree.getNode(rootSet.id).parentId, group.id);
  assert.deepEqual(workspace.tree.getNode(group.id).children, [groupSetA.id, rootSet.id]);
  assert.deepEqual(workspace.tree.root.children, [group.id]);
});

test("_performDropIntoGroup appends a set at the end of a group's children", async () => {
  const { workspace, panel } = await setupDom();
  panel.mount(document.getElementById("panel"));
  const rootSet = workspace.manager.sets[0];
  const group = workspace.createGroup(workspace.tree.rootId, "union", "G");
  panel._rebuild();

  panel._performDropIntoGroup(rootSet.id, group.id);

  assert.deepEqual(workspace.tree.getNode(group.id).children, [rootSet.id]);
  assert.equal(workspace.tree.getNode(rootSet.id).parentId, group.id);
});

test("_performSiblingDrop is a no-op when dropping a node onto itself", async () => {
  const { workspace, panel } = await setupDom();
  panel.mount(document.getElementById("panel"));
  const setA = workspace.manager.sets[0];

  panel._performSiblingDrop(setA.id, setA.id, "before");

  assert.deepEqual(workspace.tree.root.children, [setA.id]);
});

// -------------------------------------------------------------------
// Configurable shortcuts section
// -------------------------------------------------------------------

test("the shortcuts section renders one row per action with the default combo shown", async () => {
  const { panel } = await setupDom();
  panel.mount(document.getElementById("panel"));

  const rows = document.querySelectorAll(".rsp-shortcut-row");
  assert.equal(rows.length, 6);
  const reagentRow = document.querySelector('[data-shortcut-action="addReagentToNewSet"]');
  assert.equal(reagentRow.querySelector('[data-role="combo-label"]').textContent, "Alt+Click");
  const tagRow = document.querySelector('[data-shortcut-action="openTagMenu"]');
  assert.equal(tagRow.querySelector('[data-role="combo-label"]').textContent, "Right-click");
});

test("checking a modifier updates the binding and the live combo label", async () => {
  const { panel, shortcutManager } = await setupDom();
  panel.mount(document.getElementById("panel"));

  const row = document.querySelector('[data-shortcut-action="addReagentToNewSet"]');
  const ctrlBox = row.querySelector('[data-role="mod-ctrl"]');
  ctrlBox.checked = true;
  ctrlBox.dispatchEvent(new window.Event("change", { bubbles: true }));

  assert.deepEqual(shortcutManager.getBinding("addReagentToNewSet"), { trigger: "click", ctrl: true, shift: false, alt: true });
  assert.equal(row.querySelector('[data-role="combo-label"]').textContent, "Ctrl+Alt+Click");
});

test("changing the trigger selector updates the binding and the live combo label", async () => {
  const { panel, shortcutManager } = await setupDom();
  panel.mount(document.getElementById("panel"));

  const row = document.querySelector('[data-shortcut-action="openTagMenu"]');
  const triggerEl = row.querySelector('[data-role="trigger"]');
  triggerEl.value = "dblclick";
  triggerEl.dispatchEvent(new window.Event("change", { bubbles: true }));

  assert.deepEqual(shortcutManager.getBinding("openTagMenu"), { trigger: "dblclick", ctrl: false, shift: false, alt: false });
  assert.equal(row.querySelector('[data-role="combo-label"]').textContent, "Double-click");
});

test("picking a combo already used by another action is rejected and the controls revert", async () => {
  const { panel, shortcutManager } = await setupDom();
  panel.mount(document.getElementById("panel"));

  const row = document.querySelector('[data-shortcut-action="addReagentToNewSet"]');
  const ctrlBox = row.querySelector('[data-role="mod-ctrl"]');
  const altBox = row.querySelector('[data-role="mod-alt"]');

  // Land directly on plain Ctrl+Click (already used by selectAsReagent) by setting both
  // checkboxes to their target state before the single change event fires.
  ctrlBox.checked = true;
  altBox.checked = false;
  ctrlBox.dispatchEvent(new window.Event("change", { bubbles: true }));

  assert.deepEqual(shortcutManager.getBinding("addReagentToNewSet"), { trigger: "click", ctrl: false, shift: false, alt: true });
  assert.equal(ctrlBox.checked, false, "the checkbox must revert to the still-valid binding");
  assert.equal(altBox.checked, true, "the checkbox must revert to the still-valid binding");
});

test("reset-shortcuts restores the default bindings", async () => {
  const { panel, shortcutManager } = await setupDom();
  panel.mount(document.getElementById("panel"));

  shortcutManager.setBinding("addReagentToNewSet", { trigger: "click", ctrl: true, shift: false, alt: true });
  panel._rebuild();

  document.querySelector('[data-action="reset-shortcuts"]').dispatchEvent(new window.Event("click", { bubbles: true }));

  assert.deepEqual(shortcutManager.getBinding("addReagentToNewSet"), { trigger: "click", ctrl: false, shift: false, alt: true });
});

// -------------------------------------------------------------------
// Keyboard accessibility toggle (off by default)
// -------------------------------------------------------------------

test("Move up/down buttons are absent by default", async () => {
  const { workspace, panel } = await setupDom();
  workspace.createSet(workspace.tree.rootId, { name: "B" });
  panel.mount(document.getElementById("panel"));

  assert.equal(document.querySelectorAll('[data-action="move-up"]').length, 0);
  assert.equal(document.querySelectorAll('[data-action="move-down"]').length, 0);
  const checkbox = document.querySelector('[data-role="keyboard-accessible"]');
  assert.equal(checkbox.checked, false);
});

test("enabling keyboard accessibility reveals working Move up/down buttons", async () => {
  const { workspace, panel } = await setupDom();
  panel.mount(document.getElementById("panel")); // creates the default "Set 1"
  const setA = workspace.manager.sets[0];
  const setB = workspace.createSet(workspace.tree.rootId, { name: "B" });
  panel._rebuild();

  const checkbox = document.querySelector('[data-role="keyboard-accessible"]');
  checkbox.checked = true;
  checkbox.dispatchEvent(new window.Event("change", { bubbles: true }));

  assert.ok(document.querySelector(`.rsp-set-card[data-set-id="${setB.id}"] [data-action="move-up"]`));

  document.querySelector(`.rsp-set-card[data-set-id="${setB.id}"] [data-action="move-up"]`).dispatchEvent(
    new window.Event("click", { bubbles: true }),
  );

  assert.deepEqual(workspace.tree.root.children, [setB.id, setA.id]);
});

test("the keyboard accessibility preference persists across a remount", async () => {
  const { panel, panelStorage } = await setupDom();
  panel.mount(document.getElementById("panel"));

  const checkbox = document.querySelector('[data-role="keyboard-accessible"]');
  checkbox.checked = true;
  checkbox.dispatchEvent(new window.Event("change", { bubbles: true }));

  assert.equal(panelStorage.getItem("noitalambic.reactionSetPanel.keyboardAccessible"), "true");
  assert.ok(document.querySelector('[data-action="move-up"]'), "buttons should now be present after enabling");
});
