import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import {createModel} from "../src/fungal/model.js";
import {emptySession, sessionUrl, readSession} from "../src/fungal/session.js";
import {materialCatalog, selectedMaterial} from "../src/fungal/catalog.js";
import {predictionRows, sourceState, advanceSearch, searchProgress, compileGoals, goalErrorMessage, simulationView, maxShifts} from "../src/fungal/engine.js";

const original = JSON.parse(readFileSync(new URL("./fungal-upstream-fixtures.json", import.meta.url)));
const sourceIds = (seed, mode) => ["air", ...original.catalogs.find((entry) => entry.seed === Number(seed) && entry.mode === mode).ids].sort();
const ids = (model) => model.get().catalog.map((material) => material.id).sort();

const base = JSON.parse(readFileSync(new URL("../src/data/FULL_MATERIALS_FINAL.json", import.meta.url)));
const apotheosis = JSON.parse(execFileSync(process.execPath, ["src/data/apotheosis/materials.json.js"], {encoding: "utf8"}));
function fixture(initial = {}) {
  const workers = [];
  const model = createModel({...emptySession(), seed: "418190922", ...initial}, {base, apotheosis, workerFactory() {
    const worker = {terminated: false, message: null,
      postMessage(message) { this.message = message; }, terminate() { this.terminated = true; },
      reply(data) { this.onmessage({data}); },
    };
    workers.push(worker); return worker;
  }});
  return {model, workers};
}

test("seed changes use source options and retain earlier materials, without enumerating metadata", () => {
  const {model} = fixture({seed: ""});
  assert.deepEqual(ids(model), ["air"]);
  model.setSeed("12");
  assert.deepEqual(ids(model), sourceIds(12, "vanilla"));
  model.setSeed("418190922");
  const expected = [...new Set([...sourceIds(12, "vanilla"), ...sourceIds(418190922, "vanilla")])].sort();
  assert.deepEqual(ids(model), expected);
  const catalog = model.get().catalog;
  const world = model.get().world;
  model.setSeed("");
  assert.equal(model.get().world, world, "source seed_changed ignores an empty seed");
  assert.equal(model.get().catalog, catalog);
  model.setSeed("invalid");
  assert.equal(model.get().catalog, catalog);
  assert.ok(model.get().seedError);
  model.reset();
  assert.deepEqual(ids(model), ["air"]);
  model.dispose();
});

test("fresh modes expose exactly their seed-generated IDs and original calculations", () => {
  const results = [];
  for (const mode of ["vanilla", "apotheosis", "apotheosis_bungal", "apotheosis_bungal_spam"]) {
    const {model} = fixture({mode});
    const state = model.get();
    assert.deepEqual(ids(model), sourceIds(state.seed, mode));
    assert.deepEqual(state.world.all_shifts, sourceState(state.seed, [], mode).world_state.all_shifts);
    results.push(predictionRows(state.world.all_shifts[0]));
    model.dispose();
  }
  assert.notDeepEqual(results[1], results[2]);
  assert.notDeepEqual(results[2], results[3]);
});

for (const [number, snapshots] of original.ui.catalogLifecycles.entries()) {
  test("source dropdown lifecycle " + (number + 1) + ": seed, mode, custom additions and duplicates", () => {
    const first = snapshots[0].action;
    const {model} = fixture({seed: first.seed, mode: first.mode});
    assert.deepEqual(ids(model), snapshots[0].ids);
    for (const {action, ids: expected} of snapshots.slice(1)) {
      if (action.type === "seed") model.setSeed(action.seed);
      else if (action.type === "mode") model.setMode(action.mode);
      else model.addMaterial(action.id);
      assert.deepEqual(ids(model), expected, JSON.stringify(action));
    }
    model.dispose();
  });
}

