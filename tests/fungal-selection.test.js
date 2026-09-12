// Execute the production selector's value/option methods in Node against the
// installed Choices getValue API. No browser, layout, or DOM emulation.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createContext, runInContext, runInNewContext} from "node:vm";
import {parseProgram} from "../node_modules/@observablehq/framework/dist/javascript/parse.js";
import {createModel} from "../src/fungal/model.js";
import {emptySession} from "../src/fungal/session.js";
import {selectedMaterial} from "../src/fungal/catalog.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const source = read("../src/fungal/select.js");
function* nodes(node) {
  if (!node || typeof node !== "object") return;
  if (node.type) yield node;
  for (const child of Object.values(node)) {
    if (Array.isArray(child)) for (const item of child) yield* nodes(item);
    else if (child && typeof child === "object") yield* nodes(child);
  }
}
const tree = [...nodes(parseProgram(source))];
const snippet = (node) => source.slice(node.start, node.end);
const options = tree.find((n) => n.type === "VariableDeclarator" && n.id.name === "options").init;
const constructor = tree.find((n) => n.type === "NewExpression" && n.callee.name === "Choices");
const initialOptions = constructor.arguments[1].properties.find((p) => p.key.name === "choices").value;
const methods = Object.fromEntries(tree.filter((n) => n.type === "Property" && n.method && ["setValue", "setCatalog"].includes(n.key.name)).map((n) => [n.key.name, n]));
const onChange = tree.find((n) => n.type === "CallExpression" && n.callee.object?.name === "select"
  && n.callee.property?.name === "addEventListener" && n.arguments[0].value === "change").arguments[1];
const implementation = read("../node_modules/choices.js/public/assets/scripts/choices.mjs")
  .match(/Choices\.prototype\.getValue = (function \(valueOnly\) \{[\s\S]*?\n    \});/)[1];
const getValue = runInNewContext(`(${implementation})`);
const catalog = [{id: "air", name: "Air"}, {id: "water", name: "Water"}, {id: "oil", name: "Oil"}];

function field(value = "air", single = true, initialCatalog = catalog) {
  const changes = [];
  const choices = {
    _store: {items: []}, _isSelectOneElement: false, config: {singleModeForMultiSelect: single}, getValue,
    options: [],
    removeActiveItems() { this._store.items = []; },
    setChoiceByValue(value) { this._store.items = [{value}]; },
    setChoices(options, value, label, replace = true, clearSearch, replaceItems = replace) {
      this.options = replace ? options : [...this.options, ...options];
      if (replaceItems) this._store.items = options.filter((o) => o.selected);
    },
  };
  const context = createContext({choices, selectedMaterial, value, catalog: initialCatalog, muted: false, map: new Map(initialCatalog.map((m) => [m.id, m])), counter: {}, onChange: (value) => changes.push(value)});
  runInContext(`const options = ${snippet(options)};`, context);
  choices.setChoices(runInContext(snippet(initialOptions), context));
  return {
    choices, changes,
    setValue: runInContext(`({${snippet(methods.setValue)}}).setValue`, context),
    setCatalog: runInContext(`({${snippet(methods.setCatalog)}}).setCatalog`, context),
    change: runInContext(`(${snippet(onChange)})`, context),
  };
}

test("default Air sentinels display no preselected chip while Air remains an option", () => {
  for (const value of ["air", "", null]) {
    const {choices} = field(value);
    assert.equal(choices._store.items.length, 0);
    assert.ok(choices.options.some((o) => o.value === "air"));
    assert.equal(selectedMaterial(choices.getValue(true)), "air");
  }
  assert.equal(field("water").choices.getValue(true), "water");
});

test("clearing and subsequent model updates leave the field empty, not refilled with Air", () => {
  for (const single of [true, false]) {
    const f = field("water", single);
    f.choices.removeActiveItems();
    f.change();
    assert.deepEqual(f.changes, ["air"]);
    assert.equal(f.choices._store.items.length, 0);
    f.setValue("air");
    f.setCatalog(catalog, "air");
    assert.equal(f.choices._store.items.length, 0);
    f.setValue("water");
    f.setValue("air");
    assert.equal(f.choices._store.items.length, 0);
  }
});

test("explicitly selecting Air still works and survives value/catalog refreshes", () => {
  for (const single of [true, false]) {
    const f = field("air", single);
    f.choices.setChoiceByValue("air");
    f.change();
    assert.deepEqual(f.changes, ["air"]);
    f.setValue("air");
    f.setCatalog(catalog, "air");
    assert.equal(f.choices._store.items.length, 1);
    assert.equal(f.choices._store.items[0].value, "air");
    f.setValue("oil");
    assert.equal(selectedMaterial(f.choices.getValue(true)), "oil");
  }
});

test("existing dropdowns append source additions; newly added fields use the source's ID sort", () => {
  const original = JSON.parse(read("./fungal-upstream-fixtures.json"));
  const base = JSON.parse(read("../src/data/FULL_MATERIALS_FINAL.json"));
  for (const snapshots of original.ui.catalogLifecycles) {
    const {seed, mode} = snapshots[0].action;
    const model = createModel({...emptySession(), seed, mode}, {base, apotheosis: [], workerFactory() { throw new Error("not searching"); }});
    const existing = field("air", true, model.get().catalog);
    assert.deepEqual(Array.from(existing.choices.options, (o) => o.value), snapshots[0].existingOptions);
    for (const {action, existingOptions, newOptions} of snapshots.slice(1)) {
      if (action.type === "seed") model.setSeed(action.seed);
      else if (action.type === "mode") model.setMode(action.mode);
      else model.addMaterial(action.id);
      existing.setCatalog(model.get().catalog);
      assert.deepEqual(Array.from(existing.choices.options, (o) => o.value), existingOptions, JSON.stringify(action));
      const added = field("air", true, model.get().catalog);
      assert.deepEqual(Array.from(added.choices.options, (o) => o.value), newOptions);
    }
    model.reset();
    existing.setCatalog(model.get().catalog);
    assert.deepEqual(Array.from(existing.choices.options, (o) => o.value), ["air"]);
    model.dispose();
  }
});
