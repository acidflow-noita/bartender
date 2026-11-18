import test from 'node:test';
import assert from 'node:assert/strict';
import {loadSources} from '../scripts/data/sources.mjs';
import {pageDatasets} from '../scripts/data/page-datasets.mjs';
import {LiquidWorld, WALL} from '../src/liquids/engine.mjs';
import {populateScene, defaultSceneProcesses} from '../src/liquids/scenes.mjs';
import {defer, flush as flushDeferred} from '../src/liquids/deferred.mjs';
import {flushMaterialCreations} from '../src/liquids/mutations.mjs';
import {LiquidRandom} from '../src/liquids/native-rules.mjs';

const data = pageDatasets(loadSources()).liquidSimulation;
const create = (options = {}) => new LiquidWorld({width: 96, height: 64, ...data, seed: 1, ...options});
const count = (world, name) => world.countMaterials().get(world.getMaterialId(name)) ?? 0;

test('density layers fill 90 percent of the tank in reverse density order', () => {
  const world = create({width: 256, height: 160, processes: defaultSceneProcesses('density')});
  populateScene(world, 'density');
  const expected = data.materials.filter(material => material.type === 'Liquid');
  const before = world.countMaterials();
  assert.equal(expected.length, 100);
  assert.equal(before.size, 100);
  const top = world.height - 2 - Math.round((world.height - 2) * .9);
  const capacity = (world.width - 4) * (world.height - 2 - top);
  assert.equal([...before.values()].reduce((total, count) => total + count, 0), capacity);
  assert.ok(Math.max(...before.values()) - Math.min(...before.values()) <= 1);
  for (let x = 2; x < world.width - 2; x++) {
    let density = Infinity;
    for (let y = 0; y < top; y++) assert.equal(world.cells[y * world.width + x], 0);
    for (let y = top; y < world.height - 2; y++) {
      const material = world.materials[world.cells[y * world.width + x]];
      assert.equal(material?.type, 'Liquid');
      assert.ok(material.density <= density);
      density = material.density;
    }
  }
  for (const material of expected) assert.ok(before.has(world.getMaterialId(material.id)), material.id);
  assert.equal(world.processes, false);
  world.step(30);
  assert.deepEqual([...world.countMaterials()].sort((a, b) => a[0] - b[0]), [...before].sort((a, b) => a[0] - b[0]));
});

test('ordinary liquids settle within one cell of the level surface', () => {
  for (const material of ['water', 'oil', 'magic_liquid_protection_all']) {
    const world = create({width: 128, height: 96, processes: false});
    world.fillRect(0, 0, 2, 96, WALL); world.fillRect(126, 0, 2, 96, WALL);
    world.fillRect(0, 94, 128, 2, WALL);
    world.fillRect(48, 10, 31, 24, world.getMaterialId(material));
    world.step(1200);
    for (let x = 2; x < 126; x++) {
      let height = 0;
      for (let y = 0; y < 94; y++) if (world.cells[y * 128 + x]) height++;
      assert.ok(Math.abs(height - 6) <= 1, `${material} column ${x}: ${height}`);
    }
  }
});

test('acid corrodes the stone half of the container and leaves the glass half intact', () => {
  const world = create();
  populateScene(world, 'acid');
  const stone = count(world, 'rock_static');
  const glass = world.getMaterialId('glass'), before = world.cells.slice();
  assert.ok(stone > 0);
  assert.equal(count(world, 'glass'), stone);
  world.step(330);
  for (let i = 0; i < before.length; i++) {
    if (before[i] !== glass) continue;
    assert.ok(i % world.width >= world.width / 2);
    assert.equal(world.cells[i], glass);
  }
  assert.ok(count(world, 'rock_static') < stone / 2);
  assert.ok(count(world, 'acid_gas') > 0);
  assert.ok(world.reactionCount > 0);
  assert.equal(world.cells[(world.height - 1) * world.width], WALL);
});

test('honey and diamond produce Ambrosia and the native poison byproduct', () => {
  const world = create();
  populateScene(world, 'ambrosia');
  const honey = count(world, 'honey'), diamond = count(world, 'diamond');
  world.step(330);
  assert.ok(count(world, 'magic_liquid_protection_all') > 0);
  assert.ok(count(world, 'poison') + count(world, 'poison_gas') > 0);
  assert.ok(count(world, 'honey') < honey && count(world, 'diamond') < diamond);
});

