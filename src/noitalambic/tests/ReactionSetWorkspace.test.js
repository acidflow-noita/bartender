import test from "node:test";
import assert from "node:assert/strict";

import { EventBus } from "../core/EventBus.js";
import { ReactionSetWorkspace } from "../core/ReactionSetWorkspace.js";
import { InMemoryStorage } from "../core/ReactionSetManager.js";

function buildWorkspace() {
  const eventBus = new EventBus();
  return { eventBus, workspace: new ReactionSetWorkspace(eventBus, new InMemoryStorage()) };
}

test("createSet adds both a set and a matching leaf in the tree", () => {
  const { workspace } = buildWorkspace();
  const set = workspace.createSet(workspace.tree.rootId, { name: "A" });

  assert.equal(workspace.manager.getSet(set.id).name, "A");
  assert.deepEqual(workspace.tree.root.children, [set.id]);
});

test("deleteSet removes both the set data and its leaf", () => {
  const { workspace } = buildWorkspace();
  const set = workspace.createSet();
  workspace.deleteSet(set.id);

  assert.equal(workspace.manager.getSet(set.id), null);
  assert.equal(workspace.tree.getNode(set.id), null);
});

test("duplicateSet adds the copy as a sibling leaf next to the original", () => {
  const { workspace } = buildWorkspace();
  const group = workspace.createGroup(workspace.tree.rootId, "union", "G");
  const original = workspace.createSet(group.id, { name: "Original" });

  const copy = workspace.duplicateSet(original.id);

  assert.notEqual(copy.id, original.id);
  assert.equal(workspace.tree.getNode(copy.id).parentId, group.id);
});

test("deleteGroup removes every set nested inside it", () => {
  const { workspace } = buildWorkspace();
  const group = workspace.createGroup(workspace.tree.rootId, "union", "G");
  const setA = workspace.createSet(group.id);
  const setB = workspace.createSet(group.id);

  workspace.deleteGroup(group.id);

  assert.equal(workspace.manager.getSet(setA.id), null);
  assert.equal(workspace.manager.getSet(setB.id), null);
  assert.equal(workspace.tree.getNode(group.id), null);
});

test("ungroup keeps the sets but removes the grouping wrapper", () => {
  const { workspace } = buildWorkspace();
  const group = workspace.createGroup(workspace.tree.rootId, "union", "G");
  const setA = workspace.createSet(group.id);

  workspace.ungroup(group.id);

  assert.ok(workspace.manager.getSet(setA.id), "the set itself must survive ungrouping");
  assert.equal(workspace.tree.getNode(setA.id).parentId, workspace.tree.rootId);
});

test("reset(true) clears everything and creates a single default set", () => {
  const { workspace } = buildWorkspace();
  workspace.createSet();
  workspace.createGroup();

  workspace.reset(true);

  assert.equal(workspace.manager.sets.length, 1);
  assert.equal(workspace.tree.root.children.length, 1);
});

test("collapseAll / expandAll toggle collapsed on every set and non-root group", () => {
  const { workspace } = buildWorkspace();
  const group = workspace.createGroup(workspace.tree.rootId, "union", "G");
  const set = workspace.createSet(group.id);

  workspace.collapseAll();
  assert.equal(workspace.manager.getSet(set.id).collapsed, true);
  assert.equal(workspace.tree.getNode(group.id).collapsed, true);
  assert.equal(workspace.tree.root.collapsed, false, "the root itself stays expanded");

  workspace.expandAll();
  assert.equal(workspace.manager.getSet(set.id).collapsed, false);
  assert.equal(workspace.tree.getNode(group.id).collapsed, false);
});

test("serialize / loadFromObject (v2) round-trip preserves sets and tree structure", () => {
  const { workspace } = buildWorkspace();
  const group = workspace.createGroup(workspace.tree.rootId, "intersection", "G");
  workspace.createSet(group.id, { name: "A", reagents: ["water"] });
  workspace.createSet(workspace.tree.rootId, { name: "B", product: "steam" });

  const serialized = workspace.serialize();

  const { workspace: workspace2 } = buildWorkspace();
  const ok = workspace2.loadFromObject(serialized);

  assert.equal(ok, true);
  assert.equal(workspace2.manager.sets.length, 2);
  assert.equal(workspace2.tree.getNode(group.id).mode, "intersection");
});

test("loadFromObject migrates a legacy v1 flat {combineMode, sets} payload into a root group", () => {
  const { workspace } = buildWorkspace();
  const legacyPayload = {
    version: 1,
    combineMode: "intersection",
    sets: [
      { id: "set_x", name: "X", reagents: ["water"], advancedFilters: {} },
      { id: "set_y", name: "Y", reagents: ["fire"], advancedFilters: {} },
    ],
  };

  const ok = workspace.loadFromObject(legacyPayload);

  assert.equal(ok, true);
  assert.equal(workspace.manager.sets.length, 2);
  assert.equal(workspace.tree.root.mode, "intersection");
  assert.equal(workspace.tree.root.children.length, 2);
  assert.ok(workspace.tree.root.children.includes("set_x"));
});

test("loadFromObject rejects malformed data", () => {
  const { workspace } = buildWorkspace();
  assert.equal(workspace.loadFromObject(null), false);
  assert.equal(workspace.loadFromObject({}), false);
  assert.equal(workspace.loadFromObject({ version: 2, tree: {}, sets: "nope" }), false);
});

test("URL param encode/decode round-trip", () => {
  const { workspace } = buildWorkspace();
  workspace.createSet(workspace.tree.rootId, { name: "A", reagents: ["water", "fire"] });
  const encoded = workspace.encodeToURLParam();

  const { workspace: workspace2 } = buildWorkspace();
  const ok = workspace2.loadFromURLParam(encoded);

  assert.equal(ok, true);
  assert.equal(workspace2.manager.sets.length, 1);
  assert.deepEqual(workspace2.manager.sets[0].reagents, ["water", "fire"]);
});

test("saveNamedConfig / listSavedConfigs / loadNamedConfig / deleteNamedConfig", () => {
  const { workspace } = buildWorkspace();
  workspace.createSet(workspace.tree.rootId, { name: "A" });

  assert.equal(workspace.saveNamedConfig("my config"), true);
  const list = workspace.listSavedConfigs();
  assert.equal(list.length, 1);
  assert.equal(list[0].name, "my config");

  const { workspace: workspace2 } = buildWorkspace();
  workspace2.storage = workspace.storage; // simulate the same browser storage
  const loaded = workspace2.loadNamedConfig("my config");
  assert.equal(loaded, true);
  assert.equal(workspace2.manager.sets[0].name, "A");

  workspace2.deleteNamedConfig("my config");
  assert.equal(workspace2.listSavedConfigs().length, 0);
});

test("seedFromLegacyParams only seeds when no sets exist yet", () => {
  const { workspace } = buildWorkspace();
  workspace.seedFromLegacyParams({ reagents: ["water"] });
  assert.equal(workspace.manager.sets.length, 1);

  workspace.seedFromLegacyParams({ reagents: ["fire"] });
  assert.equal(workspace.manager.sets.length, 1, "should not seed a second time");
});
