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
  const { ReactionSetPanel } = await import("../ui/ReactionSetPanel.js");

  const eventBus = new EventBus();
  const dataRepo = new DataRepository(materials, reactionSources, materialAssociations);
  const reactionFilter = new ReactionFilter(dataRepo);
  const workspace = new ReactionSetWorkspace(eventBus, new InMemoryStorage());
  const resolver = new ReactionGroupResolver(reactionFilter);
  const panelStorage = new InMemoryStorage();

  let lastResult = null;
  const panel = new ReactionSetPanel({
    workspace,
    resolver,
    reactionFilter,
    dataRepo,
    eventBus,
    ChoicesLib: ChoicesStub,
    storage: panelStorage,
    onSetsResolved: (result) => {
      lastResult = result;
    },
  });

  return { dom, workspace, panel, panelStorage, getLastResult: () => lastResult };
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

test("deleting the last remaining set clears it instead", async () => {
  const { workspace, panel } = await setupDom();
  panel.mount(document.getElementById("panel"));
  workspace.manager.updateSet(workspace.manager.sets[0].id, { reagents: ["water"] });

  document.querySelector('[data-action="delete"]').dispatchEvent(new window.Event("click", { bubbles: true }));
  assert.equal(workspace.manager.sets.length, 1);
  assert.deepEqual(workspace.manager.sets[0].reagents, []);
});

