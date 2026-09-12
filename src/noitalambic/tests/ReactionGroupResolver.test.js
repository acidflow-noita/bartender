import test from "node:test";
import assert from "node:assert/strict";

import { EventBus } from "../core/EventBus.js";
import { DataRepository } from "../core/DataRepository.js";
import { ReactionFilter } from "../filters/ReactionFilter.js";
import { ReactionSetWorkspace } from "../core/ReactionSetWorkspace.js";
import { ReactionGroupResolver } from "../core/ReactionGroupResolver.js";
import { InMemoryStorage } from "../core/ReactionSetManager.js";
import { materials, reactions, reactionSources, materialAssociations } from "./fixtures.js";

// Known match sets against the fixtures (see tests/fixtures.js for the reaction list):
//   reagents ["fire"]  -> {0, 2, 4}
//   reagents ["water"] -> {0, 1, 4}  (4 matches via the [liquids] tag)
//   product  "mud"     -> {1, 5}

function buildWorkspace() {
  const eventBus = new EventBus();
  const dataRepo = new DataRepository(materials, reactionSources, materialAssociations);
  const reactionFilter = new ReactionFilter(dataRepo);
  const workspace = new ReactionSetWorkspace(eventBus, new InMemoryStorage());
  const resolver = new ReactionGroupResolver(reactionFilter);
  return { workspace, resolver };
}

function indices(result) {
  return result.entries.map((e) => e.index).sort((a, b) => a - b);
}

test("a single leaf under root resolves to that set's own matches", () => {
  const { workspace, resolver } = buildWorkspace();
  workspace.createSet(workspace.tree.rootId, { reagents: ["fire"] });

  const result = resolver.resolve(workspace);
  assert.deepEqual(indices(result), [0, 2, 4]);
});

test("root union (default) combines two leaves without duplicates", () => {
  const { workspace, resolver } = buildWorkspace();
  workspace.createSet(workspace.tree.rootId, { reagents: ["fire"] }); // {0,2,4}
  workspace.createSet(workspace.tree.rootId, { product: "mud" }); // {1,5}

  const result = resolver.resolve(workspace);
  assert.deepEqual(indices(result), [0, 1, 2, 4, 5]);
});

test("root intersection keeps only reactions matched by every leaf", () => {
  const { workspace, resolver } = buildWorkspace();
  workspace.tree.setGroupMode(workspace.tree.rootId, "intersection");
  workspace.createSet(workspace.tree.rootId, { reagents: ["fire"] }); // {0,2,4}
  workspace.createSet(workspace.tree.rootId, { reagents: ["water"] }); // {0,1,4}

  const result = resolver.resolve(workspace);
  assert.deepEqual(indices(result), [0, 4]);
});

test("root difference subtracts every other child from the first", () => {
  const { workspace, resolver } = buildWorkspace();
  workspace.tree.setGroupMode(workspace.tree.rootId, "difference");
  const setA = workspace.createSet(workspace.tree.rootId, { reagents: ["fire"] }); // {0,2,4}
  workspace.createSet(workspace.tree.rootId, { reagents: ["water"] }); // {0,1,4}

  const result = resolver.resolve(workspace);
  assert.deepEqual(indices(result), [2], "A minus B: only 2 is exclusive to fire");
  assert.ok(setA); // silence unused var lint in strict environments
});

test("difference is order-sensitive: swapping sibling order changes the result", () => {
  const { workspace, resolver } = buildWorkspace();
  workspace.tree.setGroupMode(workspace.tree.rootId, "difference");
  const setA = workspace.createSet(workspace.tree.rootId, { reagents: ["fire"] }); // {0,2,4}
  workspace.createSet(workspace.tree.rootId, { reagents: ["water"] }); // {0,1,4}

  workspace.tree.moveWithinParent(setA.id, 1); // water becomes first

  const result = resolver.resolve(workspace);
  assert.deepEqual(indices(result), [1], "B minus A: only 1 is exclusive to water");
});

test("root symmetric difference keeps reactions unique to exactly one leaf", () => {
  const { workspace, resolver } = buildWorkspace();
  workspace.tree.setGroupMode(workspace.tree.rootId, "symmetricDifference");
  workspace.createSet(workspace.tree.rootId, { reagents: ["fire"] }); // {0,2,4}
  workspace.createSet(workspace.tree.rootId, { reagents: ["water"] }); // {0,1,4}

  const result = resolver.resolve(workspace);
  assert.deepEqual(indices(result), [1, 2]);
});

