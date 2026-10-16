import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {getUnusedMaterialIds, reactionUsesUnusedMaterial, materialExclusionIndex, UNUSED_CREATION_ROUTES} from "../src/components/materialAvailability.js";
import {reactionUrl, readReactionReagents} from "../src/components/reactionUrl.js";
import {DataRepository} from "../src/noitalambic/core/DataRepository.js";
import {ReactionFilter} from "../src/noitalambic/filters/ReactionFilter.js";
import {GraphDataBuilder} from "../src/noitalambic/graph/GraphDataBuilder.js";
import {AppState} from "../src/noitalambic/core/AppState.js";
import {EventBus} from "../src/noitalambic/core/EventBus.js";

const read = (file) => readFileSync(new URL(file, import.meta.url), "utf8");
const audit = JSON.parse(read("../src/data/material-availability.json"));
// Exercise filtering independently of unresolved real-game classifications.
// This fixture is explicitly synthetic; it is not evidence about these IDs.
const fixtureAudit = {schemaVersion: 2, scope: {ruleset: "unmodded"},
  source: {executableSha256: "a".repeat(64), gameMaterialsSha256: "b".repeat(64)},
  unusedIds: ["corruption_static", "rock_eroding"], materials: {}};
for (const id of fixtureAudit.unusedIds) fixtureAudit.materials[id] = {status: "unused", verification: {
  status: "verified", executableSha256: fixtureAudit.source.executableSha256,
  materialsSha256: fixtureAudit.source.gameMaterialsSha256,
  routes: Object.fromEntries(UNUSED_CREATION_ROUTES.map((route) => [route, {conclusion: "ruled-out", evidence: ["synthetic-test-witness"]}])),
}};
const unused = getUnusedMaterialIds(fixtureAudit);
const realMaterials = JSON.parse(read("../src/data/FULL_MATERIALS_FINAL.json"));
const fixtures = [
  {reagent1: "water", reagent2: "sand", product1: "steam", reactionRate: 10},
  {reagent1: "corruption_static", reagent2: "water", product1: "corruption_static", reactionRate: 100},
  {reagent1: "creepy_liquid", reagent2: "water", product1: "sand", reactionRate: 10},
  {reagent1: "[mixed]", reagent2: "water", product1: "sand", reactionRate: 10},
  {reagent1: "[unused]", reagent2: "water", product1: "sand", reactionRate: 10},
  {reagent1: "[unresolved]", reagent2: "water", product1: "sand", reactionRate: 10},
  {reagent1: "water", product1: "rock_eroding", reactionRate: 10},
  {reagent1: "physics_throw_material_part2", reagent2: "water", product1: "steam", reactionRate: 10},
];
const associations = [{tag: "mixed", id: "sand"}, {tag: "mixed", id: "corruption_static"},
  {tag: "unused", id: "rock_eroding"}, {tag: "unused", id: "corruption_static"}];
const repository = () => new DataRepository(realMaterials, {
  base: {name: "Base Game", reactions: fixtures}, apotheosis: {name: "Apotheosis", reactions: fixtures},
}, associations, fixtureAudit);

function fakeWindow(t, href) {
  const previous = globalThis.window;
  const url = new URL(href);
  globalThis.window = {location: {href, search: url.search}, history: {replaceState(_, __, next) {
    window.location.href = String(next); window.location.search = new URL(next).search;
  }}};
  t.after(() => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; });
}

