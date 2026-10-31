import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {isDiggingSpell} from "../src/digging/model.js";
import {DIGGING_DEFAULTS, readDiggingParams, readInitialDiggingParams, diggingUrl, getDiggingSpellLimit, MAX_DIGGING_URL_LENGTH} from "../src/digging/url.js";

const spells = ["DIGGER", "NUKE", "ACIDSHOT"].map((id) => ({id}));
const materials = ["soil", "rock_hard", "templebrick_static"].map((id) => ({id}));
const read = (href) => readDiggingParams(href, spells, materials);

test("a fresh digging visit shows Bomb and Rock only when the URL has no parameters", () => {
  const initial = href => readInitialDiggingParams(href, [...spells, {id: "BOMB"}], [...materials, {id: "rock_static"}]);
  for (const suffix of ["", "?", "#comparison"]) {
    const selection = initial(`https://example.test/digging${suffix}`);
    assert.deepEqual(selection, {...DIGGING_DEFAULTS, spells: ["BOMB"], material: "rock_static"});
    assert.equal(diggingUrl("https://example.test/digging", selection), "https://example.test/digging?spell=BOMB&material=rock_static");
  }
  for (const query of ["spell=NUKE", "material=soil", "spell=DIGGER&material=soil", "spell=missing", "from=test"]) {
    const href = `https://example.test/digging?${query}`;
    assert.deepEqual(initial(href), read(href), "explicit parameters must never be filled in or replaced by the example");
  }
  assert.deepEqual(read("https://example.test/digging"), DIGGING_DEFAULTS, "Reset and history navigation retain empty selections");
});

test("comparison links round-trip spell order and every modifier combination", () => {
  const base = "https://example.test/digging?from=test#comparison";
  for (const selected of [[], ["DIGGER"], ["NUKE", "DIGGER", "ACIDSHOT"]]) {
    for (const glassCannon of [0, 1, 2]) for (const berserkium of [false, true]) for (const fit of [false, true]) {
      const selection = {spells: selected, material: "soil", fit, glassCannon, berserkium};
      const href = diggingUrl(base, selection);
      assert.deepEqual(read(href), selection);
      assert.deepEqual(new URL(href).searchParams.getAll("spell"), selected);
      assert.equal(new URL(href).searchParams.get("from"), null);
      assert.equal(new URL(href).hash, "");
    }
  }
});

test("old single-spell links load as one-item comparisons with no implicit defaults", () => {
  assert.deepEqual(read("https://example.test/digging?spell=DIGGER&material=soil"),
    {...DIGGING_DEFAULTS, spells: ["DIGGER"], material: "soil"});
  assert.deepEqual(read("https://example.test/digging"), DIGGING_DEFAULTS);
  assert.deepEqual(read("https://example.test/digging?spell=unknown&spell=NUKE&spell=NUKE&spell=DIGGER&material=missing&glassCannon=3&berserkium=yes"),
    {...DIGGING_DEFAULTS, spells: ["NUKE", "DIGGER"]});
  assert.deepEqual(read("https://example.test/digging?material=rock_hard&fit=true&glassCannon=2&berserkium=true"),
    {...DIGGING_DEFAULTS, material: "rock_hard", fit: true, glassCannon: 2, berserkium: true});
});

test("links contain comparison settings only and Reset returns the plain page address", () => {
  const base = "https://example.test/digging?spell=NUKE&spell=DIGGER&material=rock_hard&fit=1&glassCannon=2&berserkium=1&from=test#comparison";
  assert.equal(diggingUrl(base, DIGGING_DEFAULTS), "https://example.test/digging");
  assert.equal(diggingUrl(base, {...DIGGING_DEFAULTS, spells: ["DIGGER"]}), "https://example.test/digging?spell=DIGGER");
  assert.equal(diggingUrl(base, {...DIGGING_DEFAULTS, material: "soil"}), "https://example.test/digging?material=soil");
  assert.deepEqual(read(diggingUrl(base, {...DIGGING_DEFAULTS, spells: ["NUKE", "NUKE"]})).spells, ["NUKE"]);
});

