import test from "node:test";
import assert from "node:assert/strict";

import { EventBus } from "../core/EventBus.js";
import { ReactionGroupTree } from "../core/ReactionGroupTree.js";

function buildTree() {
  const eventBus = new EventBus();
  return { eventBus, tree: new ReactionGroupTree(eventBus) };
}

test("a fresh tree has only the root group, empty", () => {
  const { tree } = buildTree();
  assert.equal(tree.root.type, "group");
  assert.equal(tree.root.id, tree.rootId);
  assert.deepEqual(tree.root.children, []);
});

test("addLeaf inserts a leaf under the given group (default: root)", () => {
  const { tree } = buildTree();
  const leaf = tree.addLeaf("set_a");
  assert.equal(leaf.type, "leaf");
  assert.equal(leaf.setId, "set_a");
  assert.deepEqual(tree.root.children, ["set_a"]);
});

test("addLeaf refuses a duplicate id (1:1 invariant)", () => {
  const { tree } = buildTree();
  tree.addLeaf("set_a");
  const second = tree.addLeaf("set_a");
  assert.equal(second, null);
  assert.equal(tree.root.children.length, 1);
});

test("addGroup nests a sub-group and can hold leaves", () => {
  const { tree } = buildTree();
  const group = tree.addGroup(tree.rootId, "intersection", "My group");
  tree.addLeaf("set_a", group.id);

  assert.equal(tree.root.children.length, 1);
  assert.equal(tree.getNode(group.id).children.length, 1);
  assert.equal(tree.getNode("set_a").parentId, group.id);
});

test("removeNode on a group recursively removes its descendants", () => {
  const { tree } = buildTree();
  const group = tree.addGroup(tree.rootId);
  tree.addLeaf("set_a", group.id);
  tree.addLeaf("set_b", group.id);

  tree.removeNode(group.id);

  assert.equal(tree.getNode(group.id), null);
  assert.equal(tree.getNode("set_a"), null);
  assert.equal(tree.getNode("set_b"), null);
  assert.deepEqual(tree.root.children, []);
});

test("removeNode refuses to remove the root", () => {
  const { tree } = buildTree();
  tree.removeNode(tree.rootId);
  assert.ok(tree.root, "root must still exist");
});

test("removeLeafBySetId removes exactly that leaf", () => {
  const { tree } = buildTree();
  tree.addLeaf("set_a");
  tree.addLeaf("set_b");
  tree.removeLeafBySetId("set_a");
  assert.deepEqual(tree.root.children, ["set_b"]);
});

test("ungroup promotes children to the parent and discards the group wrapper", () => {
  const { tree } = buildTree();
  const group = tree.addGroup(tree.rootId, "intersection");
  tree.addLeaf("set_a", group.id);
  tree.addLeaf("set_b", group.id);
  tree.addLeaf("set_c"); // direct root child, before the group in insertion order... let's check order below

  tree.ungroup(group.id);

  assert.equal(tree.getNode(group.id), null, "the group wrapper itself is gone");
  assert.ok(tree.getNode("set_a"));
  assert.ok(tree.getNode("set_b"));
  assert.equal(tree.getNode("set_a").parentId, tree.rootId);
  assert.equal(tree.getNode("set_b").parentId, tree.rootId);
  assert.ok(tree.root.children.includes("set_a"));
  assert.ok(tree.root.children.includes("set_b"));
  assert.ok(tree.root.children.includes("set_c"));
});

test("ungroup refuses to ungroup the root", () => {
  const { tree } = buildTree();
  tree.ungroup(tree.rootId);
  assert.ok(tree.root);
});

test("moveNode reparents a node and removes it from its old parent's children", () => {
  const { tree } = buildTree();
  const groupA = tree.addGroup(tree.rootId, "union", "A");
  const groupB = tree.addGroup(tree.rootId, "union", "B");
  tree.addLeaf("set_a", groupA.id);

  tree.moveNode("set_a", groupB.id);

  assert.deepEqual(tree.getNode(groupA.id).children, []);
  assert.deepEqual(tree.getNode(groupB.id).children, ["set_a"]);
  assert.equal(tree.getNode("set_a").parentId, groupB.id);
});