test("spoiler checkbox is visibility only: no mode, selections, world, catalog, or search changes", () => {
  const {model, workers} = fixture({mode: "apotheosis", goals: [{base: "water", target: "oil", stain: "air"}]});
  model.startSearch();
  const {world, catalog, goals, search} = model.get();
  for (const shown of [true, false, true]) {
    model.setSpoilers(shown);
    assert.equal(model.get().spoilers, shown);
    assert.equal(model.get().mode, "apotheosis");
    assert.equal(model.get().world, world);
    assert.equal(model.get().catalog, catalog);
    assert.equal(model.get().goals, goals);
    assert.equal(model.get().search, search);
    assert.equal(workers[0].terminated, false);
  }
  model.dispose();
});

test("Air is the original goal sentinel, not a removed material or alternate transformation", () => {
  const {model, workers} = fixture();
  model.startSearch();
  assert.equal(workers.length, 0);
  assert.equal(model.get().search.error, goalErrorMessage(compileGoals(model.get().goals).error));
  model.setGoal(0, "base", "water");
  model.setGoal(0, "target", "oil");
  model.startSearch();
  assert.deepEqual(workers[0].message, {type: "start", seed: 418190922, mode: "vanilla", constraints: [{base: "water", target: "oil"}]});
  model.setGoal(0, "stain", "blood");
  model.startSearch();
  assert.deepEqual(workers[1].message.constraints, [{base: "water", target: "oil", stain: "blood"}]);
  model.setGoal(0, "target", "air");
  model.startSearch();
  assert.equal(model.get().search.error, goalErrorMessage(compileGoals(model.get().goals).error));
  assert.equal(workers.length, 2);
  model.dispose();
});

test("goal add/remove/edit never resets another row, and mode changes preserve selected IDs", () => {
  const {model} = fixture({mode: "apotheosis"});
  model.addMaterial("apotheosis_redstone");
  model.setGoal(0, "base", "apotheosis_redstone");
  model.setGoal(0, "target", "water");
  model.addGoal();
  model.setGoal(1, "base", "water");
  model.setGoal(1, "target", "oil");
  model.removeGoal(0);
  assert.deepEqual(model.get().goals, [{base: "water", target: "oil", stain: "air"}]);
  model.addMaterial("my_mod_material");
  model.setGoal(0, "base", "my_mod_material");
  model.setMode("vanilla");
  assert.equal(model.get().goals[0].base, "my_mod_material");
  assert.ok(model.get().catalog.some((m) => m.id === "my_mod_material"));
  model.dispose();
});

test("simulation slider/cycle/held edits cannot recreate the world, selectors, or running search", () => {
  const {model, workers} = fixture({goals: [{base: "water", target: "oil", stain: "air"}]});
  model.addMaterial("gold");
  model.startSearch();
  const {world, catalog, goals, search} = model.get();
  model.setView("simulation");
  model.setHeld(0, "gold");
  model.setCycle(3);
  for (let after = 0; after <= 20; after++) model.setAfter(after);
  model.clearHeld();
  assert.equal(model.get().world, world);
  assert.equal(model.get().catalog, catalog);
  assert.equal(model.get().goals, goals);
  assert.equal(model.get().search, search);
  assert.equal(workers[0].terminated, false);
  model.dispose();
});

test("a mode/seed/goal change cancels the old worker and ignores its late messages", () => {
  const {model, workers} = fixture({goals: [{base: "water", target: "oil", stain: "air"}]});
  for (const change of [() => model.setMode("apotheosis_bungal"), () => model.setSeed("12"), () => model.setGoal(0, "target", "blood")]) {
    model.startSearch();
    const worker = workers.at(-1);
    change();
    assert.ok(worker.terminated);
    const state = model.get();
    worker.reply({type: "progress", progress: {finished: true}, recipes: [{bad: true}]});
    assert.equal(model.get(), state);
  }
  model.dispose();
});

