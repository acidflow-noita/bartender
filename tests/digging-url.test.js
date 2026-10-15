import test from "node:test";
import assert from "node:assert/strict";
import {DIGGING_DEFAULTS, readDiggingParams, diggingUrl} from "../src/digging/url.js";

const spells = ["DIGGER", "NUKE", "ACIDSHOT"].map((id) => ({id}));
const materials = ["soil", "rock_hard", "templebrick_static"].map((id) => ({id}));
const read = (href) => readDiggingParams(href, spells, materials);

test("comparison links round-trip spell order and every modifier combination", () => {
  const base = "https://example.test/digging?from=test#comparison";
  for (const selected of [[], ["DIGGER"], ["NUKE", "DIGGER", "ACIDSHOT"]]) {
    for (const glassCannon of [0, 1, 2]) for (const berserkium of [false, true]) for (const fit of [false, true]) {
      const selection = {spells: selected, material: "soil", fit, glassCannon, berserkium};
      const href = diggingUrl(base, selection);
      assert.deepEqual(read(href), selection);
      assert.deepEqual(new URL(href).searchParams.getAll("spell"), selected);
      assert.equal(new URL(href).searchParams.get("from"), "test");
      assert.equal(new URL(href).hash, "#comparison");
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

test("clearing and Reset remove prior spells, perks and status parameters only", () => {
  const base = "https://example.test/digging?spell=NUKE&spell=DIGGER&material=rock_hard&fit=1&glassCannon=2&berserkium=1&from=test#comparison";
  assert.equal(diggingUrl(base, DIGGING_DEFAULTS), "https://example.test/digging?from=test#comparison");
  assert.equal(diggingUrl(base, {...DIGGING_DEFAULTS, spells: ["DIGGER"]}), "https://example.test/digging?from=test&spell=DIGGER#comparison");
  assert.equal(diggingUrl(base, {...DIGGING_DEFAULTS, material: "soil"}), "https://example.test/digging?from=test&material=soil#comparison");
  assert.deepEqual(read(diggingUrl(base, {...DIGGING_DEFAULTS, spells: ["NUKE", "NUKE"]})).spells, ["NUKE"]);
});
