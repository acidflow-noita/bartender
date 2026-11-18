import test from "node:test";
import assert from "node:assert/strict";

import { DataRepository } from "../core/DataRepository.js";
import { ReactionFilter } from "../filters/ReactionFilter.js";
import { ReactionSetResolver } from "../core/ReactionSetResolver.js";
import { createReactionSet } from "../core/ReactionSetManager.js";
import { materials, reactions, reactionSources, materialAssociations } from "./fixtures.js";

function buildResolver() {
  const repo = new DataRepository(materials, reactionSources, materialAssociations);
  const filter = new ReactionFilter(repo);
  return new ReactionSetResolver(filter);
}

test("resolve: no enabled sets returns an empty result", () => {
  const resolver = buildResolver();
  const result = resolver.resolve([createReactionSet({ enabled: false })], "union");
  assert.equal(result.totalCount, 0);
  assert.equal(result.enabledSetCount, 0);
});

test("resolve: union combines results from multiple sets without duplicates", () => {
  const resolver = buildResolver();
  // Set A: reagent fire -> reactions 0, 2, 4
  // Set B: product mud -> reactions 1, 5
  const setA = createReactionSet({ reagents: ["fire"] });
  const setB = createReactionSet({ product: "mud" });

  const result = resolver.resolve([setA, setB], "union");
  const indices = result.entries.map((e) => e.index).sort();
  assert.deepEqual(indices, [0, 1, 2, 4, 5]);
});

test("resolve: a reaction matched by both sets keeps both set ids/colors", () => {
  const resolver = buildResolver();
  const setA = createReactionSet({ reagents: ["fire"], color: "#111111", name: "A" });
  const setB = createReactionSet({ reagents: ["water"], color: "#222222", name: "B" });
  // Reaction 0 (water + fire -> steam) matches both sets.

  const result = resolver.resolve([setA, setB], "union");
  const entry = result.entries.find((e) => e.index === 0);
  assert.ok(entry, "reaction 0 should be present");
  assert.equal(entry.setIds.length, 2);
  assert.deepEqual(entry.colors.sort(), ["#111111", "#222222"]);
  assert.deepEqual(entry.names.sort(), ["A", "B"]);
});

test("resolve: intersection keeps only reactions matched by every enabled set", () => {
  const resolver = buildResolver();
  // fire -> reactions 0, 2, 4 (reaction 4 uses fire as reagent2)
  // water -> reactions 0, 1, 4 (reaction 4 uses [liquids] as reagent1, which resolves to water)
  const setA = createReactionSet({ reagents: ["fire"] });
  const setB = createReactionSet({ reagents: ["water"] });

  const result = resolver.resolve([setA, setB], "intersection");
  assert.deepEqual(
    result.entries.map((e) => e.index).sort(),
    [0, 4],
  );
});

test("resolve: difference keeps only reactions unique to exactly one set", () => {
  const resolver = buildResolver();
  const setA = createReactionSet({ reagents: ["fire"] }); // 0, 2, 4
  const setB = createReactionSet({ reagents: ["water"] }); // 0, 1, 4

  const result = resolver.resolve([setA, setB], "difference");
  const indices = result.entries.map((e) => e.index).sort();
  // 0 and 4 are shared (excluded), 2 is unique to A, 1 is unique to B
  assert.deepEqual(indices, [1, 2]);
});

test("resolve: disabled sets are ignored entirely", () => {
  const resolver = buildResolver();
  const setA = createReactionSet({ reagents: ["fire"], enabled: true });
  const setB = createReactionSet({ reagents: ["water"], enabled: false });

  const result = resolver.resolve([setA, setB], "union");
  assert.equal(result.enabledSetCount, 1);
  assert.deepEqual(
    result.entries.map((e) => e.index).sort(),
    [0, 2, 4],
  );
});

test("resolve: perSetCounts reflects each set's own match count", () => {
  const resolver = buildResolver();
  const setA = createReactionSet({ reagents: ["fire"] }); // 3 matches
  const setB = createReactionSet({ product: "mud" }); // 2 matches

  const result = resolver.resolve([setA, setB], "union");
  assert.equal(result.perSetCounts[setA.id], 3);
  assert.equal(result.perSetCounts[setB.id], 2);
});

test("resolve: advanced filters apply per set (excludeCatalysts)", () => {
  const resolver = buildResolver();
  const setA = createReactionSet({ advancedFilters: { excludeCatalysts: true } });

  const result = resolver.resolve([setA], "union");
  const indices = result.entries.map((e) => e.index);
  assert.ok(!indices.includes(1));
  assert.ok(!indices.includes(3));
  assert.ok(!indices.includes(5));
});