test("nested groups: (fire union mud) difference (fire intersect water)", () => {
  const { workspace, resolver } = buildWorkspace();

  const group1 = workspace.createGroup(workspace.tree.rootId, "union", "fire-or-mud");
  workspace.createSet(group1.id, { reagents: ["fire"] }); // {0,2,4}
  workspace.createSet(group1.id, { product: "mud" }); // {1,5}
  // group1 = {0,1,2,4,5}

  const group2 = workspace.createGroup(workspace.tree.rootId, "intersection", "fire-and-water");
  workspace.createSet(group2.id, { reagents: ["fire"] }); // {0,2,4}
  workspace.createSet(group2.id, { reagents: ["water"] }); // {0,1,4}
  // group2 = {0,4}

  workspace.tree.setGroupMode(workspace.tree.rootId, "difference");
  // group1 is added before group2, so root difference = group1 - group2

  const result = resolver.resolve(workspace);
  assert.deepEqual(indices(result), [1, 2, 5]);
});

test("disabled leaves are pruned entirely, not treated as an empty operand", () => {
  const { workspace, resolver } = buildWorkspace();
  workspace.tree.setGroupMode(workspace.tree.rootId, "intersection");
  const setA = workspace.createSet(workspace.tree.rootId, { reagents: ["fire"] }); // {0,2,4}
  const setB = workspace.createSet(workspace.tree.rootId, { reagents: ["water"] }); // {0,1,4}
  workspace.manager.toggleSetEnabled(setB.id); // disable B

  const result = resolver.resolve(workspace);
  // With B pruned, intersection degenerates to just A's own matches, not an empty set.
  assert.deepEqual(indices(result), [0, 2, 4]);
  assert.ok(setA);
});

test("disabled groups are pruned from their parent's combination", () => {
  const { workspace, resolver } = buildWorkspace();
  const group = workspace.createGroup(workspace.tree.rootId, "union", "disabled-group");
  workspace.createSet(group.id, { reagents: ["water"] }); // would be {0,1,4}
  workspace.createSet(workspace.tree.rootId, { reagents: ["fire"] }); // {0,2,4}

  workspace.tree.toggleEnabled(group.id);
  workspace.tree.setGroupMode(workspace.tree.rootId, "union");

  const result = resolver.resolve(workspace);
  assert.deepEqual(indices(result), [0, 2, 4], "the disabled group must contribute nothing");
});

test("a group with zero active children resolves to an empty result, not the universal set", () => {
  const { workspace, resolver } = buildWorkspace();
  const setA = workspace.createSet(workspace.tree.rootId, { reagents: ["fire"] });
  workspace.manager.toggleSetEnabled(setA.id);
  workspace.tree.setGroupMode(workspace.tree.rootId, "intersection");

  const result = resolver.resolve(workspace);
  assert.equal(result.totalCount, 0);
});

test("union entries accumulate contributing set ids/colors/names from every matching leaf", () => {
  const { workspace, resolver } = buildWorkspace();
  const setA = workspace.createSet(workspace.tree.rootId, { name: "A", color: "#111111", reagents: ["fire"] });
  const setB = workspace.createSet(workspace.tree.rootId, { name: "B", color: "#222222", reagents: ["water"] });
  // Reaction 0 (water + fire -> steam) matches both.

  const result = resolver.resolve(workspace);
  const entry = result.entries.find((e) => e.index === 0);
  assert.ok(entry);
  assert.equal(entry.setIds.length, 2);
  assert.deepEqual(entry.colors.sort(), ["#111111", "#222222"]);
  assert.ok(setA && setB);
});

test("resolve(workspace, nodeId) can preview an arbitrary sub-group's own result", () => {
  const { workspace, resolver } = buildWorkspace();
  const group = workspace.createGroup(workspace.tree.rootId, "union", "sub");
  workspace.createSet(group.id, { reagents: ["fire"] }); // {0,2,4}

  const subResult = resolver.resolve(workspace, group.id);
  assert.deepEqual(indices(subResult), [0, 2, 4]);
});

test("perSetCounts reflects each individual set's own match count regardless of grouping", () => {
  const { workspace, resolver } = buildWorkspace();
  const setA = workspace.createSet(workspace.tree.rootId, { reagents: ["fire"] }); // 3 matches
  const setB = workspace.createSet(workspace.tree.rootId, { product: "mud" }); // 2 matches

  const result = resolver.resolve(workspace);
  assert.equal(result.perSetCounts[setA.id], 3);
  assert.equal(result.perSetCounts[setB.id], 2);
});
