import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LiquidWorld} from '../src/liquids/engine.mjs';
import {renderCellBodies} from '../src/liquids/appearance.mjs';
import {TankRefraction} from '../src/liquids/refraction.mjs';
import {prepareReactionTank, recipeCells} from '../src/reactions/experiment.js';
import {reactionUrl, recipePathId} from '../src/components/reactionUrl.js';

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const manifest = read('../src/generated/data-manifest.json');
const {materials, reactions} = read('../public' + manifest.liquidSimulation);
const find = (...ids) => reactions.find(row => recipeCells(row, 'input').join() === ids.join());
const tank = () => new LiquidWorld({width: 96, height: 56, materials});
const count = (world, id) => world.countMaterials().get(world.getMaterialId(id)) ?? 0;

test('the Ambrosia preview starts with ingredients and replays the same native contact rule', () => {
  const world = tank(), rule = find('honey', 'diamond');
  prepareReactionTank(world, rule);
  assert.deepEqual(new Set([...world.countMaterials().keys()].map(id => world.materials[id].id)), new Set(['honey', 'diamond']));
  const run = () => {world.step(20); return [world.reactionCount, count(world, 'magic_liquid_protection_all'), count(world, 'poison')];};
  const result = run();
  assert.ok(result[0] > 0); assert.deepEqual(result, [result[0], result[0], result[0]]);
  prepareReactionTank(world, rule);
  assert.equal(world.tick, 0); assert.equal(world.reactionCount, 0); assert.deepEqual(run(), result);
});

test('switching recipes clears the tank and supports three ingredients, age gates, and direction', () => {
  const world = tank();
  for (const [rule, product] of [[find('meat', 'fire', 'oil'), 'meat_warm'],
    [find('cement', 'fire', 'cement'), 'concrete_static'],
    [find('lava', 'water'), 'rock_static'], [find('acid', 'wood_static'), 'acid_gas']]) {
    prepareReactionTank(world, rule);
    assert.equal(world.contactReactions.rules.length, 1);
    assert.equal(world.reactionCount, 0); assert.equal(count(world, product), 0);
    world.step(24);
    assert.ok(count(world, product) > 0, product);
  }
  const left = reactions.find(row => row.input_cell1 === 'vine' && row.direction === 'left');
  prepareReactionTank(world, left);
  const before = count(world, 'vine'); world.step(24);
  assert.ok(count(world, 'vine') > before);
  assert.equal(count(world, 'acid_gas'), 0);
});

test('a shared reaction keeps the exact source row even for repeated material combinations', () => {
  const rule = find('honey', 'diamond'), row = reactions.indexOf(rule) + 1;
  const url = new URL(reactionUrl('https://test.invalid/reactions', {selectedReaction: row, selectedReagents: ['honey']}));
  assert.equal(reactions[recipePathId(url.pathname) - 1], rule);
  assert.equal(url.searchParams.get('reagents'), 'honey');
});

test('both Blue Fungus variants keep their pixels under liquid refraction', () => {
  const world = tank(), liquid = world.getMaterialId('void_liquid');
  for (const id of ['spore_pod_stalk', 'bluefungi_static']) {
    const fungus = world.getMaterialId(id);
    prepareReactionTank(world, find('void_liquid', id));
    assert.equal(world.cells[(world.height - 5) * world.width + 5], fungus);
    const size = world.cells.length, mask = new Uint8Array(size), visible = new Uint16Array(size);
    const raw = new Uint8ClampedArray(size * 4), bodies = raw.slice(), frame = raw.slice();
    for (let i = 0; i < size; i++) {raw[i * 4] = i % 251; raw[i * 4 + 3] = 255;}
    renderCellBodies(world, raw, bodies, visible, mask);
    const refraction = new TankRefraction(world.width, world.height);
    for (const time of [.17, .43]) {
      refraction.draw(bodies, frame, mask, time);
      assert.ok(world.cells.some((cell, i) => cell === liquid && mask[i]));
      assert.ok(world.cells.includes(fungus));
      for (let i = 0; i < size; i++) {
        if (world.cells[i] !== fungus) continue;
        assert.equal(mask[i], 0, id);
        assert.equal(frame[i * 4], raw[i * 4], id);
        assert.equal(refraction.materialAt(i % world.width + .5, Math.floor(i / world.width) + .5, mask, visible), fungus);
      }
    }
    const before = count(world, id);
    world.step(24);
    assert.ok(count(world, id) < before, id);
  }
});
