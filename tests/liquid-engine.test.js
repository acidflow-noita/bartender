import test from 'node:test';
import assert from 'node:assert/strict';
import {LiquidWorld, EMPTY, WALL} from '../src/liquids/engine.mjs';
import {LiquidRandom, canDisplaceLiquid} from '../src/liquids/native-rules.mjs';
import {liquidMaterialRecords} from '../src/liquids/materials.mjs';
import {populateScene} from '../src/liquids/scenes.mjs';
import {loadSources} from '../scripts/data/sources.mjs';

const materials = liquidMaterialRecords(loadSources().materials);
const world = (options = {}) => new LiquidWorld({width: 64, height: 64, materials, seed: 12345, ...options});
const counts = instance => [...instance.countMaterials()].sort(([a], [b]) => a - b);
function center(instance, id) {
  let sum = 0, count = 0;
  instance.cells.forEach((cell, index) => { if (cell === id) {sum += Math.floor(index / instance.width); count++;} });
  return sum / count;
}

test('real blood, water and oil stratify without creating or destroying any material', () => {
  const instance = world({materials: materials.filter(material => ['blood', 'water', 'oil'].includes(material.id))});
  populateScene(instance, 'density');
  const before = counts(instance);
  instance.step(600);
  assert.deepEqual(counts(instance), before);
  const oil = center(instance, instance.getMaterialId('oil'));
  const water = center(instance, instance.getMaterialId('water'));
  const blood = center(instance, instance.getMaterialId('blood'));
  assert.ok(oil + 9 < water && water + 9 < blood, `${oil}, ${water}, ${blood}`);
});

test('equal density and two sand-like liquids cannot pass the native displacement predicate', () => {
  for (let seed = 0; seed < 300; seed++) {
    assert.equal(canDisplaceLiquid({density: 4}, {density: 4}, new LiquidRandom(seed)), false);
    assert.equal(canDisplaceLiquid({density: 5, liquid_sand: true}, {density: 4, liquid_sand: true}, new LiquidRandom(seed)), false);
    assert.equal(canDisplaceLiquid({density: 3}, {density: 4}, new LiquidRandom(seed)), false);
  }
});

test('closed walls stop fast liquid without tunneling, losing cells or crossing the partition', () => {
  const instance = world();
  const water = instance.getMaterialId('water'), oil = instance.getMaterialId('oil');
  instance.fillRect(32, 0, 2, 64, WALL);
  instance.fillRect(0, 0, 14, 18, water);
  instance.fillRect(48, 0, 16, 18, oil);
  for (let index = 0; index < instance.cells.length; index++) {
    if (instance.cells[index] && instance.cells[index] !== WALL) {
      instance.vertical[index] = 80;
      instance.horizontal[index] = instance.cells[index] === water ? 80 : -80;
    }
  }
  const before = counts(instance);
  instance.step(150);
  assert.deepEqual(counts(instance), before);
  instance.cells.forEach((id, index) => {
    if (id === water) assert.ok(index % 64 < 32);
    if (id === oil) assert.ok(index % 64 > 33);
    if (index % 64 === 32 || index % 64 === 33) assert.equal(id, WALL);
  });
});

test('fixed ticks and reset reproduce identical cell and momentum states', () => {
  const one = world(), two = world();
  populateScene(one, 'channels'); populateScene(two, 'channels');
  one.step(120);
  for (let index = 0; index < 120; index++) two.step();
  assert.deepEqual(one.cells, two.cells);
  assert.deepEqual(one.horizontal, two.horizontal);
  assert.deepEqual(one.vertical, two.vertical);
  assert.equal(one.random.state, two.random.state);
  const snapshot = one.cells.slice();
  populateScene(one, 'channels'); one.step(120);
  assert.deepEqual(one.cells, snapshot);
});

test('ordinary liquid has the native one-cell fall even at zero gravity', () => {
  const zero = {...materials.find(material => material.id === 'water'), liquid_gravity: 0};
  const instance = world({materials: [zero]});
  instance.setCell(30, 3, 1);
  instance.step(10);
  assert.equal(center(instance, 1), 13);
  assert.equal(instance.countMaterials().get(1), 1);
});

test('native gravity accelerates ordinary free fall, viscosity does not affect its update branch', () => {
  const water = materials.find(material => material.id === 'water');
  const simulate = override => {
    const instance = world({height: 256, materials: [{...water, ...override}]});
    instance.setCell(30, 3, 1); instance.step(20);
    return instance;
  };
  const fast = simulate({liquid_gravity: 1.5}), slow = simulate({liquid_gravity: .2});
  assert.ok(center(fast, 1) > center(slow, 1) + 10);
  const lowViscosity = simulate({liquid_viscosity: 0}), highViscosity = simulate({liquid_viscosity: 100});
  assert.deepEqual(lowViscosity.cells, highViscosity.cells);
  assert.deepEqual(lowViscosity.vertical, highViscosity.vertical);
});

test('brush pours conserve existing cells and explicit erase only removes its footprint', () => {
  const instance = world();
  const water = instance.getMaterialId('water'), oil = instance.getMaterialId('oil');
  instance.paintCircle(20, 20, 5, water);
  const volume = instance.countMaterials().get(water);
  instance.paintCircle(20, 20, 5, oil);
  assert.equal(instance.countMaterials().get(water), volume);
  assert.equal(instance.countMaterials().has(oil), false);
  instance.paintCircle(20, 20, 0, EMPTY, {replace: true});
  assert.equal(instance.countMaterials().get(water), volume - 1);
  assert.equal(instance.setCell(-1, 0, water), false);
});

test('all 100 catalog liquids run their movement branch with finite state and conserved volume', () => {
  for (const material of materials) {
    const instance = world();
    populateScene(instance, 'channels', material.id);
    const before = counts(instance);
    instance.step(120);
    assert.deepEqual(counts(instance), before, material.id);
    assert.ok(instance.horizontal.every(Number.isFinite), `${material.id} horizontal momentum`);
    assert.ok(instance.vertical.every(Number.isFinite), `${material.id} vertical momentum`);
  }
});
