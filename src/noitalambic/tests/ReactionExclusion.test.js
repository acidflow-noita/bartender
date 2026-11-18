// Excluding reactions: the shown result is eval(root) \ excluded. Exclusions are keyed by a
// reaction's content (stable across reaction sources), saved/loaded with the workspace, and only
// apply to the full result (a sub-group's own count is that group alone).

import test from "node:test";
import assert from "node:assert/strict";

import { EventBus } from "../core/EventBus.js";
import { DataRepository } from "../core/DataRepository.js";
import { ReactionFilter } from "../filters/ReactionFilter.js";
import { ReactionSetWorkspace } from "../core/ReactionSetWorkspace.js";
import { ReactionGroupResolver } from "../core/ReactionGroupResolver.js";
import { InMemoryStorage } from "../core/ReactionSetManager.js";
import { reactionKey } from "../core/reactionKey.js";
import { materials, reactions, reactionSources, materialAssociations } from "./fixtures.js";

function setup() {
  const dataRepo = new DataRepository(materials, reactionSources, materialAssociations);
  const workspace = new ReactionSetWorkspace(new EventBus(), new InMemoryStorage());
  const resolver = new ReactionGroupResolver(new ReactionFilter(dataRepo));
  workspace.createSet(workspace.tree.rootId, { name: "Fire", reagents: ["fire"] }); // reactions 0, 2, 4
  return { workspace, resolver };
}
const indices = (result) => result.entries.map((e) => e.index).sort((a, b) => a - b);

test("a reaction's key is its content: same reaction, same key; any difference, another key", () => {
  assert.equal(reactionKey(reactions[0]), reactionKey({ ...reactions[0] }));
  assert.equal(reactionKey(reactions[0]), "water+fire+>steam++@80");
  assert.notEqual(reactionKey(reactions[0]), reactionKey({ ...reactions[0], reactionRate: 81 }));
  assert.notEqual(reactionKey(reactions[0]), reactionKey(reactions[2]));
});

test("the result is eval(root) minus the excluded reactions; restoring brings them back", () => {
  const { workspace, resolver } = setup();
  assert.deepEqual(indices(resolver.resolve(workspace)), [0, 2, 4]);

  workspace.excludeReactions([reactions[2]]);
  const result = resolver.resolve(workspace);
  assert.deepEqual(indices(result), [0, 4]);
  assert.equal(result.totalCount, 2);
  assert.equal(result.excludedCount, 1);

  workspace.restoreReaction(reactionKey(reactions[2]));
  assert.deepEqual(indices(resolver.resolve(workspace)), [0, 2, 4]);

  workspace.excludeReactions([reactions[0], reactions[4]]);
  workspace.restoreAllReactions();
  assert.deepEqual(indices(resolver.resolve(workspace)), [0, 2, 4]);
});

test("excluding a reaction no set matches changes nothing but is remembered", () => {
  const { workspace, resolver } = setup();
  workspace.excludeReactions([reactions[5]]);
  const result = resolver.resolve(workspace);
  assert.deepEqual(indices(result), [0, 2, 4]);
  assert.equal(result.excludedCount, 0);
  assert.equal(workspace.excluded.size, 1);
});

test("a sub-group's own result is not affected (exclusion applies to the full result only)", () => {
  const { workspace, resolver } = setup();
  const group = workspace.createGroup(workspace.tree.rootId, "union", "G");
  workspace.createSet(group.id, { name: "Fire too", reagents: ["fire"] });
  workspace.excludeReactions([reactions[0]]);
  assert.deepEqual(indices(resolver.resolve(workspace, group.id)), [0, 2, 4]);
  assert.deepEqual(indices(resolver.resolve(workspace)), [2, 4]);
});

test("exclusions are saved and loaded with the workspace; older configs without them still load", () => {
  const { workspace } = setup();
  workspace.excludeReactions([reactions[2]]);
  const saved = JSON.parse(JSON.stringify(workspace.serialize()));
  assert.equal(saved.excluded.length, 1);

  const other = setup();
  assert.ok(other.workspace.loadFromObject(saved));
  assert.deepEqual(indices(other.resolver.resolve(other.workspace)), [0, 4]);

  const older = { ...saved };
  delete older.excluded;
  assert.ok(other.workspace.loadFromObject(older));
  assert.equal(other.workspace.excluded.size, 0, "no exclusions in an older config");

  workspace.reset();
  assert.equal(workspace.excluded.size, 0, "reset clears them");
});
