import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LiquidRandom, canDisplaceLiquid, attachmentDirection,
  allowsSandSlide, allowsSlimeSlide} from '../src/liquids/native-rules.mjs';
import {LiquidWorld, WALL} from '../src/liquids/engine.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/noita-liquid-rules.json', import.meta.url)));
const material = {id: 'probe', density: 4, liquid_gravity: 1.5,
  liquid_damping: .8, liquid_flow_speed: .9, liquid_viscosity: 50};

test('liquid density displacement matches unchanged original x86 helper', () => {
  for (const row of fixture.density) {
    const random = new LiquidRandom(row.seed);
    const source = {density: row.source_density, liquid_sand: row.source_sand};
    const target = {density: row.target_density, liquid_sand: row.target_sand};
    assert.equal(canDisplaceLiquid(source, target, random), row.allowed, JSON.stringify(row));
    assert.equal(random.state, row.final_state, 'The displacement test must consume exactly one native random draw.');
  }
});

test('sand and slime viscosity gates match original branches and random consumption', () => {
  for (const row of fixture.viscosity) {
    const random = new LiquidRandom(row.seed);
    const gate = row.branch === 'sand' ? allowsSandSlide : allowsSlimeSlide;
    assert.equal(gate(row.viscosity, random), row.allowed, JSON.stringify(row));
    assert.equal(random.state, row.final_state, JSON.stringify(row));
  }
});

test('attachment direction matches the complete native hash at signed coordinate boundaries', () => {
  for (const row of fixture.attachment) {
    assert.equal(attachmentDirection(row.x, row.y), row.direction, JSON.stringify(row));
  }
});

test('free falling liquid acceleration matches the native float32 instruction slice', () => {
  for (const row of fixture.gravity) {
    const world = new LiquidWorld({width: 32, height: 32,
      materials: [{...material, liquid_gravity: row.gravity}]});
    world.setCell(16, 2, 1);
    world.vertical[2 * world.width + 16] = row.vertical;
    world.step();
    const cell = world.cells.indexOf(1);
    assert.equal(world.vertical[cell], row.next_vertical, JSON.stringify(row));
  }
});

test('falling sand-like liquids use the native low-gravity pause test', () => {
  for (const row of fixture.low_gravity) {
    const world = new LiquidWorld({width: 12, height: 12, seed: row.seed,
      materials: [{...material, liquid_sand: true, liquid_gravity: row.gravity}]});
    world.setCell(6, 2, 1);
    world._motion[2 * world.width + 6] = 1;
    // This fixture starts at the movement function, after the row's RNG draw.
    world.tick = 1;
    world._movingCell = 2 * world.width + 6;
    world._stepSand(world._movingCell, world.materials[1]);
    const cell = world.cells.indexOf(1);
    assert.equal(Math.floor(cell / world.width), row.paused ? 2 : 3, JSON.stringify(row));
    assert.equal(world.random.state, row.final_state, JSON.stringify(row));
  }
});

test('one-sided flow reaches the native movement threshold before damping', () => {
  for (const row of fixture.flow) {
    // Restrict to a resting cell so previous opposite momentum cannot invoke
    // the separate continuation branch after the captured threshold slice.
    if (row.horizontal !== 0) continue;
    const world = new LiquidWorld({width: 10, height: 10,
      materials: [{...material, liquid_flow_speed: row.flow_speed, liquid_damping: 0}]});
    world.fillRect(0, 5, 10, 1, WALL);
    world.setCell(5 - row.direction, 4, WALL);
    world.setCell(5, 4, 1);
    world.step();
    const cell = world.cells.indexOf(1);
    assert.equal(cell % world.width, 5 + (row.moves ? row.direction : 0), JSON.stringify(row));
    assert.equal(world.horizontal[cell], row.moves ? row.next_horizontal * 0 : row.next_horizontal, JSON.stringify(row));
  }
});

test('horizontal continuation applies the original damping after every pixel move', () => {
  for (const row of fixture.damping) {
    if (Math.abs(row.horizontal) < 1) continue;
    const direction = Math.sign(row.horizontal);
    const world = new LiquidWorld({width: 12, height: 12,
      materials: [{...material, liquid_flow_speed: 0, liquid_damping: row.damping}]});
    // The first move is possible. A wall then ends continuation, so the final
    // momentum is exactly one native per-cell multiplication.
    world.fillRect(0, 6, 12, 1, WALL);
    world.setCell(5 + direction * 2, 5, WALL);
    world.setCell(5, 5, 1);
    world.horizontal[5 * world.width + 5] = row.horizontal;
    world.step();
    const cell = world.cells.indexOf(1);
    assert.equal(cell % world.width, 5 + direction, JSON.stringify(row));
    assert.equal(world.horizontal[cell], row.next_horizontal, JSON.stringify(row));
  }
});
