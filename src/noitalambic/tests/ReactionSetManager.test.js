import test from "node:test";
import assert from "node:assert/strict";

import { EventBus } from "../core/EventBus.js";
import { ReactionSetManager } from "../core/ReactionSetManager.js";

function buildManager() {
  const eventBus = new EventBus();
  return { eventBus, manager: new ReactionSetManager(eventBus) };
}

test("addSet creates a set with sensible defaults and emits an event", () => {
  const { eventBus, manager } = buildManager();
  let changedCount = 0;
  eventBus.on("reactionSetsChanged", () => changedCount++);

  const set = manager.addSet({});
  assert.ok(set.id);
  assert.equal(set.enabled, true);
  assert.equal(set.collapsed, false);
  assert.deepEqual(set.reagents, []);
  assert.equal(changedCount, 1);
});

test("addSet respects the maxSets limit", () => {
  const { manager } = buildManager();
  for (let i = 0; i < 20; i++) manager.addSet({});
  assert.ok(manager.sets.length <= 8, "should not exceed CONFIG.reactionSets.maxSets");
});

test("duplicateSet creates an independent copy with a new id", () => {
  const { manager } = buildManager();
  const original = manager.addSet({ reagents: ["water"] });
  const copy = manager.duplicateSet(original.id);

  assert.notEqual(copy.id, original.id);
  copy.reagents.push("fire");
  assert.deepEqual(original.reagents, ["water"], "mutating the copy must not affect the original");
});

test("removeSet removes only the targeted set", () => {
  const { manager } = buildManager();
  const a = manager.addSet({ name: "A" });
  const b = manager.addSet({ name: "B" });
  manager.removeSet(a.id);
  assert.equal(manager.sets.length, 1);
  assert.equal(manager.sets[0].id, b.id);
});

test("updateSetFilters merges into advancedFilters without dropping other keys", () => {
  const { manager } = buildManager();
  const set = manager.addSet({});
  manager.updateSetFilters(set.id, { excludeCatalysts: true });
  assert.equal(set.advancedFilters.excludeCatalysts, true);
  assert.equal(set.advancedFilters.maxReagentCount, 3, "default value should still be present");
});

test("toggleSetEnabled and toggleSetCollapsed flip their respective flags", () => {
  const { manager } = buildManager();
  const set = manager.addSet({});
  manager.toggleSetEnabled(set.id);
  assert.equal(set.enabled, false);
  manager.toggleSetEnabled(set.id);
  assert.equal(set.enabled, true);

  manager.toggleSetCollapsed(set.id);
  assert.equal(set.collapsed, true);
  manager.toggleSetCollapsed(set.id);
  assert.equal(set.collapsed, false);
});
