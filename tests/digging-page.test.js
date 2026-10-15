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
import {isDiggingSpell} from "../src/digging/model.js";
import {evaluateComparison} from "../src/digging/comparison.js";
import {DIGGING_DEFAULTS, readDiggingParams, diggingUrl, getDiggingSpellLimit} from "../src/digging/url.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const spells = JSON.parse(read("../src/data/FULL_SPELLS_FINAL.json"));
const materials = JSON.parse(read("../src/data/FULL_MATERIALS_FINAL.json"));

class Control extends EventTarget {
  constructor(value) { super(); this.value = value; }
  change(value) { this.value = value; this.dispatchEvent(new Event("input")); }
}

const optionsSource = read("../src/digging/options.js").replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "");
const createOptions = runInNewContext(optionsSource + "\ncreateDiggingOptions", {html: () => new EventTarget(), Event});
const plain = (value) => JSON.parse(JSON.stringify(value));

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
    getDiggingSpellLimit: () => getDiggingSpellLimit,
    createShareButton: () => (getUrl) => {
      const button = {disabled: false, click() {if (!this.disabled) copied.push(getUrl());}};
      return {button: {querySelector: () => button}, feedback: {}, clear() {}};
    },
    createResetButton: () => (Inputs, onReset) => Inputs.button("Reset", {reduce: onReset}),
    isDiggingSpell: () => isDiggingSpell, evaluateComparison: () => evaluateComparison,
    createDiggingOptions: () => createOptions,
    FileAttachment: () => (path) => ({json: async () => path.includes("FULL_SPELLS") ? spells : materials}),
    Inputs: () => ({toggle: ({value}) => new Control(value), button: (_, {reduce}) => ({click: reduce})}),
    createDiggingSelect: () => (items, {value, multiple, maxItems = Infinity}) => {
      const byId = new Map(items.map((item) => [item.id, item]));
      const resolve = (ids) => multiple ? [...new Set(Array.isArray(ids) ? ids : ids ? [ids] : [])].map((id) => byId.get(id)).filter(Boolean).slice(0, maxItems)
        : byId.get(ids) ?? null;
      const element = new Control(resolve(value));
      const picker = {element, items, multiple, maxItems, setValue(ids) {element.change(resolve(ids));}, dispose() {}};
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

test("comparison page starts empty, shares every selection, and resets all controls", async (t) => {
  const {main, created, window, copied} = loadPage(t);
  assert.deepEqual(await main.value("comparisons"), []);
  assert.deepEqual(await main.value("selectedSpells"), []);
  assert.equal(await main.value("selectedMaterial"), null);
  assert.equal(await main.value("spellAssumptions"), "");
  assert.equal(await main.value("shareUrl"), "https://example.test/digging");
  const share = (await main.value("shareControl")).button.querySelector("button");
  assert.equal(share.disabled, true);
  const picker = await main.value("spellPicker");
  const target = await main.value("materialPicker");
  assert.equal(picker.multiple, true);
  assert.equal(picker.maxItems, 5);
  assert.equal(target.items.length, materials.length);
  picker.setValue(["DIGGER", "NUKE"]);
  assert.deepEqual(await main.value("comparisons"), []);
  assert.equal(await main.value("shareUrl"), "https://example.test/digging?spell=DIGGER&spell=NUKE");
  assert.equal(share.disabled, true);
  target.setValue("soil");
  let entries = await main.value("comparisons");
  assert.deepEqual(entries.map(({spell}) => spell.id), ["DIGGER", "NUKE"]);
  assert.deepEqual(entries.map(({result}) => result.radius), [6, 250]);
  assert.notEqual(entries[0].color, entries[1].color);
  assert.match(await main.value("spellAssumptions"), /without perks or Berserkium/);
  assert.equal(await main.value("shareUrl"), "https://example.test/digging?spell=DIGGER&spell=NUKE&material=soil");
  assert.equal(share.disabled, false);
  const controls = await main.value("optionsControl");
  controls.glassCannon.change(true);
  assert.deepEqual(plain(await main.value("modifiers")), {glassCannon: 1, berserkium: false});
  entries = await main.value("comparisons");
  assert.ok(entries.every(({result}, i) => result.radius > [6, 250][i]));
  controls.glassCannon2.change(true);
  assert.equal(controls.glassCannon.value, false);
  controls.berserkium.change(true);
  (await main.value("fitControl")).change(true);
  const href = "https://example.test/digging?spell=DIGGER&spell=NUKE&material=soil&fit=1&glassCannon=2&berserkium=1";
  assert.equal(await main.value("shareUrl"), href);
  assert.equal(window.location.href, href);
  share.click();
  assert.deepEqual(copied, [href]);
  (await main.value("resetButton")).click();
  assert.deepEqual(await main.value("comparisons"), []);
  assert.deepEqual(await main.value("selectedSpells"), []);
  assert.equal(await main.value("selectedMaterial"), null);
  assert.deepEqual(plain(await main.value("modifiers")), {glassCannon: 0, berserkium: false});
  assert.equal(await main.value("fitRadius"), false);
  assert.equal(await main.value("shareUrl"), "https://example.test/digging");
  assert.equal(share.disabled, true);
  assert.equal(created.length, 2, "changes must reuse both Choices instances");
});

test("the page limits oversized links at the input and copies only readable comparison state", async (t) => {
  const ids = ["NUKE", "DIGGER", "BLACK_HOLE", "LUMINOUS_DRILL", "LANCE", "BOMB"];
  const href = "https://example.test/digging?" + ids.map((id) => `spell=${id}`).join("&")
    + "&material=soil&tracking=words,with%20spaces#notes,extra";
  const {main, copied, window} = loadPage(t, href);
  assert.deepEqual((await main.value("selectedSpells")).map((spell) => spell.id), ids.slice(0, 5));
  const picker = await main.value("spellPicker");
  assert.equal(picker.maxItems, 5);
  const shareUrl = await main.value("shareUrl");
  assert.ok(shareUrl.length < 500);
  assert.doesNotMatch(shareUrl, /[, %#[\]]|tracking/);
  assert.equal(window.location.href, shareUrl);
  (await main.value("shareControl")).button.querySelector("button").click();
  assert.deepEqual(copied, [shareUrl]);
});

test("old links and navigation restore exact comparison order, material, perks and zoom", async (t) => {
  const {main, created, window} = loadPage(t, "https://example.test/digging?spell=NUKE&material=rock_static&fit=1");
  assert.deepEqual((await main.value("selectedSpells")).map((spell) => spell.id), ["NUKE"]);
  assert.equal((await main.value("comparisons"))[0].result.radius, 67);
  assert.equal(await main.value("fitRadius"), true);
  assert.equal(await main.value("shareUrl"), window.location.href);
  window.location.href = "https://example.test/digging?spell=NUKE&spell=DIGGER&material=soil&glassCannon=1&berserkium=1";
  window.dispatchEvent(new Event("popstate"));
  assert.deepEqual((await main.value("comparisons")).map(({spell}) => spell.id), ["NUKE", "DIGGER"]);
  assert.deepEqual(plain(await main.value("modifiers")), {glassCannon: 1, berserkium: true});
  assert.equal(await main.value("fitRadius"), false);
  assert.equal(await main.value("shareUrl"), window.location.href);
  assert.equal(created.length, 2);
});

test("removing one selected spell preserves the others, and incomplete comparisons cannot be shared", async (t) => {
  const {main, copied} = loadPage(t, "https://example.test/digging?spell=NUKE&spell=DIGGER&material=soil&berserkium=1");
  assert.equal((await main.value("comparisons")).length, 2);
  const picker = await main.value("spellPicker");
  picker.setValue(["DIGGER"]);
  assert.deepEqual((await main.value("comparisons")).map(({spell}) => spell.id), ["DIGGER"]);
  assert.equal(await main.value("shareUrl"), "https://example.test/digging?spell=DIGGER&material=soil&berserkium=1");
  picker.setValue([]);
  assert.deepEqual(await main.value("comparisons"), []);
  assert.equal(await main.value("shareUrl"), "https://example.test/digging?material=soil&berserkium=1");
  const share = (await main.value("shareControl")).button.querySelector("button");
  assert.equal(share.disabled, true);
  share.click();
  assert.deepEqual(copied, []);
});

test("invalid shared choices are removed independently without replacing valid selections", async (t) => {
  const {main} = loadPage(t, "https://example.test/digging?spell=missing&spell=DIGGER&spell=DIGGER&material=rock_hard&glassCannon=99&berserkium=no");
  assert.deepEqual((await main.value("selectedSpells")).map((spell) => spell.id), ["DIGGER"]);
  assert.equal((await main.value("comparisons"))[0].result.status, "partial");
  assert.equal(await main.value("shareUrl"), "https://example.test/digging?spell=DIGGER&material=rock_hard");
});

test("Lance comparisons retain the launch-speed range and separate material effects", async (t) => {
  const {main} = loadPage(t, "https://example.test/digging?spell=LANCE&spell=LUMINOUS_DRILL&material=templebrick_noedge_static");
  const [lance, lumi] = await main.value("comparisons");
  assert.equal(lance.result.method, "path");
  assert.deepEqual(lance.result.penetration.contacts.map((contact) => contact.speed), [300, 400]);
  assert.deepEqual(lance.result.penetration.contacts.map((contact) => contact.impacts), [6, 4]);
  assert.equal(lumi.result.footprint.width, 1);
});