test('the poison comparison keeps the sealed liquid and exposes only the open vessel', () => {
  const world = create();
  populateScene(world, 'poison-exposure', 'poison');
  const poison = world.getMaterialId('poison');
  const leftCount = () => world.cells.reduce((sum, id, index) =>
    sum + Number(id === poison && index % world.width < world.width / 2), 0);
  const sealed = leftCount(), total = count(world, 'poison');
  assert.ok(sealed > 0);
  world.step(120);
  assert.equal(leftCount(), sealed);
  assert.ok(count(world, 'poison') < total);
  assert.ok(count(world, 'poison_gas') > 0);
});

test('Creepy Liquid grows into air after interactions are enabled', () => {
  const world = create({processes: false});
  populateScene(world, 'empty');
  world.paintCircle(48, 10, 4, world.getMaterialId('creepy_liquid'));
  const initial = count(world, 'creepy_liquid');
  world.step(120);
  assert.equal(count(world, 'creepy_liquid'), initial);
  assert.equal(world.reactionCount, 0);
  world.processes = true;
  world.step(330);
  assert.ok(count(world, 'creepy_liquid') > initial * 2);
  assert.ok(world.reactionCount > 0);
});

test('settled Creepy Liquid with negative birth ages expands on the next normal reaction pass', () => {
  const world = create({width: 64, height: 48, processes: false});
  populateScene(world, 'empty');
  const id = world.getMaterialId('creepy_liquid');
  world.fillRect(2, 44, 60, 2, id);
  for (let i = 0; i < world.cells.length; i++) if (world.cells[i] === id) world.age[i] = -405;
  world.step(121);
  const initial = count(world, 'creepy_liquid');
  assert.equal(initial, 120);
  world.processes = true;
  world.step(11);
  assert.ok(count(world, 'creepy_liquid') > initial);
  assert.ok(world.reactionCount > 0);
});

test('a settled Creepy Liquid front keeps growing between periodic worker passes', () => {
  const world = create({width: 64, height: 160, processes: false});
  populateScene(world, 'empty');
  world.fillRect(2, 150, 60, 8, world.getMaterialId('creepy_liquid'));
  world.step(121);
  world.processes = true;
  world.step(120);
  assert.ok(count(world, 'creepy_liquid') > 1440);
});

test('ignited oil spreads fire and consumes fuel and exposed wood', () => {
  const world = create();
  populateScene(world, 'oil-fire');
  const oil = count(world, 'oil'), wood = count(world, 'wood_static');
  world.step(330);
  assert.ok(count(world, 'oil') < oil);
  assert.ok(count(world, 'wood_static') < wood);
  assert.ok(count(world, 'fire') > 0);
});

test('warm and cold regions convert water to steam and ice', () => {
  const world = create();
  populateScene(world, 'phase');
  world.step(660);
  assert.ok(count(world, 'steam') > 0);
  assert.ok(count(world, 'ice_static') > 0);
  assert.ok(count(world, 'water') > 0);
});

test('void liquid expires across its native birth-age range', () => {
  const world = create({reactions: []});
  const id = world.getMaterialId('void_liquid');
  world.fillRect(5, 5, 50, 10, id);
  const starts = [...world.age].filter((_, index) => world.cells[index] === id);
  assert.ok(starts.some(age => age < 0) && starts.some(age => age > 0));
  assert.ok(starts.every(age => Math.abs(age) <= 60));
  world.step(200);
  assert.ok(count(world, 'void_liquid') > 0 && count(world, 'void_liquid') < 500);
  world.step(61);
  assert.equal(count(world, 'void_liquid'), 0);
});

test('blocked gas does not spend its movement-based lifetime', () => {
  const world = create({width: 6, height: 6, reactions: []});
  world.fillRect(0, 0, 6, 6, WALL);
  const id = world.getMaterialId('steam'), index = 3 * 6 + 3;
  world.setCell(3, 3, id);
  const age = world.age[index];
  world.step(660);
  assert.equal(world.cells[index], id);
  assert.equal(world.age[index], age);
});

