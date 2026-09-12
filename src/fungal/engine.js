import { init, run_queue_step } from "./solver.js";
import { materialsFrom, materialsTo } from "./materials.js";
export { compileGoals } from "./goals.js";

export const MODES = [
  {id: "vanilla", label: "Vanilla"},
  {id: "apotheosis", label: "Apotheosis"},
  {id: "apotheosis_bungal", label: "Apotheosis (Spell)", spoiler: true},
  {id: "apotheosis_bungal_spam", label: "Apotheosis (Hyper)", spoiler: true},
];

export function seedNumber(value) {
  if (!/^\d+$/.test(String(value).trim())) throw new Error("Enter a whole-number world seed.");
  const seed = Number(value);
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error("Seed must be between 0 and 4294967295.");
  return seed;
}

export function sourceState(seed, constraints = [], mode = "vanilla") {
  if (!MODES.some((entry) => entry.id === mode)) throw new Error("Unknown game mode.");
  return init(seedNumber(seed), constraints, mode);
}

// No rewritten search, candidate pruning, probability changes or new limits.
export function advanceSearch(state) {
  if (!state.finished) run_queue_step(state);
  return state;
}

export function searchProgress(state) {
  return {
    finished: state.finished, tested: state.total_jobs, queued: state.jobs.length,
    cycle: state.base_ng, transition: state.shift_nr,
    found: state.solutions.length, shortest: state.world_state.best_length,
  };
}

// Data-only translation of index.html's cycle_changed. Keep every held branch,
// its source ordering, and its original interpretation (including Air).
export function predictionRows(shifts) {
  return shifts.flatMap((shift_root, i) => Object.entries(shift_root.by_held).map(([presentation, shift]) => {
    let interpretation = "";
    if (presentation === "NOTHING") { /* no held material */ }
    else if (shift.useHeld === "from") interpretation = "Sacrifice";
    else if (shift.useHeld === "to") interpretation = "Product";
    const sacrifices = shift.useHeld !== "from" || presentation === "NOTHING" ? shift.fromMaterials
      : presentation === "OTHER" ? ["presentation"] : [presentation];
    const product = shift.useHeld !== "to" || presentation === "NOTHING" ? shift.toMaterial
      : presentation === "OTHER" ? "presentation" : presentation;
    return {iteration: i + 1, presentation, interpretation, sacrifices, product};
  }));
}

// Data-only translation of the original recipe_changed calculation. It uses
// the supplied source-solver shifts, NOT another prediction/held-retry model.
export function recipeSteps(shifts, held_materials, length = shifts.length, shift_nr = shifts.length, base_ng = 0) {
  const world = {};
  const steps = [];
  for (let i = 0; i < length; i++) {
    let material = held_materials[i];
    if (!material) material = "air";
    let sacrifices = shifts[i].base;
    let product = shifts[i].target;
    let interpretation = "";
    if (material === "air") { /* no held override */ }
    else if (shifts[i].held === "from") {
      interpretation = "Sacrifice";
      sacrifices = [material];
    } else if (shifts[i].held === "to") {
      interpretation = "Product";
      product = material;
    }
    if (world[product]) product = world[product];
    for (const sacrifice of sacrifices) world[sacrifice] = product;
    steps.push({iteration: i + 1, cycle: base_ng + (i >= shift_nr ? 1 : 0), presentation: material, interpretation, sacrifices, product});
  }
  return {steps, world};
}

// Match the source's world table: effects are blank when there is no second
// transformation. Never collapse a chain or recompute a returned solution.
export function worldRows(world) {
  return Object.keys(world).sort().map((material) => ({
    material, appearance: world[material], effects: world[world[material]] || "",
  }));
}

export function recipeView(recipe) {
  return {
    steps: recipeSteps(recipe.shifts, recipe.held_materials, recipe.length, recipe.shift_nr, recipe.base_ng).steps,
    world: worldRows(recipe.state),
  };
}

export function poolRows(mode) {
  return {
    from: materialsFrom[mode].map((entry) => ({materials: entry.materials, weight: entry.probability})),
    to: materialsTo[mode].map((entry) => ({material: entry.material, weight: entry.probability})),
  };
}
