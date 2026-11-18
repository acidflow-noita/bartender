import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applyReactionEffects, createBurningExplosion, explosionRayTable, explosionRayIndex, traceExplosionRay} from '../src/liquids/effects.mjs';
import {LiquidRandom} from '../src/liquids/native-rules.mjs';

const sourceMaterials = [null,
  {id: 'sand', cell_type: 'liquid', liquid_sand: true, hardness: 20000, durability: 10},
  {id: 'wall', cell_type: 'liquid', liquid_sand: true, hardness: 20000, durability: 11},
  {id: 'water', cell_type: 'liquid', liquid_sand: false, hardness: 0, durability: 0},
  {id: 'fire', cell_type: 'fire', hardness: 0, durability: 0},
  {id: 'hard', cell_type: 'liquid', liquid_sand: true, hardness: 100000, durability: 10},
];

function world(samples = [], width = 21, height = 21) {
  let cursor = 0;
  const materials = sourceMaterials;
  return {
    width, height, materials, cells: new Uint16Array(width * height), hp: new Int32Array(width * height),
    effects: [], tick: 9,
    random: {next() { throw new Error('Explosion geometry must use its separate RNG.'); }},
    effectRandom: {
      next() { return samples[cursor++] ?? 1; },
      integer(maximum) { return this.next() % (maximum + 1); },
      get samplesUsed() { return cursor; },
    },
    _index(x, y) { return x < 0 || y < 0 || x >= width || y >= height ? -1 : y * width + x; },
    getMaterialId(name) { return materials.findIndex(material => material?.id === name); },
    put(x, y, id, hp = id === 65535 ? 2147483647 : materials[id]?.hardness ?? 0) {
      const index = this._index(x, y);
      this.cells[index] = id; this.hp[index] = hp;
      return index;
    },
    _replaceMaterial(index, id) { this.cells[index] = id; this.hp[index] = materials[id]?.hardness ?? 0; },
  };
}

const config = {explosion_radius: 5, ray_energy: 50000, max_durability_to_destroy: 10,
  hole_enabled: true, hole_destroy_liquid: false, hole_destroy_physics_dynamic: true,
  destroy_non_platform_solid_enabled: true, create_cell_material: 'fire', create_cell_probability: 0};
const explosion = (overrides = {}) => ({type: 'explosion', x: 10, y: 10, config: {...config, ...overrides}, ruleIndex: 0});

test('native ray energy is spent on existing cell HP and returns maximum damage, not total damage', () => {
  for (const [sample, cutoffSquared] of [[0, 10], [1, 9]]) {
    const w = world([sample]);
    const cells = [w.put(3, 5, 1), w.put(4, 5, 1), w.put(5, 5, 1)];
    const result = traceExplosionRay(w, {x: 2, y: 5, endX: 7, endY: 5, rayEnergy: 50000, maxDurability: 10});
    assert.deepEqual(result, {cutoffSquared, damage: 20000});
    assert.deepEqual(cells.map(index => w.hp[index]), [20000, 20000, 20000]);
  }
});

test('native durability boundary blocks at greater-than, while equality passes', () => {
  const w = world([1]);
  w.put(3, 5, 2); w.put(4, 5, 1);
  const blocked = traceExplosionRay(w, {x: 2, y: 5, endX: 7, endY: 5, rayEnergy: 50000, maxDurability: 10});
  assert.deepEqual(blocked, {cutoffSquared: 1, damage: 20000});
  const passes = traceExplosionRay(w, {x: 2, y: 5, endX: 7, endY: 5, rayEnergy: 50000, maxDurability: 11});
  assert.equal(passes.cutoffSquared, 25);
});

test('air and ordinary liquid do not spend the terrain ray budget', () => {
  const w = world();
  for (let x = 3; x <= 7; x++) w.put(x, 5, 3);
  const result = traceExplosionRay(w, {x: 2, y: 5, endX: 7, endY: 5, rayEnergy: 50000, maxDurability: 10});
  assert.deepEqual(result, {cutoffSquared: 25, damage: 0});
  assert.equal(w.effectRandom.samplesUsed, 0);
});

test('the native axial ray limit is 2048 cells', () => {
  const w = world([], 3001, 2);
  assert.equal(traceExplosionRay(w, {x: 0, y: 0, endX: 3000, endY: 0,
    rayEnergy: 50000, maxDurability: 10}).cutoffSquared, 2048 ** 2);
});

test('the explosion samples 360 directions and retains native angle-table indexing', () => {
  const w = world();
  const rays = explosionRayTable(w, explosion());
  assert.equal(rays.cutoffs.length, 360);
  assert.equal(rays.damage.length, 360);
  assert.equal(rays.cutoffs[0], 25);
  assert.equal(explosionRayIndex(1, 0), 179);
  assert.equal(explosionRayIndex(0, 1), 269);
  assert.equal(explosionRayIndex(0, -1), 89);
  assert.equal(explosionRayIndex(-1, 0), 359);
});