const catalogSpells = JSON.parse(readFileSync(new URL("../src/data/FULL_SPELLS_FINAL.json", import.meta.url))).filter(isDiggingSpell);
const catalogMaterials = JSON.parse(readFileSync(new URL("../src/data/FULL_MATERIALS_FINAL.json", import.meta.url)));
const longestSpells = [...catalogSpells].sort((a, b) => b.id.length - a.id.length);
const longestMaterial = [...catalogMaterials].sort((a, b) => b.id.length - a.id.length)[0].id;
const allFlags = {material: longestMaterial, fit: true, glassCannon: 2, berserkium: true};

test("five longest selectable spells, the longest material and every flag fit a readable live-site URL", () => {
  const base = "https://bartender.runfast.stream/digging";
  const limit = getDiggingSpellLimit(base, catalogSpells, catalogMaterials);
  assert.equal(limit, 5);
  const selection = {...allFlags, spells: longestSpells.slice(0, limit).map((spell) => spell.id)};
  const href = diggingUrl(base, selection);
  assert.equal(href.length, 297);
  assert.ok(href.length < 500);
  assert.match(href, /^[A-Za-z0-9_./:?=&-]+$/);
  assert.deepEqual(readDiggingParams(href, catalogSpells, catalogMaterials), selection);
  for (const entry of [...catalogSpells, ...catalogMaterials]) assert.match(entry.id, /^[A-Za-z0-9_-]+$/);
});

test("the Choices limit automatically falls below five for a longer page address", () => {
  const base = `https://example.test/${"a".repeat(300)}/digging`;
  const limit = getDiggingSpellLimit(base, catalogSpells, catalogMaterials);
  assert.ok(limit > 0 && limit < 5);
  const ids = longestSpells.map((spell) => spell.id);
  assert.ok(diggingUrl(base, {...allFlags, spells: ids.slice(0, limit)}).length <= MAX_DIGGING_URL_LENGTH);
  assert.throws(() => diggingUrl(base, {...allFlags, spells: ids.slice(0, limit + 1)}), /shorter than 500/);
});

test("incoming oversized comparisons are limited before they reach the input or URL writer", () => {
  const ids = longestSpells.slice(0, 6).map((spell) => spell.id);
  const href = "https://example.test/digging?" + ids.map((id) => `spell=${id}`).join("&");
  assert.deepEqual(readDiggingParams(href, catalogSpells, catalogMaterials).spells, ids.slice(0, 5));
  assert.throws(() => diggingUrl("https://example.test/digging", {...allFlags, spells: ids}), /Too many spells/);
});

test("499 characters is accepted, while 500 is never emitted", () => {
  const selection = {...DIGGING_DEFAULTS, spells: ["DIGGER"], material: "soil"};
  const prefix = "https://example.test/";
  const query = "?spell=DIGGER&material=soil";
  const base = prefix + "a".repeat(499 - prefix.length - query.length);
  assert.equal(diggingUrl(base, selection).length, 499);
  assert.throws(() => diggingUrl(base + "a", selection), /shorter than 500/);
});

test("commas, encoded text, anchors and unrelated query data cannot leak into copied URLs", () => {
  const base = "https://example.test/digging?tracking=a,b%20c&debug=%23%5B%5D#notes,extra";
  assert.equal(diggingUrl(base, {...DIGGING_DEFAULTS, spells: ["NUKE", "DIGGER"], material: "soil"}),
    "https://example.test/digging?spell=NUKE&spell=DIGGER&material=soil");
  for (const id of ["NUKE,DIGGER", "A B", "%41", "A&B", "A=B", "[NUKE]", "é"]) {
    assert.throws(() => diggingUrl(base, {...DIGGING_DEFAULTS, spells: [id]}), /plain spell and material IDs/);
    assert.throws(() => diggingUrl(base, {...DIGGING_DEFAULTS, material: id}), /plain spell and material IDs/);
  }
  assert.throws(() => diggingUrl("https://example.test/bad%20path/digging", DIGGING_DEFAULTS), /plain-text share URL/);
});
