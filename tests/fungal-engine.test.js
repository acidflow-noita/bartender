import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {getFungalShifts} from "../src/vendor/noita-fungal/fungal.mjs";
import * as tables from "../src/vendor/noita-fungal/fungal_materials.mjs";
import {sourceState, advanceSearch, compileGoals, predictionRows, recipeSteps, recipeView, worldRows, seedNumber, simulationView, maxShifts} from "../src/fungal/engine.js";
import * as shiftTests from "./fungal-shift-fixtures.js";

const fixture = JSON.parse(readFileSync(new URL("./fungal-upstream-fixtures.json", import.meta.url)));
const hash = (value) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
for (const [name, run] of Object.entries(shiftTests)) test(`source regression: ${name}`, run);

for (const name of ["fungal.mjs", "fungal_materials.mjs", "nolla_prng.mjs", "main.mjs"]) {
  test("pinned upstream source: " + name, () => {
    const source = readFileSync(new URL("../src/vendor/noita-fungal/" + name, import.meta.url), "utf8");
    assert.equal(hash(source), fixture.files[name]);
  });
}

test("all source probability weights, table order, retry/greed rules and seeds are unchanged", () => {
  assert.equal(hash(tables), fixture.tables);
});

test("RNG/prediction parity: 60 sequences across every mode, NG+ offsets and boundary seeds", () => {
  for (const {mode, seed, ng, sha256} of fixture.predictions) assert.equal(hash(getFungalShifts(seed, ng, mode)), sha256, `${mode}, ${seed}, ${ng}`);
});

test("source UI prediction parity: every displayed branch in 60 original tables", () => {
  for (const {mode, seed, cycle, sha256} of fixture.ui.predictions) {
    const state = sourceState(seed, [], mode);
    const rows = predictionRows(state.world_state.all_shifts[cycle]).map((row) => ({
      iteration: row.iteration, presentation: row.held === "NOTHING" ? "air" : row.held === "OTHER" ? "presentation" : row.held,
      interpretation: row.useHeld === "from" ? "Sacrifice" : row.useHeld === "to" ? "Product" : "",
      sacrifices: row.from.map((id) => id === "OTHER" ? "presentation" : id), product: row.to === "OTHER" ? "presentation" : row.to,
    }));
    assert.equal(hash(rows), sha256, `${mode}, ${seed}, cycle ${cycle}`);
  }
});

test("Air/constraint compilation matches the original function, including original error precedence", () => {
  const code = readFileSync(new URL("../src/fungal/goals.js", import.meta.url), "utf8");
  const fn = code.slice(code.indexOf("function pray_to_gods("), code.lastIndexOf("\n  return {constraints")).trimEnd();
  assert.equal(hash(fn), fixture.ui.goalFunction);
  for (const {goals, result} of fixture.ui.goals) assert.deepEqual(compileGoals(goals), result);
  assert.deepEqual(compileGoals([{base: "water", target: "oil", stain: "air"}]).constraints, [{base: "water", target: "oil"}]);
});

for (const expected of fixture.searches) {
  test(`source solver parity: ${expected.mode}, ${expected.seed}, ${expected.full ? "full run" : "first scenario"}`, (t) => {
    t.mock.method(console, "log", () => {});
    const state = sourceState(expected.seed, expected.goals, expected.mode);
    let calls = 0;
    while (!state.finished && (expected.full || state.jobs.length || (state.next_base_ng === 0 && state.next_shift_nr === maxShifts[expected.mode]))) {
      assert.ok(++calls < 300000, "regression guard only; not an application search limit");
      advanceSearch(state);
    }
    assert.equal(state.total_jobs, expected.tested);
    assert.equal(state.world_state.best_length, expected.best);
    assert.equal(state.solutions.length, expected.solutions);
    assert.equal(hash(state.solutions), expected.sha256, "all original recipes, in original order");
    for (const example of fixture.ui.recipes.filter((r) => r.mode === expected.mode && r.seed === expected.seed)) {
      const result = recipeView(state.solutions[example.index]);
      const steps = result.steps.map((row) => ({iteration: row.iteration, cycle: row.cycle, presentation: row.held,
        interpretation: row.useHeld === "from" ? "Sacrifice" : row.useHeld === "to" ? "Product" : "", sacrifices: row.from, product: row.to}));
      assert.equal(hash({steps, world: result.world}), example.sha256, "displayed steps/effects match the updated source recipe_changed");
    }
  });
}

test("simulation uses the source's one-hop recipe evaluation; Air means holding nothing", () => {
  const shift = (from, to, useHeld) => { const value = {fromMaterials: [from], toMaterial: to, useHeld, convertTries: 0}; return {NOTHING: value, OTHER: value}; };
  const shifts = [shift("water", "oil", "from"), shift("oil", "blood", "to"), shift("blood", "sand", null)];
  const result = recipeSteps(shifts, ["air", "air", "air"]);
  assert.deepEqual(result.world, {water: "oil", oil: "blood", blood: "sand"});
  assert.deepEqual(worldRows(result.world).find((r) => r.material === "water"), {material: "water", appearance: "oil", effects: "blood"});
  assert.deepEqual(recipeSteps(shifts, [], 0), {steps: [], world: {}});
  assert.deepEqual(result, recipeSteps(shifts, []));
  assert.equal(recipeSteps(shifts, ["lava", "poison"]).world.lava, "oil");
  assert.equal(recipeSteps(shifts, ["lava", "poison"]).world.oil, "poison");
  assert.equal(recipeSteps(shifts, [], 3, 2, 4).steps[2].cycle, 5);
});

test("updated source UI/search supports 200 Hyper shifts and 20 in other modes", () => {
  for (const mode of Object.keys(tables.maxShifts)) assert.equal(sourceState(12, [], mode).world_state.all_shifts[0].length, tables.maxShifts[mode]);
  assert.equal(getFungalShifts(12, 0, "apotheosis_bungal_spam").length, 200);
});

test("numeric seed input validation accepts zero and max uint32 without modifying the seed", () => {
  assert.equal(seedNumber("0"), 0);
  assert.equal(seedNumber("4294967295"), 4294967295);
  assert.equal(seedNumber(" 0012 "), 12);
  for (const value of ["", "abc", "-1", "1.1", "1e3", "4294967296"]) assert.throws(() => seedNumber(value));
});

test("manual and solution simulations pick the updated held-specific reroll branches", () => {
  const shifts = sourceState(600, [], "vanilla").world_state.all_shifts[0];
  const empty = recipeSteps(shifts, [], 1).steps[0];
  const lava = recipeSteps(shifts, ["lava"], 1).steps[0];
  assert.equal(empty.to, "lava");
  assert.equal(empty.retries, 1);
  assert.equal(lava.to, "water_swamp");
  assert.equal(lava.retries, 2);
  assert.deepEqual(lava.from, ["lava"]);
  const gold = recipeSteps(sourceState(1, [], "vanilla").world_state.all_shifts[0], ["gold"], 1).steps[0];
  assert.equal(gold.to, "pea_soup");
  assert.equal(gold.greed, true);
  const natural = {NOTHING: {fromMaterials: ["water"], toMaterial: "oil", useHeld: null, convertTries: 0}};
  assert.deepEqual(recipeSteps([natural], ["air"]).world, {water: "oil"});
  assert.deepEqual(recipeSteps([natural], ["gold"]).world, {water: "oil"});
});