test("deleting the group holding every set starts over with one empty set", async () => {
  const { workspace, panel } = await setupDom();
  panel.mount(document.getElementById("panel"));
  const group = workspace.createGroup(workspace.tree.rootId);
  workspace.tree.moveNode(workspace.manager.sets[0].id, group.id);
  workspace.manager.updateSet(workspace.manager.sets[0].id, { reagents: ["water"] });
  panel.rebuild();

  document.querySelector(`.rsp-group[data-group-id="${group.id}"] [data-action="delete-group"]`)
    .dispatchEvent(new window.Event("click", { bubbles: true }));
  assert.equal(workspace.tree.getNode(group.id), null);
  assert.equal(workspace.manager.sets.length, 1);
  assert.deepEqual(workspace.manager.sets[0].reagents, []);
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
// jsdom has no layout and a barely usable DataTransfer, so rects are mocked and plain events with
// a clientY are dispatched: that drives the real delegated dragover/drop listeners end to end
// (pointer position -> target {parentId, index} -> indicator -> tree mutation).

function mockRect(el, top, height) {
  el.getBoundingClientRect = () => ({ top, height, bottom: top + height, left: 0, right: 300, width: 300 });
}

function fireDrag(el, type, clientY) {
  const event = new window.Event(type, { bubbles: true, cancelable: true });
  event.clientY = clientY;
  el.dispatchEvent(event);
  return event;
}

const card = (setId) => document.querySelector(`.rsp-set-card[data-set-id="${setId}"]`);
const groupEl = (groupId) => document.querySelector(`.rsp-group[data-group-id="${groupId}"]`);
const header = (groupId) => groupEl(groupId).querySelector(":scope > .rsp-group-header");

// Root header 0-30, then root children laid out from y=40, each `height` tall, 10 apart.
function layout(workspace, heights = {}) {
  mockRect(document.querySelector("#reactionSetTree"), 0, 1000);
  mockRect(header(workspace.tree.rootId), 0, 30);
  mockRect(groupEl(workspace.tree.rootId), 0, 1000);
  let y = 40;
  const place = (id) => {
    const el = card(id) ?? groupEl(id);
    const h = heights[id] ?? 60;
    mockRect(el, y, h);
    if (el.classList.contains("rsp-group")) {
      mockRect(header(id), y, 30);
      let inner = y + 40;
      (workspace.tree.getNode(id).collapsed ? [] : workspace.tree.getNode(id).children).forEach((childId) => {
        const childEl = card(childId) ?? groupEl(childId);
        mockRect(childEl, inner, 40);
        if (childEl.classList.contains("rsp-group")) mockRect(header(childId), inner, 30);
        inner += 50;
      });
    }
    y += h + 10;
  };
  workspace.tree.root.children.forEach(place);
}

async function mountWith(build) {
  const ctx = await setupDom();
  ctx.panel.mount(document.getElementById("panel"));
  const ids = build(ctx.workspace);
  ctx.panel._rebuild();
  layout(ctx.workspace, ids.heights);
  return { ...ctx, ...ids };
}

test("sets and groups (not the root) have a drag handle", async () => {
  const { workspace } = await mountWith((ws) => ({ group: ws.createGroup(ws.tree.rootId, "union", "G") }));
  assert.equal(document.querySelector('.rsp-group-root > .rsp-group-header [data-role="drag-handle"]'), null);
  assert.equal(card(workspace.manager.sets[0].id).querySelector('[data-role="drag-handle"]').getAttribute("draggable"), "true");
});

test("anywhere on a set card: upper half drops before it, lower half after it (its body included)", async () => {
  const { workspace, panel, a, b, c } = await mountWith((ws) => ({
    a: ws.manager.sets[0].id, b: ws.createSet(ws.tree.rootId, { name: "B" }).id, c: ws.createSet(ws.tree.rootId, { name: "C" }).id,
  }));
  // a: 40-100, b: 110-170, c: 180-240. Drag c onto the upper half of a.
  panel._draggedNodeId = c;
  fireDrag(card(a), "dragover", 50);
  fireDrag(card(a), "drop", 50);
  assert.deepEqual(workspace.tree.root.children, [c, a, b]);

  layout(workspace);
  // Now c: 40-100, a: 110-170, b: 180-240. Drag c onto the lower half (body area) of b: after b.
  panel._draggedNodeId = c;
  fireDrag(card(b).querySelector(".rsp-set-card-body") ?? card(b), "drop", 225);
  assert.deepEqual(workspace.tree.root.children, [a, b, c]);
});

test("a group's header: top part drops before the group, the rest into it; between children, at that gap", async () => {
  const { workspace, panel, set1, group, inner1, inner2 } = await mountWith((ws) => {
    const g = ws.createGroup(ws.tree.rootId, "union", "G");
    return { set1: ws.manager.sets[0].id, group: g.id, inner1: ws.createSet(g.id, { name: "I1" }).id, inner2: ws.createSet(g.id, { name: "I2" }).id, heights: { [g.id]: 150 } };
  });
  // set1: 40-100; group: 110-260, header 110-140, inner1 150-190, inner2 200-240.
  panel._draggedNodeId = set1;
  fireDrag(header(group), "drop", 200 - 85); // y=115: top 30% of the header -> before the group
  assert.deepEqual(workspace.tree.root.children, [set1, group], "already there: nothing moved");

  layout(workspace, { [group]: 150 });
  panel._draggedNodeId = set1;
  fireDrag(header(group), "drop", 135); // rest of the header -> into the (open) group, first
  assert.deepEqual(workspace.tree.getNode(group).children, [set1, inner1, inner2]);

  workspace.tree.moveNode(set1, workspace.tree.rootId, 0);
  panel._rebuild();
  layout(workspace, { [group]: 150 });
  panel._draggedNodeId = set1;
  fireDrag(groupEl(group), "drop", 195); // in the children area, between inner1 and inner2
  assert.deepEqual(workspace.tree.getNode(group).children, [inner1, set1, inner2]);
});

test("a folded group's header takes the node in at the end", async () => {
  const { workspace, panel, set1, group, inner } = await mountWith((ws) => {
    const g = ws.createGroup(ws.tree.rootId, "union", "G");
    const inner = ws.createSet(g.id, { name: "I" }).id;
    ws.tree.setCollapsed(g.id, true);
    return { set1: ws.manager.sets[0].id, group: g.id, inner };
  });
  panel._draggedNodeId = set1;
  fireDrag(header(group), "drop", 130);
  assert.deepEqual(workspace.tree.getNode(group).children, [inner, set1]);
});

test("a group can't be dropped into itself or its own descendants: no indicator, no move", async () => {
  const { workspace, panel, outer, nested, inner } = await mountWith((ws) => {
    const outer = ws.createGroup(ws.tree.rootId, "union", "Outer");
    const nested = ws.createGroup(outer.id, "union", "Nested");
    return { outer: outer.id, nested: nested.id, inner: ws.createSet(nested.id, { name: "I" }).id, heights: { [outer.id]: 200 } };
  });
  const before = JSON.stringify(workspace.tree.serialize());
  panel._draggedNodeId = outer;
  const over = fireDrag(header(nested), "dragover", 165);
  assert.equal(over.defaultPrevented, false, "the drop is refused");
  assert.equal(document.querySelector(".rsp-drop-line, .rsp-drop-into"), null);
  fireDrag(header(nested), "drop", 165);
  assert.equal(JSON.stringify(workspace.tree.serialize()), before);
  assert.ok(inner);
});

test("one indicator at a time, cleared on drop; dropping where a node already is rebuilds nothing", async () => {
  const { workspace, panel, a, b } = await mountWith((ws) => ({ a: ws.manager.sets[0].id, b: ws.createSet(ws.tree.rootId, { name: "B" }).id }));
  panel._draggedNodeId = b;
  fireDrag(card(a), "dragover", 50);
  assert.equal(document.querySelectorAll(".rsp-drop-line").length, 1, "an insertion line");
  fireDrag(card(a), "dragover", 52);
  assert.equal(document.querySelectorAll(".rsp-drop-line").length, 1, "still only one");

  // Lower half of a = right after a = where b already is: no indicator, nothing rebuilt.
  let rebuilds = 0;
  const original = panel._rebuild.bind(panel);
  panel._rebuild = () => { rebuilds++; original(); };
  const over = fireDrag(card(a), "dragover", 90);
  assert.equal(over.defaultPrevented, false);
  assert.equal(document.querySelector(".rsp-drop-line"), null);
  fireDrag(card(a), "drop", 90);
  assert.equal(rebuilds, 0);
  assert.deepEqual(workspace.tree.root.children, [a, b]);
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

test("excluded reactions are listed in the panel and can be restored one by one or all at once", async () => {
  const { workspace, panel, getLastResult } = await setupDom();
  const { reactions } = await import("./fixtures.js");
  panel.mount(document.getElementById("panel"));
  workspace.manager.updateSet(workspace.manager.sets[0].id, { reagents: ["fire"] });
  panel.rebuild();
  const all = getLastResult().totalCount;

  workspace.excludeReactions([reactions[0], reactions[2]]);
  panel.rebuild();
  assert.equal(getLastResult().totalCount, all - 2);
  const section = document.querySelector(".rsp-excluded");
  assert.ok(section);
  assert.match(section.querySelector("summary").textContent, /Excluded reactions\s+2 reactions/);
  assert.match(section.textContent, /Water \+ Fire → Steam|water \+ fire → steam/i);
  assert.match(document.querySelector("#rsp-summary").textContent, /2 excluded/);

  document.querySelector('[data-action="restore-reaction"]').dispatchEvent(new window.Event("click"));
  assert.equal(getLastResult().totalCount, all - 1);
  document.querySelector('[data-action="restore-all-reactions"]').dispatchEvent(new window.Event("click"));
  assert.equal(getLastResult().totalCount, all);
  assert.equal(document.querySelector(".rsp-excluded"), null, "nothing excluded, no section");
});
