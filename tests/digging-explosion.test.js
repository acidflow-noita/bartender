import test from "node:test";
import assert from "node:assert/strict";
import {evaluateExplosionFootprint as evaluate} from "../src/digging/explosion.js";

const input = {radius: 6, rayEnergy: 100000, hardness: 2000, durability: 10, maxDurability: 10};

test("circular estimates cap soft-material reach at the configured radius", () => {
  const small = evaluate(input);
  assert.equal(small.radius, 6);
  assert.equal(small.estimated, true);
  assert.equal(small.rays, undefined);
  assert.equal(evaluate({...input, radius: 250, rayEnergy: 6700000}).radius, 250);
  assert.equal(evaluate({...input, radius: 400, rayEnergy: 9700000}).radius, 400);
});

test("hard materials reduce the size estimate without inventing a directional contour", () => {
  assert.equal(evaluate({...input, radius: 250, rayEnergy: 6700000, hardness: 100000}).radius, 67);
  assert.equal(evaluate({...input, radius: 400, rayEnergy: 9700000, hardness: 1000000, durability: 14, maxDurability: 14}).radius, 9);
  assert.equal(evaluate({...input, hardness: 100000}).radius, 1);
  const partial = evaluate({...input, hardness: 200000});
  assert.equal(partial.radius, 0);
  assert.equal(partial.damagePerCell, 100000);
});

test("durability equality, zero hardness and disabled energy remain distinct", () => {
  assert.equal(evaluate(input).radius, 6);
  assert.equal(evaluate({...input, durability: 11}).radius, 0);
  assert.equal(evaluate({...input, hardness: 0}).radius, 6);
  assert.equal(evaluate({...input, rayEnergy: 0}).radius, 0);
  assert.equal(evaluate({...input, radius: 0}).radius, 0);
});

test("missing and unsafe explosion inputs do not produce a size estimate", () => {
  for (const scenario of [{...input, radius: 4097}, {...input, radius: Infinity}, {...input, hardness: -1},
    {...input, rayEnergy: 0.5}, {...input, maxDurability: null}]) assert.equal(evaluate(scenario), null);
});
