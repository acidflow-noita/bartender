import * as Inputs from "npm:@observablehq/inputs";
import { html } from "npm:htl";
import { createModel } from "./model.js";
import { MODES, maxShifts, predictionRows, simulationView, poolRows, seedNumber } from "./engine.js";
import { readSession, sessionUrl, syncAddress, copyLinkText } from "./session.js";
import { materialNode, materialSelect } from "./select.js";
import { materialMetadata } from "./catalog.js";
import { staticTable } from "./table.js";

const VIEWS = new Map([["search", "Find a solution"], ["predictions", "Shift predictions"], ["simulation", "Simulation"]]);
const MAX_SHIFTS = Math.max(...Object.values(maxShifts));

export function createFungalApp({base, apotheosis}) {
  const initial = readSession(location.href);
  const model = createModel(initial.state, {base, apotheosis,
    workerFactory: () => new Worker(import.meta.resolve("./search-worker.js"), {type: "module"}),
  });
  const address = syncAddress({location, history});
  // Register before rendering: a table/selector error must never prevent URL updates.
  const unsubscribeAddress = model.subscribe(() => address.update(model.snapshot()));
  let disposed = false, dailyRequest, dailyVersion = 0, last, predictionCache, simulationCache, solutionSelect;
  let goalFields = [];
  let materialMap = new Map();
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
  const setMax = (form, max) => {
    for (const input of form.querySelectorAll('input[type="number"], input[type="range"]')) input.max = String(max);
  };
  const material = (id) => materialNode(id, materialMap);
  const materialList = (ids) => html`<div class="fs-materials">${ids.map(material)}</div>`;
  const heldMaterial = (id) => !id || id === "air" || id === "NOTHING" ? html`<span class="fs-muted">No held material</span>`
    : id === "OTHER" ? html`<span class="fs-held">Any other material</span>` : material(id);
  const heldRole = (role) => role === "from" ? "Source" : role === "to" ? "Target" : "—";
  const replaceTable = (element, rows, options, grouping) => element.replaceChildren(staticTable(rows, options, grouping));

  const seed = Inputs.text({label: "World seed", value: initial.state.seed, placeholder: "Enter a world seed", width: "100%"});
  const mode = Inputs.radio(MODES.map((m) => m.id), {label: "Game mode", value: initial.state.mode,
    format: (id) => MODES.find((m) => m.id === id).label.replace("Apotheosis (", "").replace(")", ""),
  });
  mode.classList.add("fs-modes");
  const spoilers = Inputs.toggle({label: "Show extra modes (spoilers)", value: initial.state.spoilers});
  const view = Inputs.radio([...VIEWS.keys()], {value: initial.state.view, format: (id) => VIEWS.get(id)});
  view.classList.add("fs-tabs");
  const seedStatus = html`<p class="fs-status" role="status"></p>`;
  const seedError = html`<p class="fs-error" role="alert" hidden></p>`;
  const importError = html`<p class="fs-error" role="alert" hidden=${!initial.error}>${initial.error}</p>`;
  const copyStatus = html`<span class="fs-muted" role="status"></span>`;
  const copyInput = Inputs.text({label: "Share URL", value: "", readonly: true, width: "100%"});
  const copyFallback = html`<div class="fs-copy-fallback" hidden>${copyInput}</div>`;
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
    address.update(model.snapshot());
    address.flush();
    void copyLinkText(value, {
      clipboard: navigator.clipboard,
      fallback: (text) => {
        if (disposed) return false;
        copyInput.value = text;
        copyFallback.hidden = false;
        const input = copyInput.querySelector("input");
        input.focus({preventScroll: true});
        input.select();
        return document.execCommand?.("copy") === true;
      },
    }).then((copied) => {
      if (disposed) return;
      copyStatus.textContent = copied ? "Link copied." : "Copy the selected link below.";
      copyFallback.hidden = copied;
    });
  });
  const reset = button("Reset", () => {
    dailyVersion++; dailyRequest?.abort(); seedStatus.textContent = ""; importError.hidden = true;
    address.clear(); model.reset();
  });

  const goals = html`<div class="fs-goals"></div>`;
  const addGoal = button("+ Add goal", () => model.addGoal());
  const customInput = Inputs.text({label: "Material ID", placeholder: "my_mod_material", width: "100%"});
  const customStatus = html`<p role="status" class="fs-status"></p>`;
  const customAdd = button("Add material", () => {
    try { model.addMaterial(customInput.value); customStatus.textContent = "Material is available in the selectors."; }
    catch (error) { customStatus.textContent = error.message; }
  });
  const start = button("Find solutions", () => model.startSearch(), "fs-primary");
  const stop = button("Stop search", () => model.stopSearch());
  const showSolution = button("View solution in Simulation", () => model.selectRecipe(model.get().search.selected), "fs-view-solution");
  const searchStatus = html`<p class="fs-search-status" role="status" aria-live="polite"></p>`;
  const progress = html`<div class="fs-table fs-progress" hidden></div>`;
  const searchPanel = html`<section data-view="search">
    <div class="fs-panel-heading"><h2>Material goals</h2><p>Choose the material to change and its desired result. Effects are optional.</p></div>
    ${goals}<div class="fs-inline fs-goal-actions">${addGoal}</div>
    <p class="fs-air-note">Air is not shiftable. Empty fields mean no selection; an empty Effects field leaves effects unrestricted.</p>
    <div class="fs-search-actions"><div class="fs-inline">${start}${stop}${showSolution}</div>${searchStatus}</div>
    ${progress}
  </section>`;

  const cycle = number("NG+ cycle", 0, 28, initial.state.cycle);
  const predictionCount = html`<span class="fs-muted"></span>`;
  const predictions = html`<div class="fs-table fs-predictions"></div>`;
  const fromPool = html`<div class="fs-table fs-pool-table"></div>`;
  const toPool = html`<div class="fs-table fs-pool-table"></div>`;
  const predictionsPanel = html`<section data-view="predictions" hidden>
    <div class="fs-panel-heading"><h2>Shift predictions</h2><p>Held-material alternatives are grouped under the same shift number. Source and target overrides include rerolls.</p></div>
    <div class="fs-inline fs-panel-controls">${cycle}${predictionCount}</div>${predictions}
    <p class="fs-muted">“Any other material” excludes the special held materials listed in that shift. No held material means an empty hand, not shifting Air.</p>
    <details><summary>Probability tables</summary><p>Original relative weights, not percentages.</p>
      <div class="fs-pools"><div><h3>From material groups</h3>${fromPool}</div><div><h3>To materials</h3>${toPool}</div></div>
    </details>
  </section>`;

  const solutionsHost = html`<div class="fs-solution-selector"></div>`;
  const solutionSummary = html`<p class="fs-solution-summary"></p>`;
  const simCycle = number("Starting NG+", 0, 28, initial.state.cycle);
  const editShift = number("Edit shift", 1, MAX_SHIFTS, 1);
  const held = materialSelect(model.get().catalog, {label: "Held material", value: model.get().held[0] || "air", placeholder: "No held material",
    onChange: (value) => model.setHeld(editShift.value - 1, value),
  });
  const clearHeld = button("Clear held materials", () => model.clearHeld());
  const after = Inputs.range([0, MAX_SHIFTS], {label: "Inspect world after shift", value: initial.state.after, step: 1, width: "100%"});
  const transition = number("Enter next NG+ after shift", 1, MAX_SHIFTS, initial.state.transition);
  const transitionHint = html`<span class="fs-muted"></span>`;
  const simTable = html`<div class="fs-table fs-steps"></div>`;
  const simWorld = html`<div class="fs-table fs-world"></div>`;
  const worldTitle = html`<h3>Resulting world</h3>`;
  const simulationPanel = html`<section data-view="simulation" hidden>
    <div class="fs-panel-heading"><h2>Simulation</h2><p>Inspect a found solution or build your own sequence. Editing a solution switches it to a manual setup.</p></div>
    <div class="fs-solution-card">${solutionsHost}${solutionSummary}</div>
    <div class="fs-simulation-controls"><div class="fs-field">${simCycle}</div><div class="fs-field">${editShift}</div>${held.element}${clearHeld}</div>
    <details class="fs-transition"><summary>NG+ transition</summary><div class="fs-inline">${transition}${transitionHint}</div></details>
    <div class="fs-slider">${after}</div>
    <h3>Shift sequence</h3>${simTable}${worldTitle}${simWorld}
    <p class="fs-muted">Air means no held material and is not shiftable. Appearance and world effects are shown separately for chained shifts.</p>
  </section>`;
  const root = html`<div id="fungal-app">
    <header><div><h1>Fungal Shift Planner</h1><p>Find a solution, inspect your shifts, and simulate the resulting world.</p></div>
      <div class="fs-inline">${copy}${reset}${copyStatus}</div>
    </header>${copyFallback}${importError}
    <div class="fs-setup"><div class="fs-seed"><div class="fs-seed-row">${seed}${loadDaily}</div>${seedStatus}${seedError}</div>
      <div>${mode}${spoilers}</div>
    </div><div class="fs-mode-summary">${modeStatus}</div>
    ${view}${searchPanel}${predictionsPanel}${simulationPanel}
    <details class="fs-help"><summary>Add a custom material</summary><div class="fs-inline">${customInput}${customAdd}</div>${customStatus}</details>
    <details class="fs-help"><summary>How the planner works</summary>
      <p>Calculations come directly from the pinned noita-fungal submodule, including held-material rerolls and Hyper's 200 shifts. Results remain in their original discovery order.</p>
      <p>Material options accumulate from generated shifts and custom additions, as in the original tool. Names and images come from Bartender.</p>
      <p>Search can be stopped at any time. Stopping keeps partial results and does not claim the search is complete.</p>
    </details>
  </div>`;

  listen(seed, "input", () => { dailyVersion++; dailyRequest?.abort(); seedStatus.textContent = ""; model.setSeed(seed.value); });
  listen(mode, "input", () => model.setMode(mode.value));
  listen(spoilers, "input", () => model.setSpoilers(spoilers.value));
  listen(view, "input", () => model.setView(view.value));
  listen(cycle, "input", () => model.setCycle(cycle.value));
  listen(simCycle, "input", () => model.setCycle(simCycle.value));
  listen(after, "input", () => model.setAfter(after.value));
  listen(transition, "input", () => model.setTransition(transition.value));
  listen(editShift, "input", () => held.setValue(model.get().held[editShift.value - 1] || "air"));
  listen(window, "popstate", restoreLocation);
  listen(window, "hashchange", restoreLocation);
  function restoreLocation() {
    dailyVersion++; dailyRequest?.abort(); address.clear();
    const restored = readSession(location.href);
    importError.textContent = restored.error; importError.hidden = !restored.error;
    model.restore(restored.state);
  }

  const stepsOptions = {
    columns: ["iteration", "cycle", "held", "useHeld", "from", "to", "retries"],
    header: {iteration: "Shift", cycle: "NG+", held: "Held material", useHeld: "Used as", from: "From", to: "To", retries: "Rerolls"},
    format: {held: heldMaterial, useHeld: heldRole, from: materialList, to: material},
    height: 360, layout: "fixed", width: {iteration: 55, cycle: 48, useHeld: 72, retries: 60, from: "36%"},
  };
  const worldOptions = {columns: ["material", "appearance", "effects"],
    header: {material: "Original material", appearance: "Appearance / flask ingestion", effects: "Stains / world ingestion / alchemy"},
    format: {material, appearance: material, effects: material}, height: 320, layout: "fixed",
  };

  function disposeGoal(row) { Object.values(row.fields).forEach((field) => field.dispose()); row.element.remove(); }
  function renderGoals(state, catalogChanged) {
    while (goalFields.length > state.goals.length) disposeGoal(goalFields.pop());
    state.goals.forEach((goal, index) => {
      let row = goalFields[index];
      if (!row) {
        row = {fields: {}, element: null};
        for (const [key, label] of [["base", "From material"], ["target", "To material"], ["stain", "Effects (optional)"]]) {
          row.fields[key] = materialSelect(state.catalog, {label, value: goal[key], count: key === "base",
            placeholder: key === "stain" ? "Any world effects" : key === "base" ? "Choose source material…" : "Choose target material…",
            onChange: (value) => model.setGoal(goalFields.indexOf(row), key, value)});
        }
        const remove = button("×", () => {
          const current = goalFields.indexOf(row);
          if (current < 0) return;
          goalFields.splice(current, 1); disposeGoal(row); model.removeGoal(current);
        }, "fs-remove");
        remove.querySelector("button").setAttribute("aria-label", "Remove goal");
        row.element = html`<div class="fs-goal">${row.fields.base.element}${row.fields.target.element}${row.fields.stain.element}${remove}</div>`;
        goals.append(row.element); goalFields.push(row);
      } else for (const key of ["base", "target", "stain"]) {
        if (catalogChanged) row.fields[key].setCatalog(state.catalog, goal[key]);
        else row.fields[key].setValue(goal[key]);
      }
    });
  }

  const unsubscribe = model.subscribe((state) => {
    const catalogChanged = !last || state.catalog !== last.catalog;
    if (catalogChanged) {
      materialMap = materialMetadata(base, apotheosis, state.mode);
      for (const entry of state.catalog) materialMap.set(entry.id, entry);
    }
    if (!last || state.seed !== last.seed) seed.value = state.seed;
    if (!last || state.mode !== last.mode) mode.value = state.mode;
    if (!last || state.spoilers !== last.spoilers || state.mode !== last.mode) {
      spoilers.value = state.spoilers;
      [...mode.querySelectorAll('input[type="radio"]')].forEach((radio, i) => {
        radio.closest("label").hidden = !!MODES[i].spoiler && !state.spoilers && MODES[i].id !== state.mode;
      });
    }
    seedError.textContent = state.seedError; seedError.hidden = !state.seedError;
    if (!last || state.view !== last.view) {
      view.value = state.view;
      for (const panel of [searchPanel, predictionsPanel, simulationPanel]) panel.hidden = panel.dataset.view !== state.view;
    }
    const modeLimit = maxShifts[state.mode];
    const solution = state.simulationSolution == null ? null : state.search.recipes[state.simulationSolution];
    const simulationLimit = solution ? solution.length : modeLimit;
    setMax(editShift, modeLimit); setMax(after, simulationLimit); setMax(transition, modeLimit);
    if (editShift.value > modeLimit) editShift.value = modeLimit;
    if (!last || state.cycle !== last.cycle) { cycle.value = state.cycle; simCycle.value = state.cycle; }
    after.value = Math.min(state.after, simulationLimit);
    transition.value = state.transition;
    transition.querySelector("input").disabled = state.cycle === 28;
    transitionHint.textContent = `${modeLimit} means no NG+ transition.`;
    if (!last || catalogChanged || state.goals !== last.goals) renderGoals(state, catalogChanged);
    if (catalogChanged) held.setCatalog(state.catalog, state.held[editShift.value - 1] || "air");
    else if (!last || state.held !== last.held) held.setValue(state.held[editShift.value - 1] || "air");

    if (!last || state.mode !== last.mode) {
      const pools = poolRows(state.mode);
      modeStatus.textContent = `${MODES.find((m) => m.id === state.mode).label} · ${modeLimit} shifts · ${pools.from.length} source groups · ${pools.to.length} targets`;
    }
    const search = state.search;
    if (!last || search !== last.search) {
      start.querySelector("button").disabled = search.status === "running";
      stop.querySelector("button").disabled = search.status !== "running";
      showSolution.hidden = !search.recipes.length;
      const stats = search.progress;
      searchStatus.textContent = search.error || ({idle: "Choose goals, then search for solutions.", running: "Searching…", stopped: "Stopped. Results are partial.", complete: "Search complete."}[search.status])
        + (stats ? ` ${stats.tested.toLocaleString()} candidates checked · ${stats.found} solutions found.` : "");
      progress.hidden = !stats;
      if (stats) replaceTable(progress, [stats], {columns: ["cycle", "tested", "queued", "found", "shortest"],
        header: {cycle: "NG+", tested: "Candidates checked", queued: "Remaining", found: "Solutions", shortest: "Fewest shifts"},
        format: {shortest: (value) => value ?? "—"}, height: 85, layout: "fixed"});
    }
    if (!last || search.recipes.length !== last.search.recipes.length) {
      solutionSelect = Inputs.select(["manual", ...search.recipes.map((_, index) => String(index))], {
        label: "Sequence", width: "100%", value: state.simulationSolution == null ? "manual" : String(state.simulationSolution),
        format: (id) => {
          if (id === "manual") return "Manual setup";
          const item = search.recipes[Number(id)];
          return `Solution ${Number(id) + 1} · ${item.length} shifts · NG+ ${item.base_ng}`;
        },
      });
      solutionSelect.addEventListener("input", () => {
        if (solutionSelect.value === "manual") model.useManualSimulation();
        else model.selectRecipe(Number(solutionSelect.value));
      });
      solutionsHost.replaceChildren(solutionSelect);
    } else solutionSelect.value = state.simulationSolution == null ? "manual" : String(state.simulationSolution);
    solutionSummary.textContent = solution ? `Solution ${state.simulationSolution + 1}: ${solution.length} shifts, starting in NG+ ${solution.base_ng}.`
      + (solution.shift_nr < solution.length ? ` Enter NG+ ${solution.base_ng + 1} after shift ${solution.shift_nr}.` : "")
      : "Choose a found solution above, or set held materials below.";

    if (state.view === "predictions" && (!predictionCache || catalogChanged || state.world !== predictionCache.world || state.cycle !== predictionCache.cycle || state.mode !== predictionCache.mode)) {
      const shifts = state.world?.all_shifts[state.cycle] ?? [];
      const rows = predictionRows(shifts);
      predictionCount.textContent = `${shifts.length} shifts · ${rows.length} held-material outcomes`;
      replaceTable(predictions, rows, {
        columns: ["iteration", "held", "useHeld", "from", "to", "retries"],
        header: {iteration: "Shift", held: "Held material", useHeld: "Used as", from: "From", to: "To", retries: "Rerolls"},
        format: {held: heldMaterial, useHeld: heldRole, from: materialList, to: material},
        height: 500, layout: "fixed", width: {iteration: 55, useHeld: 72, retries: 60, from: "38%"},
      }, {groupBy: "iteration"});
      const pools = poolRows(state.mode);
      replaceTable(fromPool, pools.from, {columns: ["materials", "weight"], header: {materials: "From group", weight: "Weight"},
        format: {materials: materialList, weight: String}, height: 300, layout: "fixed", width: {weight: 80}});
      replaceTable(toPool, pools.to, {columns: ["material", "weight"], header: {material: "To material", weight: "Weight"},
        format: {material, weight: String}, height: 300, layout: "fixed", width: {weight: 80}});
      predictionCache = state;
    }
    if (state.view === "simulation" && (!simulationCache || catalogChanged || state.world !== simulationCache.world || state.cycle !== simulationCache.cycle || state.held !== simulationCache.held || state.after !== simulationCache.after || state.transition !== simulationCache.transition || state.simulationSolution !== simulationCache.simulationSolution)) {
      const simulation = simulationView(state);
      replaceTable(simTable, simulation.steps, stepsOptions);
      replaceTable(simWorld, simulation.world, worldOptions);
      worldTitle.textContent = `World after ${simulation.count} shifts`;
      simulationCache = state;
    }
    last = state;
  });

  root.dispose = () => {
    disposed = true; dailyVersion++; dailyRequest?.abort();
    unsubscribeAddress(); unsubscribe(); model.dispose(); address.dispose();
    disposers.forEach((dispose) => dispose()); goalFields.forEach(disposeGoal); held.dispose();
  };
  if (!initial.state.seed) void daily();
  return root;
}