test('a hard cell retains partial damage and a second explosion uses that remaining HP', () => {
  const w = world(Array(720).fill(0)), hard = w.put(9, 10, 5);
  applyReactionEffects(w, [explosion()]);
  assert.equal(w.cells[hard], 5);
  assert.equal(w.hp[hard], 50000);
  applyReactionEffects(w, [explosion()]);
  assert.equal(w.cells[hard], 0);
});

test('indestructible boundaries protect material behind them and remain unchanged', () => {
  const w = world();
  for (let y = 0; y < w.height; y++) w.put(11, y, 65535);
  const protectedCell = w.put(13, 10, 1), wall = w._index(11, 10);
  applyReactionEffects(w, [explosion({create_cell_probability: 101})]);
  assert.equal(w.cells[wall], 65535);
  assert.equal(w.hp[wall], 2147483647);
  assert.equal(w.cells[protectedCell], 1);
  assert.equal(w.hp[protectedCell], 20000);
});

test('reaction explosions preserve liquids and use the configured replacement material', () => {
  const w = world(), water = w.put(10, 11, 3), sand = w.put(9, 10, 1);
  applyReactionEffects(w, [explosion({create_cell_probability: 101})]);
  assert.equal(w.cells[water], 3);
  assert.equal(w.cells[sand], 4);
  assert.equal(w.cells[w._index(10, 10)], 4);
  assert.equal(w.effects.length, 1);
  assert.equal(w.effects[0].tick, 9);
});

test('disabled holes leave the cell world untouched while retaining the visual event', () => {
  const w = world(), cell = w.put(11, 10, 1);
  assert.equal(applyReactionEffects(w, [explosion({hole_enabled: false})]), 0);
  assert.equal(w.cells[cell], 1);
  assert.equal(w.hp[cell], 20000);
  assert.equal(w.effects.length, 1);
});

function burningMaterial(overrides = {}) {
  return {id: 'tnt', cell_type: 'liquid', explosion_config: {...config,
    cell_explosion_damage_required: 30, cell_explosion_power: 40,
    cell_explosion_probability: 0, ...overrides}};
}

test('burning TNT uses its damage-required gate and square-root power radius', () => {
  const w = world(), source = burningMaterial(), original = structuredClone(source);
  let samples = [32767, 0];
  w.random = {next() { return samples.shift(); }};
  const low = createBurningExplosion(w, 10 * w.width + 10, source);
  assert.equal(low.config.explosion_radius, Math.fround(Math.sqrt(30)));
  assert.equal(low.config.never_cache, false);
  assert.equal(low.materialId, 'tnt');
  assert.equal(low.x, 10); assert.equal(low.y, 10);
  samples = [32767, 32767];
  assert.equal(createBurningExplosion(w, 0, source).config.explosion_radius, Math.fround(Math.sqrt(50)));
  assert.deepEqual(source, original);
});

test('burning explosion gates consume one draw on failure and ignore the separate reaction probability', () => {
  const w = world();
  let calls = 0;
  w.random = {next() { calls++; return 0; }};
  assert.equal(createBurningExplosion(w, 0, burningMaterial()), null);
  assert.equal(calls, 1);
  const sodium = burningMaterial({cell_explosion_damage_required: 0, cell_explosion_power: 20,
    cell_explosion_probability: 0});
  assert.ok(createBurningExplosion(w, 0, sodium));
  assert.equal(calls, 3);
});

test('native burning explosion range and radius caps remain distinct', () => {
  const w = world();
  w.random = {next() { return 32767; }};
  assert.equal(createBurningExplosion(w, 0, burningMaterial({cell_explosion_damage_required: 300000})), null);
  assert.equal(createBurningExplosion(w, 0, burningMaterial({cell_explosion_damage_required: 100,
    cell_explosion_power: 1000000})).config.explosion_radius, 150);
  w._explosionDepth = 1;
  assert.equal(createBurningExplosion(w, 0, burningMaterial()), null);
});

test('unresolved large-radius distortion is reported without changing terrain', () => {
  const w = world(), cell = w.put(11, 10, 1);
  assert.equal(applyReactionEffects(w, [explosion({explosion_radius: 61})]), 0);
  assert.equal(w.cells[cell], 1);
  assert.equal(w.hp[cell], 20000);
  assert.equal(w.effects[0].applied, false);
  assert.deepEqual(w.effects[0].unsupported, ['large-explosion-ray-variation']);
});

test('burning explosion decisions, radius bits and RNG match the game machine-code fixtures', () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/noita-cell-environment.json', import.meta.url), 'utf8'));
  const bytes = new DataView(new ArrayBuffer(4));
  for (const entry of fixture.burning_explosion) {
    const w = world();
    w.random = new LiquidRandom(entry.seed);
    const event = createBurningExplosion(w, 0, burningMaterial({
      cell_explosion_damage_required: entry.damage_required, cell_explosion_power: entry.power}));
    assert.equal(Boolean(event), entry.explodes, JSON.stringify(entry));
    assert.equal(w.random.state, entry.final_state, JSON.stringify(entry));
    if (event) {
      bytes.setFloat32(0, event.config.explosion_radius, true);
      assert.equal(bytes.getUint32(0, true), Number(entry.radius_bits), JSON.stringify(entry));
    }
  }
});