test("moveNode refuses to create a cycle (moving a group into its own descendant)", () => {
  const { tree } = buildTree();
  const groupA = tree.addGroup(tree.rootId, "union", "A");
  const groupB = tree.addGroup(groupA.id, "union", "B"); // B is nested inside A

  tree.moveNode(groupA.id, groupB.id); // would make A a child of its own child B

  assert.equal(tree.getNode(groupA.id).parentId, tree.rootId, "A must not have moved");
  assert.deepEqual(tree.getNode(groupB.id).children, [], "B must not have gained A as a child");
});

test("moveNode refuses to move the root", () => {
  const { tree } = buildTree();
  const group = tree.addGroup(tree.rootId, "union");
  tree.moveNode(tree.rootId, group.id);
  assert.equal(tree.root.parentId, null);
});

test("moveWithinParent reorders siblings and respects bounds", () => {
  const { tree } = buildTree();
  tree.addLeaf("set_a");
  tree.addLeaf("set_b");
  tree.addLeaf("set_c");

  tree.moveWithinParent("set_a", 1); // swap with set_b
  assert.deepEqual(tree.root.children, ["set_b", "set_a", "set_c"]);

  tree.moveWithinParent("set_b", -1); // already first, no-op
  assert.deepEqual(tree.root.children, ["set_b", "set_a", "set_c"]);
});

test("setGroupMode only accepts known modes", () => {
  const { tree } = buildTree();
  const group = tree.addGroup(tree.rootId, "union");
  tree.setGroupMode(group.id, "intersection");
  assert.equal(tree.getNode(group.id).mode, "intersection");
  tree.setGroupMode(group.id, "not-a-real-mode");
  assert.equal(tree.getNode(group.id).mode, "intersection", "invalid mode must be ignored");
});

test("toggleEnabled flips a node's enabled flag but never affects the root", () => {
  const { tree } = buildTree();
  const group = tree.addGroup(tree.rootId, "union");
  tree.toggleEnabled(group.id);
  assert.equal(tree.getNode(group.id).enabled, false);
  tree.toggleEnabled(group.id);
  assert.equal(tree.getNode(group.id).enabled, true);

  tree.toggleEnabled(tree.rootId);
  assert.notEqual(tree.root.enabled, false, "the root cannot be disabled");
});

test("collectLeafSetIds returns every set id nested under a node", () => {
  const { tree } = buildTree();
  const groupA = tree.addGroup(tree.rootId, "union");
  const groupB = tree.addGroup(groupA.id, "intersection");
  tree.addLeaf("set_a", groupA.id);
  tree.addLeaf("set_b", groupB.id);
  tree.addLeaf("set_c"); // direct root child, not under groupA

  assert.deepEqual(tree.collectLeafSetIds(groupA.id).sort(), ["set_a", "set_b"]);
  assert.deepEqual(tree.collectLeafSetIds(tree.rootId).sort(), ["set_a", "set_b", "set_c"]);
});

test("serialize / loadFromObject round-trip preserves structure", () => {
  const { tree } = buildTree();
  const group = tree.addGroup(tree.rootId, "difference", "Sub");
  tree.addLeaf("set_a", tree.rootId);
  tree.addLeaf("set_b", group.id);

  const serialized = tree.serialize();

  const { tree: tree2 } = buildTree();
  const ok = tree2.loadFromObject(serialized);

  assert.equal(ok, true);
  assert.equal(tree2.root.children.length, 2);
  assert.equal(tree2.getNode("set_b").parentId, group.id);
  assert.equal(tree2.getNode(group.id).mode, "difference");
});

test("loadFromObject rejects malformed data", () => {
  const { tree } = buildTree();
  assert.equal(tree.loadFromObject(null), false);
  assert.equal(tree.loadFromObject({}), false);
  assert.equal(tree.loadFromObject({ nodes: [], rootId: "missing" }), false);
});