test("source candidates and incomplete or mismatched evidence cannot hide a material", () => {
  assert.equal(unused.size, 2);
  for (const mutate of [
    (copy) => { copy.schemaVersion = 1; },
    (copy) => { copy.scope.ruleset = "modded"; },
    (copy) => { copy.source.executableSha256 = "c".repeat(64); },
    (copy) => { copy.source.gameMaterialsSha256 = "d".repeat(64); },
    (copy) => { for (const record of Object.values(copy.materials)) record.verification.status = "incomplete"; },
    (copy) => { for (const record of Object.values(copy.materials)) delete record.verification.routes["native-creation"]; },
    (copy) => { for (const record of Object.values(copy.materials)) record.verification.routes["world-and-entities"].evidence = []; },
  ]) {
    const copy = structuredClone(fixtureAudit); mutate(copy);
    assert.deepEqual([...getUnusedMaterialIds(copy)], []);
  }
  const realUnused = getUnusedMaterialIds(audit, {includeOverrides: false});
  for (const [id, record] of Object.entries(audit.materials)) {
    if (record.status === "unknown" || record.randomFlaskPool) assert.ok(!realUnused.has(id), id);
  }
});

test("graph filtering removes unused reactions, options and tag members without dropping mixed tags", () => {
  const repo = repository(), filter = new ReactionFilter(repo);
  const available = filter.getFilteredReactions();
  assert.deepEqual(available, [fixtures[0], fixtures[2], fixtures[3], fixtures[5], fixtures[7]]);
  assert.deepEqual(repo.resolveTag("[mixed]"), ["sand"]);
  assert.deepEqual(repo.resolveTag("[unused]"), []);
  assert.equal(filter.getAvailableReagents().some((item) => unused.has(item.value)), false);
  assert.equal(filter.getAvailableProducts().some((item) => unused.has(item.value)), false);
  assert.ok(filter.getAvailableReagents().some((item) => item.value === "creepy_liquid"));
  const graph = new GraphDataBuilder(repo).buildGraphData(available);
  assert.equal([...graph.nodes.keys()].some((id) => unused.has(id)), false);
  assert.ok(graph.nodes.has("[mixed]"));
  assert.ok(graph.nodes.has("sand"));
  repo.setExcludeUnusedMaterials(false);
  assert.equal(filter.getFilteredReactions().length, fixtures.length);
  assert.deepEqual(repo.resolveTag("[mixed]"), ["sand", "corruption_static"]);
});

test("flask and empty-space protection overrides exclusions and invalid suppliers retain dependent materials", () => {
  const protectedAudit = structuredClone(fixtureAudit);
  protectedAudit.randomFlaskPool = {liquids: ["corruption_static"], sands: []};
  assert.deepEqual([...getUnusedMaterialIds(protectedAudit)], ["rock_eroding"]);
  protectedAudit.unusedIds.push("air");
  protectedAudit.materials.air = structuredClone(protectedAudit.materials.rock_eroding);
  assert.ok(!getUnusedMaterialIds(protectedAudit).has("air"));
  const dependentAudit = structuredClone(fixtureAudit);
  dependentAudit.materials.rock_eroding.verification.dependsOnUnused = ["corruption_static"];
  assert.equal(getUnusedMaterialIds(dependentAudit).size, 2);
  dependentAudit.materials.corruption_static.verification.status = "incomplete";
  assert.deepEqual([...getUnusedMaterialIds(dependentAudit)], []);
});

