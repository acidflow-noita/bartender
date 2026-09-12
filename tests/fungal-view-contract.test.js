import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {selectedMaterial} from "../src/fungal/catalog.js";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("material selection accepts the installed Choices API's scalar and empty values", () => {
  const library = read("node_modules/choices.js/public/assets/scripts/choices.mjs");
  const method = library.match(/Choices\.prototype\.getValue = (function \(valueOnly\) \{[\s\S]*?\n    \});/);
  assert.ok(method);
  const getValue = runInNewContext(`(${method[1]})`);
  for (const singleModeForMultiSelect of [true, false]) {
    const choices = {config: {singleModeForMultiSelect}, _isSelectOneElement: false, _store: {items: []}, getValue};
    assert.equal(selectedMaterial(choices.getValue(true)), "air");
    for (const value of ["water", "apotheosis_magic_liquid_divine", "air"]) {
      choices._store.items = [{value}];
      assert.equal(selectedMaterial(choices.getValue(true)), value);
    }
    choices._store.items = [];
    assert.equal(selectedMaterial(choices.getValue(true)), "air");
  }
});

test("the page mounts one stable app, rather than interdependent reactive input cells", () => {
  const page = read("src/fungal_shifting.md");
  assert.match(page, /display\(app\)/);
  assert.match(page, /invalidation.then\(\(\) => app.dispose\(\)\)/);
  assert.doesNotMatch(page, /Generators|Inputs.bind|window.appState/);
  assert.doesNotMatch(page, /html``|:\s*null\s*\}/);
  const selector = read("src/fungal/select.js");
  assert.match(selector, /singleModeForMultiSelect: true/);
  assert.match(selector, /selectedMaterial\(choices.getValue\(true\)\)/);
  assert.doesNotMatch(selector, /getValue\(true\)\[0\]|maxItemText|Remove the current/);
});

test("view binds each visible control to an explicit model action", () => {
  const app = read("src/fungal/app.js");
  for (const [input, action] of [["seed", "setSeed"], ["mode", "setMode"], ["spoilers", "setSpoilers"], ["view", "setView"], ["cycle", "setCycle"], ["simCycle", "setCycle"], ["after", "setAfter"]]) {
    assert.match(app, new RegExp(`listen\\(${input}, "input", [^\\n]*model\\.${action}\\(${input}\\.value\\)`));
  }
  assert.match(app, /new Worker\(import.meta.resolve\("\.\/search-worker.js"\)/);
  assert.match(app, /model.subscribe\(\(\) => address.update\(model.snapshot\(\)\)\)/);
  assert.match(app, /listen\(window, "popstate", restoreLocation\)/);
});

test("simulation output space is reserved even when zero shifts have been applied", () => {
  const css = read("src/fungal/fungal.css");
  assert.match(css, /\.fs-steps\s*\{\s*height:\s*360px/);
  assert.match(css, /\.fs-world\s*\{[^}]*height:\s*320px/);
  assert.match(css, /#fungal-app form > label\s*\{[^}]*width:\s*auto/);
  assert.match(css, /#fungal-app \.fs-tabs\s*\{[^}]*width:\s*100%/);
  const app = read("src/fungal/app.js");
  assert.match(app, /height: 360/);
  assert.match(app, /height: 320/);
  assert.doesNotMatch(app, /Generators|Inputs.bind|window.appState/);
});

test("solutions live in Simulation, not in duplicate result tables under the search form", () => {
  const app = read("src/fungal/app.js");
  const search = app.match(/const searchPanel = html`([\s\S]*?)`;/)[1];
  const simulation = app.match(/const simulationPanel = html`([\s\S]*?)`;/)[1];
  assert.ok(search.includes("${showSolution}"));
  assert.doesNotMatch(search, /recipeTable|recipeWorld|simTable|simWorld|solutionsHost/);
  for (const name of ["solutionsHost", "solutionSummary", "simTable", "simWorld"]) assert.ok(simulation.includes("${" + name + "}"));
  assert.match(app, /model.selectRecipe\(Number\(solutionSelect.value\)\)/);
});

test("UI uses source/target wording, explains Air, and wraps From materials horizontally", () => {
  const app = read("src/fungal/app.js");
  const selector = read("src/fungal/select.js");
  const css = read("src/fungal/fungal.css");
  assert.doesNotMatch(app, /Sacrifice|sacrifices|Presentation|Interpretation|countenance|anfractuous/);
  assert.match(app, /Air is not shiftable/);
  assert.match(selector, /not shiftable/);
  assert.match(css, /\.fs-materials\s*\{[^}]*flex-flow:\s*row wrap/);
  assert.match(app, /groupBy: "iteration"/);
  assert.doesNotMatch(app, /Inputs.table\(/, "all tables must use the non-sortable adapter");
  const first = app.indexOf("model.subscribe(() => address.update");
  assert.ok(first >= 0 && first < app.indexOf("model.subscribe((state) =>"), "URL sync must not depend on successful UI rendering");
});
