// Run the actual page cells through Observable's compiler and runtime in Node.
// Controls are event targets; this does not launch or emulate a browser.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {Runtime} from "@observablehq/runtime";
import {parseJavaScript} from "../node_modules/@observablehq/framework/dist/javascript/parse.js";
import {transpileJavaScript} from "../node_modules/@observablehq/framework/dist/javascript/transpile.js";
import {input} from "../node_modules/@observablehq/framework/dist/client/stdlib/generators/input.js";
import {isDiggingSpell, evaluateDigging} from "../src/digging/model.js";
import {DIGGING_DEFAULTS, readDiggingParams, diggingUrl} from "../src/digging/url.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const spells = JSON.parse(read("../src/data/FULL_SPELLS_FINAL.json"));
const materials = JSON.parse(read("../src/data/FULL_MATERIALS_FINAL.json"));

class Control extends EventTarget {
  constructor(value) { super(); this.value = value; }
  change(value) { this.value = value; this.dispatchEvent(new Event("input")); }
}

function loadPage(t, href = "https://example.test/digging") {
  const created = [];
  const copied = [];
  const window = new EventTarget();
  window.location = {href};
  window.history = {state: {keep: true}, replaceState(state, title, next) {
    assert.equal(state, this.state, "URL updates preserve navigation state");
    window.location.href = next;
  }};
  const runtime = new Runtime({
    Generators: () => ({input}), Event: () => Event,
    DIGGING_DEFAULTS: () => DIGGING_DEFAULTS,
    readDiggingParams: () => readDiggingParams, diggingUrl: () => diggingUrl,
    createShareButton: () => (getUrl) => {
      const button = {disabled: false, click() {if (!this.disabled) copied.push(getUrl());}};
      return {button: {querySelector: () => button}, feedback: {}, clear() {}};
    },
    createResetButton: () => (Inputs, onReset) => Inputs.button("Reset", {reduce: onReset}),
    isDiggingSpell: () => isDiggingSpell, evaluateDigging: () => evaluateDigging,
    FileAttachment: () => (path) => ({json: async () => path.includes("FULL_SPELLS") ? spells : materials}),
    Inputs: () => ({toggle: ({value}) => new Control(value), button: (_, {reduce}) => ({click: reduce})}),
    createDiggingSelect: () => (items, {value}) => {
      const element = new Control(items.find((item) => item.id === value) ?? null);
      const picker = {element, items, setValue(id) {element.change(items.find((item) => item.id === id) ?? null);}, dispose() {}};
      created.push(picker);
      return picker;
    },
  });
  t.after(() => runtime.dispose());
  const main = runtime.module();
  const define = ({id, inputs = [], outputs = [], body}) => {
    main.variable(true).define(`cell ${id}`, inputs, body);
    for (const name of outputs) main.variable(true).define(name, [`cell ${id}`], (exports) => exports[name]);
  };
  let id = 0;
  for (const [, code] of read("../src/digging.md").matchAll(/```js\r?\n([\s\S]*?)\r?\n```/g)) {
    if (/^import /m.test(code)) continue;
    const options = {id: String(id++), path: "/digging"};
    runInNewContext(transpileJavaScript(parseJavaScript(code, options), options), {define, Event, window});
  }
  return {main, created, window, copied};
}

test("digging page resolves selected values before calculating and preserves both single selections", async (t) => {
  const {main, created, window, copied} = loadPage(t);
  assert.equal((await main.value("result")).status, "empty", "the page must not choose a spell or material implicitly");
  assert.equal(await main.value("selectedSpell"), null);
  assert.equal(await main.value("selectedMaterial"), null);
  assert.equal(await main.value("spellAssumptions"), "");
  assert.equal(await main.value("shareUrl"), "https://example.test/digging");
  const shareButton = (await main.value("shareControl")).button.querySelector("button");
  assert.equal(shareButton.disabled, true);
  shareButton.click();
  assert.deepEqual(copied, [], "an incomplete pair cannot be shared");
  const spellPicker = await main.value("spellPicker");
  const materialPicker = await main.value("materialPicker");
  assert.equal(materialPicker.items.length, materials.length, "all materials remain selectable");
  spellPicker.setValue("DIGGER");
  assert.equal((await main.value("result")).status, "empty");
  assert.equal(await main.value("spellAssumptions"), "");
  assert.equal(await main.value("shareUrl"), "https://example.test/digging?spell=DIGGER");
  assert.equal(shareButton.disabled, true);
  materialPicker.setValue("soil");
  assert.equal((await main.value("result")).radius, 6);
  assert.equal(await main.value("spellAssumptions"), "Digging Bolt without modifiers, perks, or wand bonuses.");
  const diggingBoltUrl = "https://example.test/digging?spell=DIGGER&material=soil";
  assert.equal(await main.value("shareUrl"), diggingBoltUrl);
  assert.equal(window.location.href, diggingBoltUrl);
  assert.equal(shareButton.disabled, false);
  shareButton.click();
  assert.deepEqual(copied, [diggingBoltUrl], "the former default pair must include both IDs in its shared link");
  spellPicker.setValue("NUKE");
  assert.equal((await main.value("result")).radius, 250);
  materialPicker.setValue("rock_static");
  assert.ok(Math.abs((await main.value("result")).radius - 95.01) < 0.01);
  assert.equal((await main.value("selectedSpell")).id, "NUKE");
  spellPicker.setValue("DIGGER");
  assert.ok(Math.abs((await main.value("result")).radius - Math.SQRT2) < 0.001);
  assert.equal((await main.value("selectedMaterial")).id, "rock_static");
  materialPicker.setValue("templebrick_static");
  assert.equal((await main.value("result")).status, "blocked");
  spellPicker.setValue("BLACK_HOLE");
  assert.equal((await main.value("result")).radius, 12);

  const fitControl = await main.value("fitControl");
  fitControl.change(true);
  assert.equal(await main.value("fitRadius"), true);
  assert.equal((await main.value("result")).radius, 12);
  const expectedUrl = "https://example.test/digging?spell=BLACK_HOLE&material=templebrick_static&fit=1";
  assert.equal(await main.value("shareUrl"), expectedUrl);
  assert.equal(window.location.href, expectedUrl, "the address bar follows selections and zoom");
  shareButton.click();
  assert.deepEqual(copied, [diggingBoltUrl, expectedUrl], "Share copies the current selection");
  (await main.value("resetButton")).click();
  assert.equal((await main.value("result")).status, "empty");
  assert.equal(await main.value("selectedSpell"), null);
  assert.equal(await main.value("selectedMaterial"), null);
  assert.equal(await main.value("fitRadius"), false);
  assert.equal(await main.value("shareUrl"), "https://example.test/digging");
  assert.equal(window.location.href, "https://example.test/digging", "Reset removes all digging parameters");
  assert.equal(shareButton.disabled, true);
  assert.equal(created.length, 2, "selections and zoom must not recreate the dropdowns");
});

