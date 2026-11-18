import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LiquidWorld, WALL} from '../src/liquids/engine.mjs';
import {defer, flush, reinsert, countDeferred, resetDeferred} from '../src/liquids/deferred.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/noita-liquid-world.json', import.meta.url)));
const materials = Object.entries(fixture.materials).map(([id, properties]) =>
  ({id, cell_type: id === 'wall' ? 'solid' : 'liquid', ...properties}));
const fields = ['material', 'x', 'y', 'vertical', 'horizontal', 'motion', 'idle', 'updated'];
const order = (a, b) => a.y - b.y || a.x - b.x || a.material.localeCompare(b.material);
const project = cell => Object.fromEntries(fields.map(key => [key, cell[key]]));

function makeWorld(input) {
  const world = new LiquidWorld({width: input.width, height: input.height,
    materials, seed: input.seed, processes: false});
  world.fillRect(0, 0, input.width, 1, WALL);
  world.fillRect(0, input.height - 1, input.width, 1, WALL);
  world.fillRect(0, 0, 1, input.height, WALL);
  world.fillRect(input.width - 1, 0, 1, input.height, WALL);
  for (const cell of input.cells) place(world, cell);
  world.tick = 1;
  world.random.state = input.seed;
  world.effectRandom.state = input.seed;
  return world;
}

function place(world, cell) {
  world.setCell(cell.x, cell.y, cell.material === 'wall' ? WALL : world.getMaterialId(cell.material));
  const index = cell.y * world.width + cell.x;
  world.vertical[index] = cell.vertical ?? 0;
  world.horizontal[index] = cell.horizontal ?? 0;
  world._motion[index] = cell.motion ?? 3;
  world._idle[index] = cell.idle ?? 0;
  world._updated[index] = cell.updated ?? 0;
  return index;
}

function activeCells(world) {
  const cells = [];
  world.cells.forEach((id, index) => {
    if (!id || id === WALL) return;
    cells.push({material: world.materials[id].id, x: index % world.width,
      y: Math.floor(index / world.width), vertical: world.vertical[index],
      horizontal: world.horizontal[index], motion: world._motion[index],
      idle: world._idle[index], updated: world._updated[index]});
  });
  return cells.sort(order);
}

function queuedCell(world, entry) {
  const value = array => entry.values[world._cellState.indexOf(array)];
  return {material: world.materials[entry.id].id, x: entry.x, y: entry.y,
    vertical: value(world.vertical), horizontal: value(world.horizontal),
    motion: value(world._motion), idle: value(world._idle), updated: value(world._updated)};
}

test('complete ordinary-liquid updates match native grid, swap and RNG execution', () => {
  for (const {input, output} of fixture.cases) {
    const world = makeWorld(input);
    const source = input.source[1] * world.width + input.source[0];
    world._updated[source] = world.tick;
    world._movingCell = source;
    world._stepLiquid(source, world.materials[world.cells[source]]);
    assert.deepEqual(activeCells(world), output.cells.filter(cell => cell.in_grid).map(project).sort(order), input.name);
    assert.equal(world.random.state, output.random_state, `${input.name}: random stream`);
    const expected = output.cells.filter(cell => output.deferred.includes(cell.token)).map(project).sort(order);
    assert.deepEqual((world._deferredState?.pending ?? []).map(entry => queuedCell(world, entry)).sort(order), expected,
      `${input.name}: deferred cells`);
  }
});

test('complete native reinsertion matches density displacement and deep-column search', () => {
  for (const {input, output} of fixture.reinsertion_cases) {
    const world = makeWorld(input);
    const source = place(world, {...input.suspended, x: 1, y: 1, updated: 1});
    defer(world, source);
    const entry = world._deferredState.pending.pop();
    entry.x = input.suspended.x; entry.y = input.suspended.y;
    const displaced = [];
    assert.equal(reinsert(world, entry, displaced), output.inserted, input.name);
    assert.deepEqual(activeCells(world), output.cells.filter(cell => cell.in_grid).map(project).sort(order), input.name);
    const expected = output.cells.filter(cell => output.displaced.includes(cell.token)).map(project).sort(order);
    assert.deepEqual(displaced.map(cell => queuedCell(world, cell)).sort(order), expected, `${input.name}: displaced`);
    assert.equal(world.effectRandom.state, output.effect_random_state, `${input.name}: global random stream`);
  }
});

test('queued cells preserve momentum, stamps and material count through retries', () => {
  const world = makeWorld({width: 20, height: 20, seed: 1, cells: []});
  const source = place(world, {x: 10, y: 10, material: 'water', vertical: 7.25, horizontal: -.5, updated: 1});
  defer(world, source);
  assert.equal(world.cells[source], 0);
  assert.equal(countDeferred(world).get(world.getMaterialId('water')), 1);
  world.setCell(10, 10, WALL);
  assert.equal(flush(world).retry, 1);
  assert.equal(world._deferredState.budget, 500);
  world.setCell(10, 10, 0);
  assert.equal(flush(world).retry, 0);
  assert.equal(world.cells[source], world.getMaterialId('water'));
  assert.equal(world.vertical[source], 7.25);
  assert.equal(world.horizontal[source], -.5);
  assert.equal(world._updated[source], 1);
});

test('density displacement from the new queue is processed on the next queue pass', () => {
  const world = makeWorld({width: 20, height: 20, seed: 1, cells: []});
  const source = place(world, {x: 10, y: 10, material: 'water', vertical: 2, updated: 1});
  defer(world, source);
  place(world, {x: 10, y: 10, material: 'oil'});
  const first = flush(world);
  assert.equal(first.pending, 1);
  assert.equal(world.cells[source], world.getMaterialId('water'));
  assert.equal(countDeferred(world).get(world.getMaterialId('oil')), 1);
  assert.equal(flush(world).pending, 0);
  assert.equal(world.cells[source - world.width], world.getMaterialId('oil'));
});

test('queued liquid age follows the global clock without discarding its stored state', () => {
  const world = makeWorld({width: 20, height: 20, seed: 1, cells: []});
  world.processes = true;
  const source = place(world, {x: 10, y: 10, material: 'water'});
  world.age[source] = 7;
  defer(world, source);
  world.tick = 6;
  flush(world);
  assert.equal(world.age[source], 12);
  defer(world, source);
  resetDeferred(world);
  assert.equal(countDeferred(world).size, 0);
  assert.equal(world._deferredState.budget, 200);
});