test('heat and cold stay in their painted regions while cells move', () => {
  const world = create({reactions: []});
  world.applyEnvironmentCircle(20, 20, 3, 'heat', 50);
  const warm = world.warmth.slice();
  world.setCell(20, 20, world.getMaterialId('oil'));
  world.step(20);
  assert.deepEqual(world.warmth, warm);
  world.applyEnvironmentCircle(20, 20, 3, 'cool', 35);
  assert.equal(world.warmth[20 * world.width + 20], 0);
  assert.equal(world.cold[20 * world.width + 20], 35);
  world.eraseCircle(20, 20, 3);
  assert.equal(world.cold.reduce((sum, value) => sum + value, 0), 0);
});

test('same-type conversion preserves movement and resets liquid age without a birth draw', () => {
  const world = create();
  const index = 10 * world.width + 10;
  world.setCell(10, 10, world.getMaterialId('water'));
  world.vertical[index] = 2.5; world.horizontal[index] = -.75; world.age[index] = 40;
  const random = world.random.state;
  world._replaceMaterial(index, world.getMaterialId('blood'));
  assert.equal(world.vertical[index], 2.5);
  assert.equal(world.horizontal[index], -.75);
  assert.equal(world.age[index], 0);
  assert.equal(world.random.state, random);
});

test('a single active region gets the native forced normal pass', () => {
  const base = data.materials.find(material => material.id === 'water');
  const materials = ['first', 'second'].map(id => ({...base, id, liquid_static: true,
    max_reaction_probability: 10000, max_fast_reaction_probability: 0}));
  const rule = {...data.reactions.find(reaction => !reaction.fast_reaction && !reaction.has_input_cell3),
    input_cell1: 'first', input_cell2: 'second', input_cell3: null,
    output_cell1: 'air', output_cell2: 'air', output_cell3: null, reaction_rate: 100,
    direction: 'none', req_lifetime: 0, blob_radius1: 0, blob_radius2: 0,
    explosion_config: null, destroy_horizontally_lonely_pixels: false};
  // Mobile cells resting on the floor use the ordinary update route.
  materials.forEach(material => {material.liquid_static = false;});
  const world = create({width: 2, height: 2, materials, reactions: [rule]});
  world.fillRect(0, 1, 2, 1, WALL);
  world.setCell(0, 0, 1); world.setCell(1, 0, 2);
  world.random = {state: 0, integer: maximum => maximum === 10000 ? 0 : maximum, next: () => 1};
  world.step();
  assert.equal(world.cells[0], 0);
  assert.equal(world.cells[1], 0);
});

test('detached poison reacts as an object before creation and reinsertion commit', () => {
  const world = create();
  const poison = world.getMaterialId('poison'), gas = world.getMaterialId('poison_gas');
  const source = 20 * world.width + 20;
  world.setCell(20, 20, poison);
  world.setCell(20, 21, poison);
  world.tick = 1;
  world._updated[source] = 1;
  world.vertical[source] = 3.5;
  for (let seed = 1; ; seed++) {
    const random = new LiquidRandom(seed);
    if (random.integer(10000) <= 1500 && (random.next() & 3) !== 3) {
      world.random.state = seed;
      break;
    }
  }
  world._inStep = true;
  defer(world, source);
  const entry = world._deferredState.pending[0];
  world._runDetachedCallbacks(entry, false);
  world._inStep = false;
  assert.equal(world.cells[source], 0);
  assert.equal(entry.id, poison);
  assert.deepEqual(world.materialMutations.creations, [{x: 20, y: 20, material: gas, replace: true}]);
  flushMaterialCreations(world);
  assert.equal(world.cells[source], gas);
  flushDeferred(world);
  assert.equal(world.cells[source], poison);
  assert.equal(world.vertical[source], 3.5);
  assert.equal(world._deferredState.pending[0].id, gas);
  assert.equal(world.countMaterials().get(poison), 2);
  assert.equal(world.countMaterials().get(gas), 1);
});

test('cold water forms smooth translucent ice, and thawing or placing terrain resets its formation color', () => {
  const world = create();
  populateScene(world, 'phase'); world.step(100);
  const ice = world.getMaterialId('ice_static'), water = world.getMaterialId('water');
  const formed = world.cells.findIndex(id => id === ice);
  assert.ok(formed >= 0);
  world.cells.forEach((id,i) => {if (id === ice) assert.equal(world.formationColor[i], 0x544d91b2);});
  world._replaceMaterial(formed, water);
  assert.equal(world.formationColor[formed], 0);
  world.setCell(formed % world.width, Math.floor(formed / world.width), ice);
  assert.equal(world.formationColor[formed], 0);
});
