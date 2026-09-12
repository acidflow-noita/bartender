import { sourceState, seedNumber, compileGoals, goalErrorMessage, MODES, maxShifts } from "./engine.js";
import { materialCatalog, appendSourceMaterials } from "./catalog.js";
import { emptySession, EMPTY_GOAL, VIEWS, isMaterialId } from "./session.js";

const idleSearch = () => ({status: "idle", progress: null, recipes: [], selected: 0, error: ""});

// Single owner for state. UI components subscribe once; no cross-cell generators,
// shared window state, implicit bindings, or selector rebuilding on each keystroke.
export function createModel(initial, {base, apotheosis, workerFactory}) {
  let state;
  let worker;
  let generation = 0;
  let disposed = false;
  const listeners = new Set();
  const materialIds = new Set();
  const notify = () => { if (!disposed) for (const listener of listeners) listener(state); };
  const patch = (changes) => { state = {...state, ...changes}; notify(); };
  function cancelWorker() { generation++; worker?.terminate(); worker = undefined; }
  function catalogue(input, world, force = false) {
    const previousSize = materialIds.size;
    appendSourceMaterials(materialIds, world);
    if (!force && state && input.mode === state.mode && materialIds.size === previousSize) return state.catalog;
    return materialCatalog(base, apotheosis, input.mode, materialIds);
  }
  function calculate(input, previousWorld = null) {
    // seed_changed returns early for an empty seed; keep the last generated
    // world and accumulated options until a new valid seed is supplied.
    if (!input.seed.trim()) return {world: previousWorld, seedError: ""};
    try { return {world: sourceState(input.seed, [], input.mode).world_state, seedError: ""}; }
    catch (error) { return {world: null, seedError: error.message}; }
  }
  function restore(next, clear = false) {
    cancelWorker();
    if (clear) materialIds.clear();
    const input = {...emptySession(), ...structuredClone(next)};
    input.seed = String(input.seed ?? "");
    // Like load_constraints/imagine_real, shared goals and user additions
    // become selectable before restoring their values.
    const restoredIds = [...input.custom, ...input.goals.flatMap((g) => Object.values(g)), ...input.held].filter(Boolean);
    for (const id of restoredIds) materialIds.add(id);
    const limit = maxShifts[input.mode];
    input.after = Math.max(0, Math.min(input.after, limit));
    input.transition = input.cycle === 28 ? limit : Math.max(1, Math.min(input.transition ?? limit, limit));
    const calculation = calculate(input, clear ? null : state?.world);
    state = {...input, ...calculation, catalog: catalogue(input, calculation.world, true), search: idleSearch(), simulationSolution: null};
    notify();
  }
  restore(initial, true);

  return {
    get: () => state,
    snapshot: () => ({seed: state.seed, mode: state.mode, spoilers: state.spoilers, view: state.view,
      cycle: state.cycle, goals: state.goals, custom: state.custom, held: state.held, after: state.after, transition: state.transition}),
    subscribe(listener) { listeners.add(listener); listener(state); return () => listeners.delete(listener); },
    restore: (next) => restore(next),
    reset: () => restore(emptySession(), true),
    setSeed(seed) {
      seed = String(seed);
      if (seed === state.seed) return;
      cancelWorker();
      const input = {...state, seed};
      const calculation = calculate(input, state.world);
      patch({seed, ...calculation, catalog: catalogue(input, calculation.world), search: idleSearch(), simulationSolution: null});
    },
    setMode(mode) {
      if (!MODES.some((m) => m.id === mode) || mode === state.mode) return;
      cancelWorker();
      const previousLimit = maxShifts[state.mode], limit = maxShifts[mode];
      const after = state.after === previousLimit ? limit : Math.min(state.after, limit);
      const transition = state.transition === previousLimit || state.cycle === 28 ? limit : Math.min(state.transition, limit);
      const input = {...state, mode, after, transition};
      const calculation = calculate(input, state.world);
      patch({mode, after, transition, held: state.held.slice(0, limit), ...calculation, catalog: catalogue(input, calculation.world), search: idleSearch(), simulationSolution: null});
    },
    setSpoilers(spoilers) { if (!!spoilers !== state.spoilers) patch({spoilers: !!spoilers}); },
    setView(view) { if (VIEWS.includes(view) && view !== state.view) patch({view}); },
    setCycle(cycle) {
      if (Number.isInteger(cycle) && cycle >= 0 && cycle <= 28 && cycle !== state.cycle) {
        patch({cycle, transition: cycle === 28 ? maxShifts[state.mode] : state.transition, simulationSolution: null});
      }
    },
    setAfter(after) {
      const limit = state.simulationSolution == null ? maxShifts[state.mode] : state.search.recipes[state.simulationSolution].length;
      if (Number.isInteger(after) && after >= 0 && after <= limit && after !== state.after) patch({after});
    },
    setTransition(transition) {
      if (state.cycle < 28 && Number.isInteger(transition) && transition >= 1 && transition <= maxShifts[state.mode] && transition !== state.transition) {
        patch({transition, simulationSolution: null});
      }
    },
    setGoal(index, key, value) {
      if (!state.goals[index] || !["base", "target", "stain"].includes(key) || !materialIds.has(value)) return;
      if (state.goals[index][key] === value) return;
      cancelWorker();
      patch({goals: state.goals.map((g, i) => i === index ? {...g, [key]: value} : g), search: idleSearch(), simulationSolution: null});
    },
    addGoal() { cancelWorker(); patch({goals: [...state.goals, EMPTY_GOAL()], search: idleSearch(), simulationSolution: null}); },
    removeGoal(index) { cancelWorker(); patch({goals: state.goals.filter((_, i) => i !== index), search: idleSearch(), simulationSolution: null}); },
    addMaterial(value) {
      const id = value.trim();
      if (!isMaterialId(id)) throw new Error("Use a material ID containing letters, numbers and underscores.");
      if (materialIds.has(id)) return;
      materialIds.add(id);
      const custom = [...state.custom, id];
      patch({custom, catalog: materialCatalog(base, apotheosis, state.mode, materialIds)});
    },
    setHeld(index, value) {
      if (!Number.isInteger(index) || index < 0 || index >= maxShifts[state.mode] || !materialIds.has(value)) return;
      if ((state.held[index] || "air") === value) return;
      const held = state.held.slice();
      held[index] = value;
      patch({held, simulationSolution: null});
    },
    clearHeld() { patch({held: [], simulationSolution: null}); },
    useManualSimulation() { if (state.simulationSolution != null) patch({simulationSolution: null}); },
    selectRecipe(index) {
      if (!Number.isInteger(index) || index < 0 || index >= state.search.recipes.length) return;
      const recipe = state.search.recipes[index];
      for (const id of recipe.held_materials) if (typeof id === "string") materialIds.add(id);
      patch({view: "simulation", cycle: recipe.base_ng, held: recipe.held_materials.slice(), after: recipe.length,
        transition: recipe.shift_nr < recipe.length ? recipe.shift_nr : maxShifts[state.mode], simulationSolution: index,
        catalog: materialCatalog(base, apotheosis, state.mode, materialIds), search: {...state.search, selected: index}});
    },
    startSearch() {
      cancelWorker();
      try {
        const seed = seedNumber(state.seed);
        const {constraints, error} = compileGoals(state.goals);
        if (error) throw new Error(goalErrorMessage(error));
        const active = worker = workerFactory();
        const token = generation;
        patch({search: {...idleSearch(), status: "running"}, simulationSolution: null});
        active.onmessage = ({data}) => {
          if (disposed || token !== generation) return;
          if (data.type === "error") {
            cancelWorker(); patch({search: {...state.search, status: "error", error: data.message}}); return;
          }
          if (data.type !== "progress") return;
          const recipes = data.recipes.length ? [...state.search.recipes, ...data.recipes] : state.search.recipes;
          if (data.progress.finished) cancelWorker();
          patch({search: {...state.search, recipes, progress: data.progress, status: data.progress.finished ? "complete" : "running"}});
        };
        active.onerror = (event) => {
          if (disposed || token !== generation) return;
          event.preventDefault?.();
          cancelWorker(); patch({search: {...state.search, status: "error", error: event.message || "Search worker failed."}});
        };
        active.postMessage({type: "start", seed, constraints, mode: state.mode});
      } catch (error) {
        cancelWorker(); patch({search: {...idleSearch(), status: "error", error: error.message}, simulationSolution: null});
      }
    },
    stopSearch() {
      if (state.search.status !== "running") return;
      cancelWorker(); patch({search: {...state.search, status: "stopped"}});
    },
    dispose() { disposed = true; cancelWorker(); listeners.clear(); },
  };
}
