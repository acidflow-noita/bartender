import test from "node:test";
import assert from "node:assert/strict";

import { DataRepository } from "../core/DataRepository.js";
import { AdvancedFilters } from "../filters/AdvancedFilters.js";
import { materials, reactions, reactionSources, materialAssociations } from "./fixtures.js";

function buildRepo() {
  return new DataRepository(materials, reactionSources, materialAssociations);
}

test("isCatalystReaction detects a material present in both inputs and outputs", () => {
  const repo = buildRepo();
  assert.equal(AdvancedFilters.isCatalystReaction(reactions[1], repo), true, "fungus + water -> fungus + mud");
  assert.equal(AdvancedFilters.isCatalystReaction(reactions[3], repo), true, "acid + gold -> acid + blood");
});

test("isCatalystReaction returns false for a plain reaction", () => {
  const repo = buildRepo();
  assert.equal(AdvancedFilters.isCatalystReaction(reactions[0], repo), false, "water + fire -> steam");
  assert.equal(AdvancedFilters.isCatalystReaction(reactions[2], repo), false, "oil + fire -> steam");
});

test("isCatalystReaction detects the trivial mud -> mud self reaction", () => {
  const repo = buildRepo();
  assert.equal(AdvancedFilters.isCatalystReaction(reactions[5], repo), true);
});

test("getCatalystMaterialIds returns the shared material ids", () => {
  const repo = buildRepo();
  assert.deepEqual(AdvancedFilters.getCatalystMaterialIds(reactions[1], repo), ["fungus"]);
});

test("matches: excludeCatalysts filters out catalyst reactions", () => {
  const repo = buildRepo();
  assert.equal(AdvancedFilters.matches(reactions[0], repo, { excludeCatalysts: true }), true);
  assert.equal(AdvancedFilters.matches(reactions[1], repo, { excludeCatalysts: true }), false);
});

test("matches: onlyCatalysts keeps only catalyst reactions", () => {
  const repo = buildRepo();
  assert.equal(AdvancedFilters.matches(reactions[0], repo, { onlyCatalysts: true }), false);
  assert.equal(AdvancedFilters.matches(reactions[1], repo, { onlyCatalysts: true }), true);
});

test("matches: reagent/product count ranges", () => {
  const repo = buildRepo();
  // reaction 5 has 1 reagent, 1 product
  assert.equal(AdvancedFilters.matches(reactions[5], repo, { minReagentCount: 2 }), false);
  assert.equal(AdvancedFilters.matches(reactions[5], repo, { minReagentCount: 1, maxReagentCount: 1 }), true);
  // reaction 1 has 2 reagents, 2 products
  assert.equal(AdvancedFilters.matches(reactions[1], repo, { maxProductCount: 1 }), false);
});

test("matches: requireTags / excludeTags", () => {
  const repo = buildRepo();
  assert.equal(AdvancedFilters.matches(reactions[4], repo, { requireTags: ["liquids"] }), true);
  assert.equal(AdvancedFilters.matches(reactions[0], repo, { requireTags: ["liquids"] }), false);
  assert.equal(AdvancedFilters.matches(reactions[4], repo, { excludeTags: ["liquids"] }), false);
});

test("matches: materialTypeIn / materialTypeOut", () => {
  const repo = buildRepo();
  assert.equal(AdvancedFilters.matches(reactions[0], repo, { materialTypeIn: ["liquid"] }), true);
  assert.equal(AdvancedFilters.matches(reactions[0], repo, { materialTypeIn: ["gas"] }), false);
  assert.equal(AdvancedFilters.matches(reactions[0], repo, { materialTypeOut: ["gas"] }), true);
});

test("matches: nameSearch matches by material name (case-insensitive)", () => {
  const repo = buildRepo();
  assert.equal(AdvancedFilters.matches(reactions[0], repo, { nameSearch: "STEAM" }), true);
  assert.equal(AdvancedFilters.matches(reactions[0], repo, { nameSearch: "gold" }), false);
});

test("matches: empty filters object always matches", () => {
  const repo = buildRepo();
  reactions.forEach((reaction) => {
    assert.equal(AdvancedFilters.matches(reaction, repo, {}), true);
  });
});
