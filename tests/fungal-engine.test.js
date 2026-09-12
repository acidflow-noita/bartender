import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {getFungalShifts} from "../src/fungal/shifts.js";
import * as tables from "../src/fungal/materials.js";
import {sourceState, advanceSearch, compileGoals, predictionRows, recipeSteps, recipeView, worldRows, seedNumber} from "../src/fungal/engine.js";
import * as shiftTests from "./fungal-shift-fixtures.js";

const fixture = JSON.parse(readFileSync(new URL("./fungal-upstream-fixtures.json", import.meta.url)));
const hash = (value) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
for (const [name, run] of Object.entries(shiftTests)) test(`source regression: ${name}`, run);

for (const [original, port] of [["fungal.mjs", "shifts.js"], ["fungal_materials.mjs", "materials.js"], ["nolla_prng.mjs", "nolla-prng.js"], ["main.mjs", "solver.js"]]) {
  test(`unchanged upstream logic: ${port}`, () => {
    const source = readFileSync(new URL(`../src/fungal/${port}`, import.meta.url), "utf8")
      .replace(/^\/\/ Unmodified noita-fungal[^\n]*\n/, "")
      .replaceAll("./nolla-prng.js", "./nolla_prng.mjs").replaceAll("./materials.js", "./fungal_materials.mjs").replaceAll("./shifts.js", "./fungal.mjs");
    assert.equal(hash(source), fixture.files[original]);
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
    const rows = predictionRows(state.world_state.all_shifts[cycle]).map((row) => ({...row,
      presentation: row.presentation === "NOTHING" ? "air" : row.presentation === "OTHER" ? "presentation" : row.presentation,
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
    while (!state.finished && (expected.full || state.jobs.length || (state.next_base_ng === 0 && state.next_shift_nr === 20))) {
      assert.ok(++calls < 150000, "regression guard only; not an application search limit");
      advanceSearch(state);
    }
    assert.equal(state.total_jobs, expected.tested);
    assert.equal(state.world_state.best_length, expected.best);
    assert.equal(state.solutions.length, expected.solutions);
    assert.equal(hash(state.solutions), expected.sha256, "all original recipes, in original order");
    for (const example of fixture.ui.recipes.filter((r) => r.mode === expected.mode && r.seed === expected.seed)) {
      assert.equal(hash(recipeView(state.solutions[example.index])), example.sha256, "displayed steps/effects match source recipe_changed");
    }
  });
}

test("simulation uses the source's one-hop recipe evaluation; Air means holding nothing", () => {
  const shifts = [
    {base: ["water"], target: "oil", held: "from"},
    {base: ["oil"], target: "blood", held: "to"},
    {base: ["blood"], target: "sand", held: null},
  ];
  const result = recipeSteps(shifts, ["air", "air", "air"]);
  assert.deepEqual(result.world, {water: "oil", oil: "blood", blood: "sand"});
  assert.deepEqual(worldRows(result.world).find((r) => r.material === "water"), {material: "water", appearance: "oil", effects: "blood"});
  assert.deepEqual(recipeSteps(shifts, [], 0), {steps: [], world: {}});
  assert.deepEqual(result, recipeSteps(shifts, []));
  assert.equal(recipeSteps(shifts, ["lava", "poison"]).world.lava, "oil");
  assert.equal(recipeSteps(shifts, ["lava", "poison"]).world.oil, "poison");
  assert.equal(recipeSteps(shifts, [], 3, 2, 4).steps[2].cycle, 5);
});

test("source UI/search limit remains 20 in all modes, without changing Hyper's library table", () => {
  for (const mode of Object.keys(tables.maxShifts)) assert.equal(sourceState(12, [], mode).world_state.all_shifts[0].length, 20);
  assert.equal(getFungalShifts(12, 0, "apotheosis_bungal_spam").length, 200);
});

test("numeric seed input validation accepts zero and max uint32 without modifying the seed", () => {
  assert.equal(seedNumber("0"), 0);
  assert.equal(seedNumber("4294967295"), 4294967295);
  assert.equal(seedNumber(" 0012 "), 12);
  for (const value of ["", "abc", "-1", "1.1", "1e3", "4294967296"]) assert.throws(() => seedNumber(value));
});
