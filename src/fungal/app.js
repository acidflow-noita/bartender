import * as Inputs from "npm:@observablehq/inputs";
import { html } from "npm:htl";
import { createModel } from "./model.js";
import { MODES, predictionRows, recipeSteps, recipeView, worldRows, poolRows, seedNumber } from "./engine.js";
import { readSession, sessionUrl, syncAddress } from "./session.js";
import { materialNode, materialSelect } from "./select.js";
import { materialMetadata } from "./catalog.js";

const VIEW_LABELS = new Map([["search", "Plan search"], ["predictions", "Shift predictions"], ["simulation", "Simulation"]]);

export function createFungalApp({base, apotheosis}) {
  const initial = readSession(location.href);
  const model = createModel(initial.state, {base, apotheosis,
    workerFactory: () => new Worker(import.meta.resolve("./search-worker.js"), {type: "module"}),
  });
  const url = syncAddress({location, history});
  let disposed = false;
  let dailyRequest;
  let dailyVersion = 0;
  let last;
  let goalFields = [];
  const disposers = [];
  const listen = (element, type, handler) => {
    element.addEventListener(type, handler);
    disposers.push(() => element.removeEventListener(type, handler));
  };
  const number = (label, min, max, value) => Inputs.number([min, max], {label, value, step: 1, width: "100%"});
  const button = (label, action, className = "") => {
    const form = Inputs.button(label, {reduce: () => { action(); }});
    if (className) form.classList.add(className);
    return form;
  };

  const seed = Inputs.text({label: "World seed", value: initial.state.seed, placeholder: "Enter a world seed", width: "100%"});
  const mode = Inputs.radio(MODES.map((m) => m.id), {label: "Game mode", value: initial.state.mode,
    format: (id) => MODES.find((m) => m.id === id).label.replace("Apotheosis (", "").replace(")", ""),
  });
  mode.classList.add("fs-modes");
  const spoilers = Inputs.toggle({label: "Show extra modes (spoilers)", value: initial.state.spoilers});
  const view = Inputs.radio([...VIEW_LABELS.keys()], {value: initial.state.view, format: (id) => VIEW_LABELS.get(id)});
  view.classList.add("fs-tabs");
  const seedStatus = html`<p class="fs-status" role="status"></p>`;
  const seedError = html`<p class="fs-error" role="alert" hidden></p>`;
  const importError = html`<p class="fs-error" role="alert" hidden=${!initial.error}>${initial.error}</p>`;
  const copyStatus = html`<span class="fs-muted" role="status"></span>`;
  const copyFallback = html`<div class="fs-copy-fallback" hidden></div>`;
  const modeStatus = html`<span class="fs-muted"></span>`;

  async function daily() {
    dailyRequest?.abort();
    const request = dailyRequest = new AbortController();
    const token = ++dailyVersion;
    seedStatus.textContent = "Loading daily seed…";
    try {
      const response = await fetch("https://daily-seed.acidflow.stream/current_seed.txt", {signal: request.signal});
      if (!response.ok) throw new Error("Daily seed unavailable.");
      const value = String(seedNumber((await response.text()).trim()));
      if (disposed || token !== dailyVersion) return;
      model.setSeed(value);
      seedStatus.textContent = "Daily seed loaded.";
    } catch (error) {
      if (!disposed && token === dailyVersion && error.name !== "AbortError") seedStatus.textContent = "Daily seed unavailable. Enter a seed manually.";
    }
  }
  const loadDaily = button("Daily seed", () => { void daily(); });
  const copy = button("Copy link", () => {
    const value = sessionUrl(location.href, model.snapshot());
    url.flush();
    void (async () => {
      try {
        if (!navigator.clipboard) throw new Error("Clipboard unavailable");
        await navigator.clipboard.writeText(value);
        if (!disposed) { copyStatus.textContent = "Copied."; copyFallback.hidden = true; }
      } catch {
        if (!disposed) {
          copyStatus.textContent = "Copy this URL:";
          copyFallback.replaceChildren(Inputs.text({label: "Setup URL", value, readonly: true, width: "100%"}));
          copyFallback.hidden = false;
        }
      }
    })();
  });
  const reset = button("Reset", () => {
    dailyVersion++; dailyRequest?.abort(); seedStatus.textContent = ""; importError.hidden = true;
    model.reset();
  });

  const goals = html`<div class="fs-goals"></div>`;
  const addGoal = button("+ Add goal", () => model.addGoal());
  const customInput = Inputs.text({label: "Material ID", placeholder: "my_mod_material", width: "100%"});
  const customStatus = html`<p role="status" class="fs-status"></p>`;
  const customAdd = button("Add material", () => {
    try { model.addMaterial(customInput.value); customStatus.textContent = "Material is available in the selectors."; }
    catch (error) { customStatus.textContent = error.message; }
  });
  const start = button("Find plans", () => model.startSearch(), "fs-primary");
  const stop = button("Stop", () => model.stopSearch());
  const searchStatus = html`<p class="fs-search-status" role="status" aria-live="polite"></p>`;
  const progress = html`<div class="fs-table fs-progress" hidden></div>`;
  const recipeIndex = number("Recipe", 1, 1, 1);
  const recipeCount = html`<span class="fs-muted"></span>`;
  const recipeSummary = html`<p></p>`;
  const recipeTable = html`<div class="fs-table fs-steps"></div>`;
  const recipeWorld = html`<div class="fs-table fs-world"></div>`;
  const recipes = html`<section class="fs-recipes" hidden>
    <div class="fs-inline">${recipeIndex}${recipeCount}</div>${recipeSummary}
    ${recipeTable}<h3>Resulting world</h3>${recipeWorld}
  </section>`;
  const searchPanel = html`<section data-view="search">
    <h2>Material goals</h2>
    <p>Options come from the original seed-generated shifts. Earlier options and custom additions remain available; world effects are optional.</p>
    ${goals}<div class="fs-inline">${addGoal}</div>
    <div class="fs-search-actions"><div class="fs-inline">${start}${stop}</div>${searchStatus}</div>
    ${progress}${recipes}
  </section>`;

  const cycle = number("NG+ cycle", 0, 28, initial.state.cycle);
  const predictions = html`<div class="fs-table fs-predictions"></div>`;
  const fromPool = html`<div class="fs-table fs-pool-table"></div>`;
  const toPool = html`<div class="fs-table fs-pool-table"></div>`;
  const predictionsPanel = html`<section data-view="predictions" hidden>
    <h2>Shift predictions</h2><div class="fs-inline">${cycle}</div>
    <p>Every held-material branch from the original tool. NG+ 0 is a new game.</p>
    ${predictions}
    <details><summary>Original mode probability tables</summary><p>Unmodified relative weights, not percentages.</p>
      <div class="fs-pools"><div><h3>Source groups</h3>${fromPool}</div><div><h3>Targets</h3>${toPool}</div></div>
    </details>
  </section>`;

  const simCycle = number("NG+ cycle", 0, 28, initial.state.cycle);
  const editShift = number("Edit held material at shift", 1, 20, 1);
  const held = materialSelect(model.get().catalog, {label: "Held material", value: model.get().held[0] || "air", placeholder: "Hold nothing",
    onChange: (value) => model.setHeld(editShift.value - 1, value),
  });
  const clearHeld = button("Clear held materials", () => model.clearHeld());
  const after = Inputs.range([0, 20], {label: "World after shift", value: initial.state.after, step: 1, width: "100%"});
  const simTable = html`<div class="fs-table fs-steps"></div>`;
  const simWorld = html`<div class="fs-table fs-world"></div>`;
  const simulationPanel = html`<section data-view="simulation" hidden>
    <h2>Held-material simulation</h2>
    <p>Uses the original tool's recipe calculation. Air means holding nothing; no alternative retry or world-state rules are applied.</p>
    <div class="fs-simulation-controls">${simCycle}${editShift}${held.element}${clearHeld}</div>
    <div class="fs-slider">${after}</div>${simTable}<h3>Resulting world</h3>${simWorld}
  </section>`;
  const root = html`<div id="fungal-app">
    <header><div><h1>Fungal Shift Planner</h1><p>The original noita-fungal calculations, with Bartender's material selectors.</p></div>
      <div class="fs-inline">${copy}${reset}${copyStatus}</div>
    </header>${copyFallback}${importError}
    <div class="fs-setup"><div class="fs-seed"><div class="fs-seed-row">${seed}${loadDaily}</div>${seedStatus}${seedError}</div>
      <div>${mode}${spoilers}</div>
    </div><div class="fs-mode-summary">${modeStatus}</div>
    ${view}${searchPanel}${predictionsPanel}${simulationPanel}
    <details class="fs-help"><summary>Add a custom material</summary><div class="fs-inline">${customInput}${customAdd}</div>${customStatus}</details>
    <details class="fs-help"><summary>Source behavior and limits</summary>
      <p>Search starts in New Game and examines the original NG+ transitions. Recipes and their resulting worlds are shown exactly as returned, in discovery order.</p>
      <p>The original UI and solver use 20 iterations in every mode, including Hyper. This page preserves that limit rather than changing the mathematics.</p>
      <p>Search can be stopped at any time. Stopping keeps partial results; it does not claim the search is complete.</p>
    </details>
  </div>`;

  listen(seed, "input", () => { dailyVersion++; dailyRequest?.abort(); seedStatus.textContent = ""; model.setSeed(seed.value); });
  listen(mode, "input", () => model.setMode(mode.value));
  listen(spoilers, "input", () => model.setSpoilers(spoilers.value));
  listen(view, "input", () => model.setView(view.value));
  listen(cycle, "input", () => model.setCycle(cycle.value));
  listen(simCycle, "input", () => model.setCycle(simCycle.value));
  listen(after, "input", () => model.setAfter(after.value));
  listen(editShift, "input", () => held.setValue(model.get().held[editShift.value - 1] || "air"));
  listen(recipeIndex, "input", () => model.selectRecipe(recipeIndex.value - 1));
  listen(window, "popstate", restoreLocation);
  listen(window, "hashchange", restoreLocation);
  function restoreLocation() {
    dailyVersion++; dailyRequest?.abort();
    const restored = readSession(location.href);
    importError.textContent = restored.error; importError.hidden = !restored.error;
    model.restore(restored.state);
  }

  let materialMap = new Map();
  const material = (id) => materialNode(id, materialMap);
  const materialList = (ids) => html`<div class="fs-materials">${ids.map(material)}</div>`;
  const stepsOptions = {
    columns: ["iteration", "cycle", "presentation", "interpretation", "sacrifices", "product"],
    header: {iteration: "Shift", cycle: "NG+", presentation: "Hold", interpretation: "Role", sacrifices: "From", product: "To"},
    format: {presentation: material, sacrifices: materialList, product: material},
    select: false, height: 340, layout: "fixed", width: {iteration: 48, cycle: 48, interpretation: 90},
  };
  const worldOptions = {columns: ["material", "appearance", "effects"],
    header: {material: "Original material", appearance: "Appearance", effects: "Stains / world ingestion / alchemy"},
    format: {material, appearance: material, effects: material}, select: false, height: 300, layout: "fixed",
  };
  const replaceTable = (element, rows, options) => element.replaceChildren(Inputs.table(rows, options));

  function disposeGoal(row) {
    Object.values(row.fields).forEach((field) => field.dispose());
    row.element.remove();
  }

  function renderGoals(state, catalogChanged) {
    while (goalFields.length > state.goals.length) disposeGoal(goalFields.pop());
    state.goals.forEach((goal, index) => {
      let row = goalFields[index];
      if (!row) {
        row = {fields: {}, element: null};
        for (const [key, label] of [["base", "Material to change"], ["target", "Desired appearance"], ["stain", "World effects (optional)"]]) {
          row.fields[key] = materialSelect(state.catalog, {label, value: goal[key], count: key === "base",
            placeholder: key === "stain" ? "Any world effects" : key === "base" ? "Choose material to change…" : "Choose desired appearance…",
            onChange: (value) => model.setGoal(goalFields.indexOf(row), key, value)});
        }
        const remove = button("×", () => {
          const current = goalFields.indexOf(row);
          if (current < 0) return;
          goalFields.splice(current, 1);
          disposeGoal(row);
          model.removeGoal(current);
        }, "fs-remove");
        remove.querySelector("button").setAttribute("aria-label", "Remove goal");
        row.element = html`<div class="fs-goal">${row.fields.base.element}${row.fields.target.element}${row.fields.stain.element}${remove}</div>`;
        goals.append(row.element);
        goalFields.push(row);
      } else {
        for (const key of ["base", "target", "stain"]) {
          if (catalogChanged) row.fields[key].setCatalog(state.catalog, goal[key]);
          else row.fields[key].setValue(goal[key]);
        }
      }
    });
  }

  const unsubscribe = model.subscribe((state) => {
    const catalogChanged = !last || state.catalog !== last.catalog;
    if (catalogChanged) {
      materialMap = materialMetadata(base, apotheosis, state.mode);
      for (const material of state.catalog) materialMap.set(material.id, material);
    }
    if (!last || state.seed !== last.seed) seed.value = state.seed;
    if (!last || state.mode !== last.mode) mode.value = state.mode;
    if (!last || state.spoilers !== last.spoilers) {
      spoilers.value = state.spoilers;
      [...mode.querySelectorAll('input[type="radio"]')].forEach((radio, i) => {
        radio.closest("label").hidden = !!MODES[i].spoiler && !state.spoilers;
      });
    }
    seedError.textContent = state.seedError;
    seedError.hidden = !state.seedError;
    if (!last || state.view !== last.view) {
      view.value = state.view;
      for (const panel of [searchPanel, predictionsPanel, simulationPanel]) panel.hidden = panel.dataset.view !== state.view;
    }
    if (!last || state.cycle !== last.cycle) { cycle.value = state.cycle; simCycle.value = state.cycle; }
    if (!last || state.after !== last.after) after.value = state.after;
    if (!last || catalogChanged || state.goals !== last.goals) renderGoals(state, catalogChanged);
    if (catalogChanged) held.setCatalog(state.catalog, state.held[editShift.value - 1] || "air");
    else if (!last || state.held !== last.held) held.setValue(state.held[editShift.value - 1] || "air");

    if (!last || state.mode !== last.mode) {
      const pools = poolRows(state.mode);
      modeStatus.textContent = `${MODES.find((m) => m.id === state.mode).label} · original random pools: ${pools.from.length} source groups / ${pools.to.length} targets`;
      replaceTable(fromPool, pools.from, {columns: ["materials", "weight"], header: {materials: "Source group", weight: "Weight"},
        format: {materials: materialList, weight: String}, select: false, height: 300, layout: "fixed", width: {weight: 90}});
      replaceTable(toPool, pools.to, {columns: ["material", "weight"], header: {material: "Target", weight: "Weight"},
        format: {material, weight: String}, select: false, height: 300, layout: "fixed", width: {weight: 90}});
    }
    if (!last || catalogChanged || state.world !== last.world || state.cycle !== last.cycle) {
      const shifts = state.world?.all_shifts[state.cycle] ?? [];
      replaceTable(predictions, predictionRows(shifts), {
        columns: ["iteration", "presentation", "interpretation", "sacrifices", "product"],
        header: {iteration: "Shift", presentation: "Holding", interpretation: "Role", sacrifices: "From", product: "To"},
        format: {presentation: material, sacrifices: materialList, product: material}, select: false, height: 440, layout: "fixed", width: {iteration: 48, interpretation: 90},
      });
    }
    if (!last || catalogChanged || state.world !== last.world || state.cycle !== last.cycle || state.held !== last.held || state.after !== last.after) {
      const shifts = state.world?.all_shifts[state.cycle] ?? [];
      const simulation = recipeSteps(shifts, state.held, Math.min(state.after, shifts.length), shifts.length, state.cycle);
      replaceTable(simTable, simulation.steps, stepsOptions);
      replaceTable(simWorld, worldRows(simulation.world), worldOptions);
    }
    const search = state.search;
    if (!last || search !== last.search) {
      start.querySelector("button").disabled = search.status === "running";
      stop.querySelector("button").disabled = search.status !== "running";
      const stats = search.progress;
      searchStatus.textContent = search.error || ({idle: "Choose goals, then find plans.", running: "Searching…", stopped: "Stopped. Results are partial.", complete: "Search complete."}[search.status])
        + (stats ? ` ${stats.tested.toLocaleString()} candidates · ${stats.found} recipes found.` : "");
      progress.hidden = !stats;
      if (stats) replaceTable(progress, [stats], {columns: ["cycle", "transition", "tested", "queued", "found", "shortest"],
        header: {cycle: "NG+", transition: "Transition after", tested: "Candidates", queued: "Queued", found: "Recipes", shortest: "Shortest"},
        format: {shortest: (value) => value ?? "—"}, select: false, height: 85, layout: "fixed"});
      recipes.hidden = !search.recipes.length;
      recipeIndex.querySelector('input[type="number"]').max = String(Math.max(1, search.recipes.length));
      recipeIndex.value = search.selected + 1;
      recipeCount.textContent = `of ${search.recipes.length} · original discovery order`;
    }
    const selected = search.recipes[search.selected];
    const previous = last?.search.recipes[last.search.selected];
    if (selected && (selected !== previous || catalogChanged)) {
      const output = recipeView(selected);
      recipeSummary.textContent = `Start in NG+ ${selected.base_ng}; ${selected.length} shifts.`
        + (selected.shift_nr < selected.length ? ` Enter NG+ ${selected.base_ng + 1} after shift ${selected.shift_nr}.` : "");
      replaceTable(recipeTable, output.steps, stepsOptions);
      replaceTable(recipeWorld, output.world, worldOptions);
    }
    last = state;
    url.update(model.snapshot());
  });

  root.dispose = () => {
    disposed = true; dailyVersion++; dailyRequest?.abort();
    unsubscribe(); model.dispose(); url.dispose();
    disposers.forEach((dispose) => dispose());
    goalFields.forEach(disposeGoal);
    held.dispose();
  };
  if (!initial.state.seed) void daily();
  return root;
}