test("worker results are retained exactly in original order, including selecting a later recipe", (t) => {
  t.mock.method(console, "log", () => {});
  const {model, workers} = fixture({seed: "970230895", goals: [{base: "blood", target: "magic_liquid_hp_generation", stain: "air"}]});
  model.startSearch();
  const worker = workers[0];
  const source = sourceState(worker.message.seed, worker.message.constraints, worker.message.mode);
  while (!source.finished) advanceSearch(source);
  const split = 3;
  worker.reply({type: "progress", progress: {...searchProgress(source), finished: false}, recipes: source.solutions.slice(0, split)});
  model.selectRecipe(1);
  worker.reply({type: "progress", progress: searchProgress(source), recipes: source.solutions.slice(split)});
  assert.deepEqual(model.get().search.recipes, source.solutions);
  assert.equal(model.get().search.selected, 1);
  assert.equal(model.get().search.status, "complete");
  assert.ok(worker.terminated);
  model.dispose();
});

test("restoring a copied setup reconstructs mode, goals, Air, cycle and held state exactly", () => {
  const {model} = fixture();
  const setup = {...emptySession(), seed: "12", mode: "apotheosis_bungal_spam", spoilers: true, view: "simulation", cycle: 4, after: 7,
    goals: [{base: "air", target: "air", stain: "air"}, {base: "water", target: "oil", stain: "air"}], held: ["air", "blood"], custom: ["custom_liquid"]};
  const before = ids(model);
  model.restore(setup);
  assert.deepEqual(model.snapshot(), setup);
  assert.equal(model.get().world.all_shifts.length, 29);
  assert.deepEqual(ids(model), [...new Set([...before, ...sourceIds(12, setup.mode), "custom_liquid", "blood", "water", "oil", "air"])].sort());
  model.dispose();
});

test("stopping keeps partial recipes and starting again sends a fresh unmodified search", () => {
  const {model, workers} = fixture({goals: [{base: "water", target: "oil", stain: "air"}]});
  model.startSearch();
  workers[0].reply({type: "progress", progress: {finished: false}, recipes: [{length: 2}]});
  model.stopSearch();
  assert.equal(model.get().search.status, "stopped");
  assert.equal(model.get().search.recipes.length, 1);
  model.startSearch();
  assert.equal(model.get().search.recipes.length, 0);
  assert.deepEqual(workers[1].message, workers[0].message);
  model.dispose();
});

test("material value normalization handles the actual Choices scalar/array/empty contract", () => {
  for (const value of [undefined, null, "", []]) assert.equal(selectedMaterial(value), "air");
  assert.equal(selectedMaterial("water"), "water");
  assert.equal(selectedMaterial(["water"]), "water");
  assert.equal(selectedMaterial("air"), "air");
  assert.equal(selectedMaterial("magic_liquid_hp_regeneration"), "magic_liquid_hp_regeneration");
  assert.equal(materialCatalog(base, apotheosis, "vanilla", ["air"]).find((m) => m.id === "air").name, "Air");
});

test("metadata cannot make a material selectable until the source or user adds it", () => {
  const {model} = fixture();
  const unknown = base.find((material) => !ids(model).includes(material.id)).id;
  const initial = model.get();
  model.setGoal(0, "base", unknown);
  model.setHeld(0, unknown);
  assert.equal(model.get(), initial, "only displayed choices can be selected");
  model.addMaterial(unknown);
  model.setGoal(0, "base", unknown);
  model.setHeld(0, unknown);
  assert.equal(model.get().goals[0].base, unknown);
  assert.equal(model.get().held[0], unknown);
  assert.equal(model.get().catalog.find((m) => m.id === unknown).name, base.find((m) => m.id === unknown).name);
  model.setGoal(0, "base", "air");
  model.clearHeld();
  model.setMode("apotheosis_bungal_spam");
  model.setMode("vanilla");
  assert.ok(ids(model).includes(unknown), "clearing selection or changing mode must not remove an added option");
  model.dispose();
});