test("a shared digging link restores the result and fit before the first render", async (t) => {
  const {main, created, window, copied} = loadPage(t,
    "https://example.test/digging?spell=NUKE&material=rock_static&fit=1");
  assert.ok(Math.abs((await main.value("result")).radius - 95.01) < 0.01);
  assert.equal((await main.value("selectedSpell")).id, "NUKE");
  assert.equal((await main.value("selectedMaterial")).id, "rock_static");
  assert.equal(await main.value("fitRadius"), true);
  assert.equal(await main.value("shareUrl"), window.location.href);

  window.location.href = "https://example.test/digging?spell=ACIDSHOT&material=templebrick_static";
  window.dispatchEvent(new Event("popstate"));
  const result = await main.value("result");
  assert.equal(result.status, "digs");
  assert.equal(result.method, "acid");
  assert.equal(result.radius, null);
  assert.equal(await main.value("fitRadius"), false);
  assert.equal(await main.value("shareUrl"), window.location.href);
  (await main.value("shareControl")).button.querySelector("button").click();
  assert.equal(copied[0], window.location.href);
  assert.equal(created.length, 2, "restoring navigation reuses the controls");
});

test("invalid shared choices stay empty without losing a valid selection", async (t) => {
  const {main, window} = loadPage(t, "https://example.test/digging?spell=missing&material=rock_hard&fit=no");
  assert.equal(await main.value("selectedSpell"), null);
  assert.equal((await main.value("selectedMaterial")).id, "rock_hard");
  assert.equal((await main.value("result")).status, "empty");
  assert.equal(await main.value("fitRadius"), false);
  assert.equal(await main.value("shareUrl"), "https://example.test/digging?material=rock_hard");
  assert.equal(window.location.href, "https://example.test/digging?material=rock_hard");
  assert.equal((await main.value("shareControl")).button.querySelector("button").disabled, true);
});

test("navigation to a partial or empty link clears prior selections and disables Share", async (t) => {
  const {main, window, copied, created} = loadPage(t, "https://example.test/digging?spell=DIGGER&material=soil");
  assert.equal(await main.value("shareUrl"), window.location.href);
  const shareButton = (await main.value("shareControl")).button.querySelector("button");
  assert.equal(shareButton.disabled, false);
  for (const [query, spell, material] of [["?spell=DIGGER", "DIGGER", null], ["?material=soil", null, "soil"], ["", null, null]]) {
    window.location.href = `https://example.test/digging${query}`;
    window.dispatchEvent(new Event("popstate"));
    assert.equal((await main.value("selectedSpell"))?.id ?? null, spell);
    assert.equal((await main.value("selectedMaterial"))?.id ?? null, material);
    assert.equal((await main.value("result")).status, "empty");
    assert.equal(await main.value("shareUrl"), `https://example.test/digging${query}`);
    assert.equal(shareButton.disabled, true);
    shareButton.click();
  }
  assert.deepEqual(copied, []);
  assert.equal(created.length, 2, "clearing selections reuses the existing dropdowns");
});

test("the reported Glowing Lance URL resolves to penetration, not an explosion-only failure", async (t) => {
  const href = "http://127.0.0.1:3000/digging?spell=LANCE&material=templebrick_noedge_static";
  const {main, window} = loadPage(t, href);
  const result = await main.value("result");
  assert.equal(result.status, "path");
  assert.equal(result.method, "path");
  assert.equal(result.radius, null);
  assert.equal(await main.value("shareUrl"), href);
  assert.equal(window.location.href, href);
});

test("shared lance selection computes its launch-speed range without additional controls", async (t) => {
  const href = "https://example.test/digging?spell=LANCE&material=templebrick_noedge_static";
  const {main, created} = loadPage(t, href);
  const result = await main.value("result");
  assert.deepEqual(result.penetration.contacts.map((contact) => contact.speed), [300, 400]);
  assert.deepEqual(result.penetration.contacts.map((contact) => contact.impacts), [6, 4]);
  assert.equal(await main.value("shareUrl"), href);
  assert.equal(created.length, 2);
});
