import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

class Control extends EventTarget {
  constructor(value) { super(); this.value = value; }
  change(value) { this.value = value; this.dispatchEvent(new Event("input", {bubbles: true})); }
}
const source = readFileSync(new URL("../src/digging/options.js", import.meta.url), "utf8")
  .replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "");
const create = runInNewContext(source + "\ncreateDiggingOptions", {
  html: () => new EventTarget(), Event,
});
const Inputs = {toggle: ({value}) => new Control(value)};
const value = (control) => JSON.parse(JSON.stringify(control.element.value));

test("the most recently checked Glass Cannon option wins without changing Berserkium", () => {
  const controls = create(Inputs);
  const values = [];
  controls.element.addEventListener("input", () => values.push(value(controls)));
  controls.berserkium.change(true);
  controls.glassCannon.change(true);
  assert.equal(controls.glassCannon2.value, false);
  controls.glassCannon2.change(true);
  assert.equal(controls.glassCannon.value, false);
  controls.glassCannon.change(true);
  assert.equal(controls.glassCannon2.value, false);
  controls.glassCannon.change(false);
  assert.deepEqual(values, [
    {glassCannon: 0, berserkium: true}, {glassCannon: 1, berserkium: true},
    {glassCannon: 2, berserkium: true}, {glassCannon: 1, berserkium: true},
    {glassCannon: 0, berserkium: true},
  ]);
});

test("restoring and resetting controls emits one complete state and disposal removes listeners", () => {
  const controls = create(Inputs, {glassCannon: 2, berserkium: true});
  assert.equal(controls.glassCannon.value, false);
  assert.equal(controls.glassCannon2.value, true);
  const values = [];
  controls.element.addEventListener("input", () => values.push(value(controls)));
  controls.setValue({glassCannon: 1, berserkium: false});
  controls.setValue();
  assert.deepEqual(values, [{glassCannon: 1, berserkium: false}, {glassCannon: 0, berserkium: false}]);
  controls.dispose();
  controls.glassCannon2.change(true);
  assert.equal(values.length, 2);
});
