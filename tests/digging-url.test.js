import test from "node:test";
import assert from "node:assert/strict";
import {DIGGING_DEFAULTS, readDiggingParams, diggingUrl} from "../src/digging/url.js";

const spells = ["DIGGER", "NUKE", "ACIDSHOT"].map((id) => ({id}));
const materials = ["soil", "rock_hard", "templebrick_static"].map((id) => ({id}));
const read = (href) => readDiggingParams(href, spells, materials);

test("digging links round-trip the selections and zoom while retaining unrelated URL data", () => {
  const base = "https://example.test/digging?from=test#comparison";
  for (const spell of spells) for (const material of materials) for (const fit of [false, true]) {
    const selection = {spell: spell.id, material: material.id, fit};
    const href = diggingUrl(base, selection);
    assert.deepEqual(read(href), selection);
    assert.equal(new URL(href).searchParams.get("spell"), spell.id);
    assert.equal(new URL(href).searchParams.get("material"), material.id);
    assert.equal(new URL(href).searchParams.get("from"), "test");
    assert.equal(new URL(href).hash, "#comparison");
  }
  assert.equal(diggingUrl(`${base.split("#")[0]}&spell=NUKE&material=rock_hard&fit=1#comparison`, DIGGING_DEFAULTS), base);
});

test("missing, invalid and unsupported IDs stay empty independently; fit accepts only explicit true values", () => {
  assert.deepEqual(read("https://example.test/digging"), DIGGING_DEFAULTS);
  assert.deepEqual(read("https://example.test/digging?spell=ACIDSHOT&material=missing&fit=true"),
    {spell: "ACIDSHOT", material: null, fit: true});
  for (const spell of ["", "unknown", "__proto__", "<script>", "nuke", "ACID_TRAIL"]) {
    const url = new URL("https://example.test/digging?material=rock_hard&fit=false");
    url.searchParams.set("spell", spell);
    assert.deepEqual(read(url.href), {spell: null, material: "rock_hard", fit: false});
  }
  for (const fit of ["0", "false", "", "yes", "2"]) {
    assert.equal(read(`https://example.test/digging?fit=${fit}`).fit, false);
  }
});

test("partial selections preserve their explicit IDs and clearing removes old selections", () => {
  const base = "https://example.test/digging?spell=NUKE&material=rock_hard&fit=1&from=test#comparison";
  const spellOnly = diggingUrl(base, {spell: "DIGGER", material: null, fit: false});
  assert.deepEqual(read(spellOnly), {spell: "DIGGER", material: null, fit: false});
  assert.equal(spellOnly, "https://example.test/digging?from=test&spell=DIGGER#comparison");
  const materialOnly = diggingUrl(base, {spell: null, material: "soil", fit: false});
  assert.deepEqual(read(materialOnly), {spell: null, material: "soil", fit: false});
  assert.equal(materialOnly, "https://example.test/digging?from=test&material=soil#comparison");
  assert.equal(diggingUrl(base, DIGGING_DEFAULTS), "https://example.test/digging?from=test#comparison");
});