test("Player Spark is explicitly filtered while its unresolved audit finding remains intact", () => {
  assert.equal(audit.materials.spark_player.status, "unknown");
  assert.equal(audit.exclusionOverrides.spark_player.classification, "presumed-unused");
  assert.ok(!getUnusedMaterialIds(audit, {includeOverrides: false}).has("spark_player"));
  assert.ok(getUnusedMaterialIds(audit).has("spark_player"));
  const compact = JSON.parse(JSON.stringify(materialExclusionIndex(audit)));
  assert.deepEqual([...getUnusedMaterialIds(compact)], [...getUnusedMaterialIds(audit)]);

  const reactions = [{reagent1: "spark_player", reagent2: "water", product1: "steam"},
    {reagent1: "spark", reagent2: "water", product1: "steam"}];
  const repo = new DataRepository(realMaterials, {base: {reactions}, apotheosis: {reactions}},
    [{tag: "sparks", id: "spark_player"}, {tag: "sparks", id: "spark"}], compact);
  const filter = new ReactionFilter(repo);
  assert.deepEqual(filter.getFilteredReactions(), [reactions[1]]);
  assert.equal(filter.getAvailableReagents().some((item) => item.value === "spark_player"), false);
  assert.deepEqual(repo.resolveTag("[sparks]"), ["spark"]);
  assert.equal(reactionUsesUnusedMaterial({input_cell1: "spark_player"}, getUnusedMaterialIds(audit)), true);
  repo.setExcludeUnusedMaterials(false);
  assert.equal(filter.getFilteredReactions().length, 2);
  assert.ok(filter.getAvailableReagents().some((item) => item.value === "spark_player"));
  repo.setExcludeUnusedMaterials(true);
  repo.setReactionSource("apotheosis");
  assert.equal(filter.getFilteredReactions().length, 2);

  for (const mutate of [
    (copy) => { delete copy.exclusionOverrides.spark_player; },
    (copy) => { copy.exclusionOverrides.spark_player.executableSha256 = "f".repeat(64); },
    (copy) => { copy.materials.spark_player.status = "source-supported"; },
    (copy) => { copy.randomFlaskPool.sands.push("spark_player"); },
  ]) {
    const copy = structuredClone(audit); mutate(copy);
    assert.ok(!getUnusedMaterialIds(copy).has("spark_player"));
  }
});

test("vanilla-unused classifications never hide material routes in mod reaction sources", () => {
  const repo = repository(), filter = new ReactionFilter(repo);
  repo.setReactionSource("apotheosis");
  assert.equal(repo.excludeUnusedMaterials, true);
  assert.equal(filter.getFilteredReactions().length, fixtures.length);
  assert.ok(filter.getAvailableReagents().some((item) => item.value === "corruption_static"));
  repo.setReactionSource("base");
  assert.ok(filter.getFilteredReactions().length < fixtures.length);
});

test("graph state restores the filter, clears only unused selections and resets consistently", (t) => {
  fakeWindow(t, "https://example.test/reactions_graph_finder?reagents=corruption_static,creepy_liquid&excludeUnused=false");
  const state = new AppState(new EventBus(), repository());
  assert.equal(state.excludeUnusedMaterials, false);
  assert.deepEqual(state.selectedReagents, ["corruption_static", "creepy_liquid"]);
  state.selectedProduct = "rock_eroding";
  state.setExcludeUnusedMaterials(true);
  assert.deepEqual(state.selectedReagents, ["creepy_liquid"]);
  assert.equal(state.selectedProduct, "");
  state.setExcludeUnusedMaterials(false);
  state.updateURL();
  assert.match(window.location.href, /excludeUnused=false/);
  state.reset();
  assert.equal(state.excludeUnusedMaterials, true);
  assert.deepEqual(state.selectedReagents, []);
  assert.equal(window.location.href, "https://example.test/reactions_graph_finder");
});

test("an invalid graph source cannot disable the base-game filter", (t) => {
  fakeWindow(t, "https://example.test/reactions_graph_finder?source=missing&reagents=corruption_static");
  const state = new AppState(new EventBus(), repository());
  assert.equal(state.reactionSource, "base");
  assert.equal(state.dataRepo.currentSource, "base");
  assert.deepEqual(state.selectedReagents, []);
});

