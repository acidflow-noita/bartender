import test from "node:test";
import assert from "node:assert/strict";

import { DataRepository } from "../core/DataRepository.js";
import { ReactionFilter } from "../filters/ReactionFilter.js";
import { materials, reactions, reactionSources, materialAssociations } from "./fixtures.js";

function buildFilter() {
  const repo = new DataRepository(materials, reactionSources, materialAssociations);
  return new ReactionFilter(repo);
}

test("getFilteredReactions: no criteria returns every reaction, sorted by speed desc", () => {
  const filter = buildFilter();
  const results = filter.getFilteredReactions();
  assert.equal(results.length, reactions.length);
  for (let i = 1; i < results.length; i++) {
    assert.ok(results[i - 1].reactionRate >= results[i].reactionRate);
  }
});

test("getFilteredReactions: filters by reagent", () => {
  const filter = buildFilter();
  const results = filter.getFilteredReactions(["fire"]);
  // fire is a reagent in reactions 0, 2, 4
  assert.equal(results.length, 3);
});

test("getFilteredReactions: filters by product", () => {
  const filter = buildFilter();
  const results = filter.getFilteredReactions([], "mud");
  // mud is produced in reactions 1 and 5
  assert.equal(results.length, 2);
});

test("getFilteredReactions: minSpeed excludes slower reactions", () => {
  const filter = buildFilter();
  const results = filter.getFilteredReactions([], "", 50);
  assert.ok(results.every((r) => r.reactionRate >= 50));
});

test("getFilteredReactionsAdvanced: preserves original reaction index", () => {
  const filter = buildFilter();
  const results = filter.getFilteredReactionsAdvanced({ reagents: ["fire"] });
  results.forEach(({ index, reaction }) => {
    assert.equal(filter.dataRepo.getReaction(index), reaction);
  });
});

test("getFilteredReactionsAdvanced: excludeCatalysts advanced filter", () => {
  const filter = buildFilter();
  const results = filter.getFilteredReactionsAdvanced({ advancedFilters: { excludeCatalysts: true } });
  const indices = results.map((r) => r.index);
  assert.ok(!indices.includes(1), "catalyst reaction 1 should be excluded");
  assert.ok(!indices.includes(3), "catalyst reaction 3 should be excluded");
  assert.ok(!indices.includes(5), "catalyst reaction 5 should be excluded");
  assert.ok(indices.includes(0));
  assert.ok(indices.includes(2));
});

test("getFilteredReactionsAdvanced: maxSpeed caps the speed range", () => {
  const filter = buildFilter();
  const results = filter.getFilteredReactionsAdvanced({ minSpeed: 0, maxSpeed: 30 });
  assert.ok(results.every(({ reaction }) => reaction.reactionRate <= 30));
});

test("getAvailableReagents / getAvailableProducts still work as before", () => {
  const filter = buildFilter();
  const reagents = filter.getAvailableReagents();
  const products = filter.getAvailableProducts();
  assert.ok(reagents.some((r) => r.value === "water"));
  assert.ok(products.some((p) => p.value === "steam"));
});
