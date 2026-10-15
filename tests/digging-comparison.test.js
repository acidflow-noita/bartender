import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {evaluateComparison, getComparisonScale} from "../src/digging/comparison.js";
import {getBaseRadius} from "../src/digging/model.js";
const spells = JSON.parse(readFileSync(new URL("../src/data/FULL_SPELLS_FINAL.json", import.meta.url)));
const materials = JSON.parse(readFileSync(new URL("../src/data/FULL_MATERIALS_FINAL.json", import.meta.url)));
const selected = (ids) => ids.map((id) => spells.find((spell) => spell.id === id));
const soil = materials.find((material) => material.id === "soil");

test("each compared cast receives the selected modifiers without changing the source catalog", () => {
  const source = selected(["DIGGER", "NUKE"]);
  const original = JSON.stringify(source);
  for (const [glassCannon, berserkium, factor] of [[0, false, 1], [0, true, 2], [1, false, 5], [1, true, 7.5], [2, false, 25], [2, true, 25]]) {
    const entries = evaluateComparison(source, soil, {glassCannon, berserkium});
    assert.deepEqual(entries.map(({spell}) => spell.id), ["DIGGER", "NUKE"]);
    assert.equal(entries[0].result.radius, 6 * factor);
    assert.equal(entries[1].spell.radius, 250 * factor);
    assert.equal(entries[1].result.radius, Math.min(250 * factor, 2048));
    assert.equal(new Set(entries.map(({color}) => color)).size, 2);
  }
  assert.equal(JSON.stringify(source), original);
});

test("explosion boosts do not falsely widen moving diggers or bypass material durability", () => {
  const options = {glassCannon: 2, berserkium: true};
  const [lumi, hole] = evaluateComparison(selected(["LUMINOUS_DRILL", "BLACK_HOLE"]), soil, options);
  assert.equal(lumi.result.footprint.width, 1);
  assert.equal(lumi.result.footprint.lengthMax, 34);
  assert.equal(hole.result.footprint.width, 24);
  assert.equal(getBaseRadius(hole.spell), 12, "a zero-energy explosion's scaled decorative radius is not digging reach");
  const brick = materials.find((material) => material.id === "templebrick_static");
  assert.equal(evaluateComparison(selected(["NUKE"]), brick, options)[0].result.status, "blocked");
});

test("comparison state supports empty selections and removes duplicates while preserving order", () => {
  assert.deepEqual(evaluateComparison([], soil), []);
  assert.deepEqual(evaluateComparison(selected(["NUKE"]), null), []);
  assert.deepEqual(evaluateComparison(selected(["NUKE", "DIGGER", "NUKE"]), soil).map(({spell}) => spell.id), ["NUKE", "DIGGER"]);
  assert.equal(getComparisonScale([], 400, true), 6);
  assert.equal(getComparisonScale(evaluateComparison(selected(["DIGGER", "NUKE"]), soil), 400, false), 6);
});