test("solutions open in Simulation with the exact source endpoint and survive copied URLs", (t) => {
  t.mock.method(console, "log", () => {});
  const {model, workers} = fixture({seed: "970230895", goals: [{base: "blood", target: "magic_liquid_hp_generation", stain: "air"}]});
  model.startSearch();
  const worker = workers[0];
  const source = sourceState(worker.message.seed, worker.message.constraints, worker.message.mode);
  while (!source.finished) advanceSearch(source);
  worker.reply({type: "progress", progress: searchProgress(source), recipes: source.solutions});
  const index = source.solutions.findIndex((recipe) => recipe.shift_nr < recipe.length);
  assert.ok(index >= 0, "exercise a solution that crosses NG+");
  const solution = source.solutions[index];
  model.selectRecipe(index);
  assert.equal(model.get().view, "simulation");
  assert.equal(model.get().simulationSolution, index);
  assert.equal(model.get().after, solution.length);
  assert.equal(model.get().transition, solution.shift_nr);
  assert.deepEqual(model.get().held, solution.held_materials);
  const displayed = simulationView(model.get());
  assert.equal(displayed.count, solution.length);
  assert.deepEqual(Object.fromEntries(displayed.world.map((row) => [row.material, row.appearance])), solution.state);
  model.setAfter(0);
  assert.deepEqual(simulationView(model.get()).steps, []);
  model.setAfter(solution.length);
  const href = sessionUrl("https://example.test/fungal_shifting", model.snapshot());
  assert.ok(!href.includes("%7B") && !href.includes("%22"), "no JSON-encoded link");
  const restored = fixture(readSession(href).state).model;
  assert.deepEqual(simulationView(restored.get()).world, simulationView(model.get()).world);
  assert.deepEqual(simulationView(restored.get()).steps, simulationView(model.get()).steps);
  restored.dispose();
  model.addGoal();
  assert.equal(model.get().simulationSolution, null, "invalidating solutions must also clear the selected solution");
  assert.doesNotThrow(() => model.setAfter(5));
  model.dispose();
});

test("updated Hyper controls support shifts 21–200 and do not invent a NG+ transition", () => {
  const {model} = fixture({seed: "12"});
  model.setMode("apotheosis_bungal_spam");
  assert.equal(model.get().after, 200);
  assert.equal(model.get().transition, 200);
  model.setHeld(199, "water");
  assert.equal(model.get().held[199], "water");
  model.setAfter(200);
  const full = simulationView(model.get());
  assert.equal(full.steps.length, 200);
  assert.equal(full.steps[199].cycle, 0);
  model.setTransition(30);
  const crossed = simulationView(model.get());
  assert.equal(crossed.steps[29].cycle, 0);
  assert.equal(crossed.steps[30].cycle, 1);
  model.setCycle(28);
  assert.equal(model.get().transition, 200);
  model.setMode("vanilla");
  assert.equal(model.get().after, 20);
  assert.equal(model.get().transition, 20);
  assert.equal(model.get().held.length, 20);
  model.setHeld(20, "water");
  assert.equal(model.get().held.length, 20);
  model.dispose();
});

test("editing a loaded solution makes a manual sequence without changing upstream results", (t) => {
  t.mock.method(console, "log", () => {});
  const {model, workers} = fixture({seed: "12", goals: [{base: "water", target: "oil", stain: "air"}]});
  model.startSearch();
  const message = workers[0].message;
  const source = sourceState(message.seed, message.constraints, message.mode);
  while (!source.finished) advanceSearch(source);
  assert.ok(source.solutions.length);
  workers[0].reply({type: "progress", progress: searchProgress(source), recipes: source.solutions});
  model.selectRecipe(0);
  const before = structuredClone(source.solutions[0]);
  model.setHeld(0, (model.get().held[0] || "air") === "water" ? "oil" : "water");
  assert.equal(model.get().simulationSolution, null);
  assert.deepEqual(source.solutions[0], before);
  model.dispose();
});
