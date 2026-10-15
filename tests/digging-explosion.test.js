import test from "node:test";
import assert from "node:assert/strict";
import {evaluateExplosionFootprint as evaluate} from "../src/digging/explosion.js";
import {contoursFromRows} from "../src/digging/geometry.js";

const input = {radius: 6, rayEnergy: 100000, hardness: 2000, durability: 10, maxDurability: 10};

test("a fully powered small explosion follows the native strict radius raster gate", () => {
  const shape = evaluate(input);
  assert.deepEqual(shape.origin, [1024.5, 1024.5]);
  assert.equal(shape.radiusMin, 6);
  assert.equal(shape.radiusMax, 6);
  assert.equal(shape.removedPixelsMin, 109);
  assert.equal(shape.removedPixelsMax, 109);
  assert.deepEqual(shape.rows.find((row) => row.y === 0).guaranteed, [[-5, 5]]);
  assert.ok(!shape.rows.some((row) => Math.abs(row.y) >= 6));
  for (const row of shape.rows) assert.deepEqual(row.guaranteed, row.possible);
});

test("Nuke rays spend energy on distinct sampled cells, with wider diagonal reach", () => {
  const shape = evaluate({radius: 250, rayEnergy: 6700000, hardness: 100000, durability: 10, maxDurability: 12});
  assert.equal(shape.rays.length, 360);
  // Cardinal stop: 67 cells, 67² distance, +0/1 stop jitter; the enabled
  // large-ray phase can subtract at most 100 from squared distance.
  assert.deepEqual(shape.rays[0], {cutoffMinSquared: 4389, cutoffMaxSquared: 4490, damage: 100000});
  assert.ok(shape.radiusMin > 66 && shape.radiusMin < 67);
  assert.ok(shape.radiusMax > 94 && shape.radiusMax < 96,
    "floor(energy / HP) = 67 is not the maximum radial reach");
  assert.deepEqual(shape.rows.find((row) => row.y === 0).possible, [[-67, 67]]);
});

test("a partial final ray payment does not replace its maximum per-cell damage", () => {
  const shape = evaluate({radius: 400, rayEnergy: 9700000, hardness: 1000000, durability: 14, maxDurability: 14});
  assert.equal(shape.damagePerCell, 1000000);
  assert.deepEqual(shape.rays[0], {cutoffMinSquared: 65, cutoffMaxSquared: 101, damage: 1000000});
  assert.ok(shape.radiusMax > 13 && shape.radiusMax < 15);
  assert.ok(shape.removedPixelsMax > shape.removedPixelsMin);
});

test("insufficient cell damage preserves terrain while durability equality remains eligible", () => {
  const partial = evaluate({...input, hardness: 200000});
  assert.equal(partial.damagePerCell, 100000);
  assert.equal(partial.radiusMin, 0);
  assert.equal(partial.radiusMax, 0);
  assert.deepEqual(partial.rows, []);
  const blocked = evaluate({...input, durability: 11});
  assert.equal(blocked.radiusMax, 0);
  assert.equal(blocked.damagePerCell, 0);
  assert.ok(evaluate(input).removedPixelsMin > 0);
  assert.equal(evaluate({...input, hardness: 0}).removedPixelsMin, 109);
});

test("every guaranteed interval is inside its possible interval envelope", () => {
  const shape = evaluate({radius: 400, rayEnergy: 9700000, hardness: 1000000, durability: 14, maxDurability: 14});
  for (const row of shape.rows) for (const [a, b] of row.guaranteed) {
    assert.ok(row.possible.some(([c, d]) => c <= a && b <= d));
  }
});

test("summary evaluation skips raster work and preserves the same scalar bounds", () => {
  const scenario = {...input, radius: 35};
  const summary = evaluate(scenario, {includeRows: false});
  assert.equal(summary.rows, undefined);
  const preview = evaluate(scenario);
  assert.equal(summary.radiusMin, preview.radiusMin);
  assert.equal(summary.radiusMax, preview.radiusMax);
  assert.ok(preview.rows.length > 0);
  const huge = evaluate({...input, radius: 4096, hardness: 0}, {includeRows: false});
  assert.ok(huge.radiusMax < 2051, "the native trace has a squared-length and step cap");
  for (const scenario of [{...input, radius: 4097}, {...input, radius: Infinity}, {...input, hardness: -1},
    {...input, rayEnergy: 0.5}, {...input, maxDurability: null}]) assert.equal(evaluate(scenario), null);
});

test("row contours cancel internal edges and retain diagonal components and holes", () => {
  const rows = [{y: 0, guaranteed: [[0, 2]]}, {y: 1, guaranteed: [[0, 2]]}];
  const contours = contoursFromRows(rows, "guaranteed");
  assert.equal(contours.length, 1);
  const signedArea = (polygon) => polygon.slice(1).reduce((area, point, i) =>
    area + polygon[i][0] * point[1] - point[0] * polygon[i][1], 0) / 2;
  assert.equal(signedArea(contours[0]), 6);
  assert.ok(!contours[0].slice(1).some((point, i) => point[1] === 0.5 && contours[0][i][1] === 0.5),
    "adjacent rows must not have an internal horizontal stroke");
  const diagonal = contoursFromRows([{y: 0, guaranteed: [[0, 0]]}, {y: 1, guaranteed: [[1, 1]]}], "guaranteed");
  assert.equal(diagonal.length, 2);
  const ring = contoursFromRows([{y: 0, guaranteed: [[0, 2]]}, {y: 1, guaranteed: [[0, 0], [2, 2]]},
    {y: 2, guaranteed: [[0, 2]]}], "guaranteed");
  assert.equal(ring.length, 2);
  assert.equal(ring.reduce((area, polygon) => area + signedArea(polygon), 0), 8);
});
