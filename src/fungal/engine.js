// Observable preview serves only .js modules. npm scripts generate this bridge
// from the pinned submodule, changing import extensions only—not calculations.
import { init, run_queue_step } from "./_upstream/main.js";
import { materialsFrom, materialsTo, maxShifts } from "./_upstream/fungal_materials.js";
export { compileGoals } from "./goals.js";
export { maxShifts };

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

export function advanceSearch(state) {
  if (!state.finished) run_queue_step(state);
  return state;
}

export function searchProgress(state) {
  return {finished: state.finished, tested: state.total_jobs, queued: state.jobs.length,
    cycle: state.base_ng, transition: state.shift_nr, found: state.solutions.length,
    shortest: state.world_state.best_length};
}

// Preserve every upstream held-material/reroll branch and its original order.
export function predictionRows(shifts) {
  return shifts.flatMap((branches, index) => Object.entries(branches).map(([held, shift]) => {
    const useHeld = held === "NOTHING" ? null : shift.useHeld;
    return {
      iteration: index + 1, held, useHeld,
      from: useHeld === "from" ? [held === "OTHER" ? "OTHER" : held] : shift.fromMaterials,
      to: useHeld === "to" ? held : shift.toMaterial,
      retries: shift.convertTries, greed: shift.greedChange === true,
    };
  }));
}

// Translation of the updated source's recipe_changed calculation: choose the
// actual held-material branch first, then perform the one-hop world lookup.
export function recipeSteps(shifts, heldMaterials, length = shifts.length, transition = shifts.length, cycle = 0) {
  const world = {};
  const steps = [];
  for (let i = 0; i < length; i++) {
    const held = heldMaterials[i] && heldMaterials[i] !== "air" ? heldMaterials[i] : null;
    const branches = shifts[i];
    // A manually held material has no effect on a shift without an OTHER branch.
    // The source solver never assigns a held override to such a shift.
    const shift = held ? branches[held] || branches.OTHER || branches.NOTHING : branches.NOTHING;
    const useHeld = held ? shift.useHeld : null;
    const from = useHeld === "from" ? [held] : shift.fromMaterials;
    let to = useHeld === "to" ? held : shift.toMaterial;
    if (world[to]) to = world[to];
    for (const material of from) world[material] = to;
    steps.push({iteration: i + 1, cycle: cycle + (i >= transition ? 1 : 0), held: held || "air",
      useHeld, from, to, retries: shift.convertTries, greed: shift.greedChange === true});
  }
  return {steps, world};
}

export function worldRows(world) {
  return Object.keys(world).sort().map((material) => ({material,
    appearance: world[material], effects: world[world[material]] || ""}));
}

export function recipeView(recipe) {
  return {steps: recipeSteps(recipe.shifts, recipe.held_materials, recipe.length, recipe.shift_nr, recipe.base_ng).steps,
    world: worldRows(recipe.state)};
}

export function simulationView(state) {
  const solution = state.simulationSolution == null ? null : state.search.recipes[state.simulationSolution];
  const limit = solution ? solution.length : maxShifts[state.mode];
  const count = Math.min(state.after, limit);
  let shifts;
  if (solution) shifts = solution.shifts;
  else {
    const first = state.world?.all_shifts[state.cycle] ?? [];
    const next = state.world?.all_shifts[state.cycle + 1] ?? first;
    shifts = [...first.slice(0, state.transition), ...next.slice(state.transition)];
  }
  const result = recipeSteps(shifts, state.held, Math.min(count, shifts.length), state.transition, state.cycle);
  // At the solution endpoint, display precisely the state returned by upstream.
  return {steps: result.steps, world: worldRows(solution && count === solution.length ? solution.state : result.world),
    limit, count: result.steps.length, solution};
}

export function poolRows(mode) {
  return {from: materialsFrom[mode].map((entry) => ({materials: entry.materials, weight: entry.probability})),
    to: materialsTo[mode].map((entry) => ({material: entry.material, weight: entry.probability}))};
}

// UI wording only. compileGoals still uses the source's validation unchanged.
export function goalErrorMessage(error) {
  if (!error) return "";
  if (error === "the gods find only emptiness") return "Choose a source and target material before searching.";
  if (error === "A product requires a sacrifice.") return "Choose a source material before choosing a target.";
  if (error === "A stain requires sacrifice.") return "Choose a source material before setting world effects.";
  if (error === "The gods cannot countenance annihilation.") return "Air is not shiftable and cannot be a target. Choose another material.";
  if (error.startsWith("The anfractuous cycle")) return "These goals conflict: one material is assigned different results.";
  return "Check the source, target, and optional effects in each goal.";
}