test("reaction share links retain filters and source using readable repeated reagent parameters", () => {
  const state = {selectedReagents: ["water", "creepy_liquid"], selectedProduct: "sand", minReactionSpeed: 10,
    reactionSource: "apotheosis", excludeUnusedMaterials: false};
  const href = reactionUrl("https://example.test/reactions_graph_finder?tracking=a,b%20c#details", state);
  assert.equal(href, "https://example.test/reactions_graph_finder?reagents=water&reagents=creepy_liquid&product=sand&minSpeed=10&source=apotheosis&excludeUnused=false");
  assert.deepEqual(readReactionReagents(href), state.selectedReagents);
  assert.deepEqual(readReactionReagents("https://example.test/reactions?reagents=water,sand&reagents=water&reagents=acid&reagents=blood"), ["water", "sand", "acid"]);
  const longest = realMaterials.map((material) => material.id).sort((a, b) => b.length - a.length);
  const worst = reactionUrl("https://bartender.runfast.stream/reactions_graph_finder", {...state,
    selectedReagents: longest.slice(0, 3), selectedProduct: longest[0], reactionSource: "apotheosis_secret",
    excludeSpecialMaterials: false, onlyPracticalReactions: false});
  assert.ok(worst.length < 500);
  assert.doesNotMatch(worst, /[, %#[\]]/);
});

function tableFunctions() {
  const reactions = fixtures.filter((reaction) => !reaction.reagent1.startsWith("[")).map((reaction) => ({
    input_cell1: reaction.reagent1, input_cell2: reaction.reagent2, output_cell1: reaction.product1,
    reaction_rate: reaction.reactionRate,
  }));
  const index = (prefix) => {
    const map = new Map();
    reactions.forEach((reaction, i) => {
      [1, 2, 3].map((n) => reaction[prefix + n]).filter(Boolean).forEach((id) => {
        if (!map.has(id)) map.set(id, []);
        map.get(id).push(i);
      });
    });
    return map;
  };
  const state = {selectedReagents: [], selectedProduct: "", excludeSpecialMaterials: false,
    onlyPracticalReactions: false, excludeUnusedMaterials: true};
  const code = [...read("../src/reactions.md").matchAll(/```js\r?\n([\s\S]*?)\r?\n```/g)]
    .map((match) => match[1]).find((code) => code.includes("const specialMaterials ="));
  assert.ok(code);
  const funcs = runInNewContext(code + "\n({getFilteredReactions, getAvailableReagents, getAvailableProducts, clearUnusedSelections})", {
    window: {appState: state}, reactions, reactionInputsIndex: index("input_cell"), reactionOutputsIndex: index("output_cell"),
    materialsMap: new Map(realMaterials.map((material) => [material.id, material])), unusedMaterials: unused, reactionUsesUnusedMaterial,
  });
  return {state, reactions, ...funcs};
}

test("actual reaction-table functions exclude unused rows and choices while keeping rare materials", () => {
  const table = tableFunctions();
  assert.equal(table.getFilteredReactions().length, 3);
  for (const reaction of table.getFilteredReactions()) assert.ok(!reactionUsesUnusedMaterial(reaction, unused));
  assert.ok(table.getAvailableReagents().some((item) => item.value === "creepy_liquid"));
  assert.equal(table.getAvailableReagents().some((item) => unused.has(item.value)), false);
  assert.equal(table.getAvailableProducts().some((item) => unused.has(item.value)), false);
  table.state.selectedReagents = ["corruption_static", "creepy_liquid"];
  table.state.selectedProduct = "rock_eroding";
  table.clearUnusedSelections();
  assert.deepEqual(Array.from(table.state.selectedReagents), ["creepy_liquid"]);
  assert.equal(table.state.selectedProduct, "");
  table.state.excludeUnusedMaterials = false;
  assert.equal(table.getFilteredReactions().length, table.reactions.length);
});

test("the checked-in reaction datasets retain unverified material routes", () => {
  const reactions = JSON.parse(read("../src/data/jsons/reactions.json"));
  const realUnused = getUnusedMaterialIds(audit);
  const retained = reactions.filter((reaction) => !reactionUsesUnusedMaterial(reaction, realUnused));
  for (const reaction of reactions) {
    if (!reactionUsesUnusedMaterial(reaction, realUnused)) assert.ok(retained.includes(reaction));
  }
  if (audit.materials.corruption_static.status !== "unused") {
    assert.ok(retained.some((reaction) => reaction.input_cell1 === "corruption_static" || reaction.input_cell2 === "corruption_static"));
  }
  assert.ok(retained.some((reaction) => [reaction.input_cell1, reaction.input_cell2, reaction.input_cell3].includes("creepy_liquid")));
});
