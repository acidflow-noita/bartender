import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {LiquidRandom} from '../src/liquids/native-rules.mjs';
import {LiquidWorld} from '../src/liquids/engine.mjs';
import {flushMaterialCreations} from '../src/liquids/mutations.mjs';
import {gasInitialAge, ignitionChance, offspringHeat, updateOxygenTemperature,
  initializeCellEnvironment, canEnterGas, prepareEnvironmentFlags, applyEnvironmentFlags,
  expireCell, stepGasOrFire, igniteCell, convertCellEnvironment, stepCellEnvironment,
  stepAttachedEnvironment} from '../src/liquids/thermal.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/noita-cell-environment.json', import.meta.url)));

function harness(materials, seed = 1, width = 8, height = 8) {
  const size = width * height;
  const world = {materials: [null, ...materials], width, height,
    cells: new Uint16Array(size), age: new Int32Array(size),
    burning: new Uint8Array(size), fireTemperature: new Int8Array(size),
    gasDirection: new Int8Array(size), gasHeat: new Int32Array(size),
    gasIdle: new Uint8Array(size), cold: new Uint8Array(size), warmth: new Uint8Array(size),
    _motion: new Uint8Array(size).fill(3), vertical: new Float32Array(size),
    _environmentReactionEligible: new Uint8Array(size),
    random: new LiquidRandom(seed), effectRandom: new LiquidRandom(seed),
    getMaterialId(name) { return Math.max(0, this.materials.findIndex(material => material?.id === name)); },
    _index(x, y) { return x < 0 || y < 0 || x >= width || y >= height ? -1 : y * width + x; },
    _replaceMaterial(index, id, options = {}) {
      this.cells[index] = id;
      if (id) initializeCellEnvironment(this, index, this.materials[id], options);
    },
    _swap(source, target) {
      for (const array of [this.cells, this.age, this.burning, this.fireTemperature,
        this.gasDirection, this.gasHeat, this.gasIdle, this._environmentReactionEligible]) {
        const value = array[target]; array[target] = array[source]; array[source] = value;
      }
      return target;
    },
  };
  return world;
}

test('gas birth age and direction match original constructor instructions', () => {
  for (const row of fixture.gas_age) {
    const random = new LiquidRandom(row.seed);
    assert.equal(gasInitialAge(row.lifetime, random), row.age, JSON.stringify(row));
    assert.equal(random.state, row.final_state);
  }
  for (const row of fixture.gas_direction) {
    const material = {id: 'gas', cell_type: 'gas', lifetime: 0};
    const world = harness([material], row.seed);
    initializeCellEnvironment(world, 0, material);
    assert.equal(world.gasDirection[0], row.direction);
    assert.equal(world.random.state, row.final_state);
  }
});

test('liquid birth age negates the native birth-clock jitter', () => {
  for (const row of fixture.liquid_age) {
    const material = {id: 'liquid', cell_type: 'liquid', lifetime: row.lifetime};
    const world = harness([material], row.seed);
    initializeCellEnvironment(world, 0, material);
    assert.equal(world.age[0], row.age, JSON.stringify(row));
    assert.equal(world.random.state, row.final_state);
  }
});

test('fire birth age uses the native zero-to-twenty draw', () => {
  for (const row of fixture.fire_age) {
    const material = {id: 'fire', cell_type: 'fire', on_fire: true};
    const world = harness([material], row.seed);
    initializeCellEnvironment(world, 0, material);
    assert.equal(world.age[0], row.age);
    assert.equal(world.random.state, row.final_state);
    assert.equal(world.burning[0], 1);
  }
});

test('ignition probability matches the complete native ignition helper', () => {
  for (const row of fixture.ignition) {
    const random = new LiquidRandom(row.seed);
    assert.equal(ignitionChance(row, random), row.burning, JSON.stringify(row));
    assert.equal(random.state, row.final_state);
  }
});

test('offspring heat matches native signed bytes and float32 arithmetic', () => {
  for (const row of fixture.offspring_heat) {
    const random = new LiquidRandom(row.seed);
    assert.equal(offspringHeat(row.temperature, random), row.heat, JSON.stringify(row));
    assert.equal(random.state, row.final_state);
  }
});

test('oxygen loss and flame refresh match the original byte operations', () => {
  for (const row of fixture.oxygen) {
    const result = updateOxygenTemperature(row.temperature, row.material_temperature,
      row.requires_oxygen, row.emitted);
    assert.equal(result.temperature, row.next_temperature, JSON.stringify(row));
    assert.equal(!result.extinguished, row.burning, JSON.stringify(row));
  }
});

test('gas displacement matches all captured native cell type, density and RNG cases', () => {
  for (const row of fixture.gas_displacement) {
    const world = harness([
      {id: 'a', cell_type: 'gas', density: row.source_density},
      {id: 'b', cell_type: row.target_type, density: row.target_density},
    ], row.seed);
    world.cells[0] = 1;
    world.cells[1] = row.target_type === 'empty' ? 0
      : row.same_material && row.target_type === 'gas' ? 1 : 2;
    assert.equal(canEnterGas(world, 0, 1), row.allowed, JSON.stringify(row));
    assert.equal(world.random.state, row.final_state, JSON.stringify(row));
  }
});

test('cold and warmth gates match signed-short native probabilities', () => {
  for (const row of fixture.environment_gates) {
    const material = {id: 'a', cell_type: 'liquid', cold_freezes_to_material_name: 'b',
      warmth_melts_to_material: 'b', cold_freezes_chance_rev: row.chance_rev,
      warmth_melts_chance_rev: row.chance_rev};
    const world = harness([material, {id: 'b', cell_type: 'liquid'}], row.seed);
    world.cells[0] = 1;
    (row.kind === 'cold' ? world.cold : world.warmth)[0] = row.strength;
    const result = prepareEnvironmentFlags(world, 0, material);
    assert.equal(Boolean(row.kind === 'cold' ? result.coldTarget : result.warmTarget), row.allowed, JSON.stringify(row));
    assert.equal(world.random.state, row.final_state, JSON.stringify(row));
  }
});

test('cold waits for settled exposed liquid and warmth cannot melt an interior cell', () => {
  const material = {id: 'water', cell_type: 'liquid', cold_freezes_to_material_name: 'ice',
    cold_freezes_chance_rev: 0, warmth_melts_to_material: 'steam', warmth_melts_chance_rev: 0};
  const world = harness([material, {id: 'ice', cell_type: 'liquid', liquid_sand: true},
    {id: 'steam', cell_type: 'gas'}]);
  world.cells[0] = world.cells[1] = 1;
  world.cold[0] = 1;
  world._motion[0] = 1;
  assert.equal(prepareEnvironmentFlags(world, 0, material).coldTarget, 0);
  world._motion[0] = 3;
  let flags = prepareEnvironmentFlags(world, 0, material);
  assert.equal(applyEnvironmentFlags(world, 0, material, flags, 1), false);
  world.cells[1] = 0;
  assert.equal(applyEnvironmentFlags(world, 0, material, flags, 1), true);
  assert.equal(world.cells[0], 2);
  world.cells[0] = world.cells[1] = 1;
  world.cold[0] = 0; world.warmth[0] = 1;
  flags = prepareEnvironmentFlags(world, 0, material);
  assert.equal(applyEnvironmentFlags(world, 0, material, flags, 1), false);
  world.cells[1] = 2;
  assert.equal(applyEnvironmentFlags(world, 0, material, flags, 1), true);
  assert.equal(world.cells[0], 3);
});

test('temperature callbacks operate on a detached source without filling its empty grid slot', () => {
  const material = {id: 'water', cell_type: 'liquid', cold_freezes_to_material_name: 'ice',
    cold_freezes_chance_rev: 0, warmth_melts_to_material: 'steam', warmth_melts_chance_rev: 0};
  const world = harness([material, {id: 'ice', cell_type: 'liquid', liquid_sand: true},
    {id: 'steam', cell_type: 'gas'}]);
  const conversions = [];
  const source = {id: 1, getState: name => name === '_motion' ? 3 : 0,
    replace: id => conversions.push(id)};
  world.cold[0] = 1;
  world._motion[0] = 1;
  let flags = prepareEnvironmentFlags(world, 0, material, source);
  assert.equal(flags.coldTarget, 2);
  assert.equal(applyEnvironmentFlags(world, 0, material, flags, 1, source), true);
  assert.deepEqual(conversions, [2]);
  assert.equal(world.cells[0], 0);
  world.cold[0] = 0; world.warmth[0] = 1; world.cells[1] = 1;
  flags = prepareEnvironmentFlags(world, 0, material, source);
  assert.equal(applyEnvironmentFlags(world, 0, material, flags, 1, source), false);
  assert.deepEqual(conversions, [2]);
});

test('detached burnout queues source conversion and ends its dispatcher without filling the grid slot', () => {
  const material = {id: 'fuel', cell_type: 'liquid', burnable: true, fire_hp: 0,
    requires_oxygen: false, generates_flames: 0, generates_smoke: 0, on_fire_flame_material: 'fire'};
  const world = harness([material, {id: 'fire', cell_type: 'fire'}]);
  world.burning[0] = 1; world.fireTemperature[0] = -128;
  world._environmentReactionEligible[0] = 1;
  const conversions = [];
  const source = {id: 1, replace: id => conversions.push(id)};
  assert.equal(stepCellEnvironment(world, 0, material, {source}), 0);
  assert.deepEqual(conversions, [2]);
  assert.equal(world.cells[0], 0);
  assert.equal(world._environmentReactionEligible[0], 0);
});

test('flame and smoke emissions retain distinct native queued-creation flags', () => {
  const material = {id: 'fuel', cell_type: 'liquid', burnable: true, fire_hp: -1,
    requires_oxygen: false, generates_flames: 101, generates_smoke: 101,
    on_fire_flame_material: 'fire', on_fire_smoke_material: 'smoke'};
  const world = harness([material, {id: 'fire', cell_type: 'fire', on_fire: true},
    {id: 'smoke', cell_type: 'gas', lifetime: 350}]);
  world.cells[36] = 1; world.burning[36] = 1; world.fireTemperature[36] = 90;
  world._inStep = true;
  stepCellEnvironment(world, 36, material);
  assert.deepEqual(world.materialMutations.creations.map(command => [command.material, command.replace]),
    [[2, false], [3, true]]);
  assert.equal(world.cells.filter(id => id > 1).length, 0);
  assert.equal(world.effectRandom.state, 1);
  assert.ok(world.materialMutations.creations.every(command => Object.keys(command).length === 4));
  flushMaterialCreations(world);
  assert.ok(world.cells.includes(3));
  assert.ok(world.gasHeat.every(value => value === 0));
});

test('gas ages on successful movement and skips reaction processing on that update', () => {
  const material = {id: 'steam', cell_type: 'gas', lifetime: 10, density: 1,
    gas_speed: 100, gas_upwards_speed: 100, gas_horizontal_speed: 0, gas_downwards_speed: 0};
  const world = harness([material]);
  world.cells[28] = 1; world.age[28] = -2; world.gasDirection[28] = 1;
  const destination = stepGasOrFire(world, 28, material, {processes: false});
  assert.equal(destination, 20);
  assert.equal(world.age[destination], -1);
  assert.equal(world._environmentReactionEligible[destination], 0);
  world.cells.fill(65535); world.cells[28] = 1; world.age[28] = -2;
  for (let n = 0; n < 50; n++) stepGasOrFire(world, 28, material, {processes: false});
  assert.equal(world.age[28], -2);
  world.age[28] = 10;
  assert.equal(expireCell(world, 28, material), true);
  assert.equal(world.cells[28], 0);
});

test('forced ignition preserves liquid age and gas ignition uses its native conversion wrapper', () => {
  const world = harness([
    {id: 'oil', cell_type: 'liquid', burnable: true, fire_hp: 500},
    {id: 'gas', cell_type: 'gas', burnable: true, autoignition_temperature: 100,
      on_fire_flame_material: 'fire'},
    {id: 'fire', cell_type: 'fire', on_fire: true},
  ]);
  world.cells[0] = 1; world.age[0] = 72;
  assert.equal(igniteCell(world, 0, 95, {force: true}), true);
  assert.equal(world.burning[0], 1);
  assert.equal(world.age[0], 72);
  world.cells[1] = 2;
  assert.equal(igniteCell(world, 1, 95), false);
  assert.equal(world.cells[1], 3);
  world.cells[2] = 2; world.age[2] = 17;
  const state = world.random.state;
  assert.equal(igniteCell(world, 2, 95, {force: true}), true);
  assert.equal(world.cells[2], 2);
  assert.equal(world.burning[2], 1);
  assert.equal(world.age[2], 17);
  assert.equal(world.random.state, state);
});

test('same-type material conversion retains cell state and resets only liquid age', () => {
  const before = {id: 'a', cell_type: 'liquid', burnable: true};
  const after = {id: 'b', cell_type: 'liquid', burnable: true, liquid_static: true};
  const world = harness([before, after]);
  world._attached = new Uint8Array(world.cells.length);
  world.age[0] = 72; world.vertical[0] = 4.5;
  world.burning[0] = 1; world.fireTemperature[0] = 95;
  assert.equal(convertCellEnvironment(world, 0, before, after), true);
  assert.equal(world.age[0], 0);
  assert.equal(world.vertical[0], 4.5);
  assert.equal(world.burning[0], 1);
  assert.equal(world.fireTemperature[0], 95);
  assert.equal(world._attached[0], 2);
  assert.equal(convertCellEnvironment(world, 0, before, {...after, burnable: false}), false);
  world.burning[0] = 0; world.age[0] = -45; world.gasHeat[0] = 91;
  assert.equal(convertCellEnvironment(world, 0, {cell_type: 'gas'}, {cell_type: 'gas'}), true);
  assert.equal(world.age[0], -45);
  assert.equal(world.gasHeat[0], 91);
});

test('the native attached-cell burnout path consumes exposed material sooner than sealed material', () => {
  const material = {id: 'wood', cell_type: 'liquid', liquid_static: true,
    burnable: true, fire_hp: 100, requires_oxygen: false, generates_flames: 0,
    generates_smoke: 0, on_fire_flame_material: 'fire'};
  let seed = 0, choice;
  for (;; seed++) {
    const random = new LiquidRandom(seed);
    random.integer(100);
    if (random.integer(100) === 0 || random.integer(100) > 29) continue;
    choice = random.integer(3);
    break;
  }
  const worlds = [harness([material, {id: 'fire', cell_type: 'fire'}], seed),
    harness([material, {id: 'fire', cell_type: 'fire'}], seed)];
  for (const world of worlds) {
    world.cells.fill(1);
    world.burning[27] = 1;
    world.fireTemperature[27] = -128;
  }
  worlds[1].cells[27 + [-1, 1, -8, 8][choice]] = 0;
  stepCellEnvironment(worlds[0], 27, material);
  stepCellEnvironment(worlds[1], 27, material);
  assert.equal(worlds[0].cells[27], 1);
  assert.equal(worlds[1].cells[27], 2);
});

test('attached-cell dispatch matches original native branches and random consumption', () => {
  for (const row of fixture.attached_routing) {
    const material = {id: 'wall', cell_type: 'liquid', liquid_static: true,
      max_reaction_probability: row.normal, max_fast_reaction_probability: row.fast};
    const world = harness([material], row.seed);
    world.cells.fill(1); world.burning[27] = 1;
    const result = stepAttachedEnvironment(world, 27, material, {special: row.special});
    assert.equal(result.index, 27);
    assert.equal(result.reaction, row.route === 'burn' ? null : row.route, JSON.stringify(row));
    assert.equal(result.burn, row.route === 'burn', JSON.stringify(row));
    assert.equal(world.random.state, row.final_state, JSON.stringify(row));
  }
});

test('attached isolated pixels use native cleanup only on a special update', () => {
  const material = {id: 'wall', cell_type: 'liquid', liquid_static: true};
  const world = harness([material]);
  world.cells[27] = 1;
  assert.equal(stepAttachedEnvironment(world, 27, material, {special: false}).index, 27);
  assert.equal(stepAttachedEnvironment(world, 27, material, {special: true}).index, -1);
  assert.equal(world.cells[27], 0);
});

const physics = {density: 4, liquid_gravity: 0, liquid_damping: .8,
  liquid_flow_speed: .9, liquid_viscosity: 50};

test('the complete world expires liquid and gas at their native age boundaries', () => {
  const birth = fixture.liquid_age.find(row => row.lifetime === 3 && row.seed === 1);
  const liquid = new LiquidWorld({width: 16, height: 32, seed: 1,
    materials: [{...physics, id: 'liquid', cell_type: 'liquid', lifetime: 3}]});
  liquid.setCell(4, 2, 1);
  assert.equal(liquid.age[2 * 16 + 4], birth.age);
  const ticksUntilExpiry = 3 - birth.age;
  for (let tick = 1; tick < ticksUntilExpiry; tick++) {
    liquid.step();
    const cell = liquid.cells.indexOf(1);
    assert.notEqual(cell, -1);
    assert.equal(liquid.age[cell], birth.age + tick);
  }
  liquid.step();
  assert.equal(liquid.cells.includes(1), false);
  const gas = new LiquidWorld({width: 16, height: 32, seed: 1,
    materials: [{...physics, id: 'gas', cell_type: 'gas', lifetime: 3,
      gas_speed: 100, gas_upwards_speed: 100, gas_horizontal_speed: 0, gas_downwards_speed: 0}]});
  gas._replaceMaterial(10 * 16 + 4, 1, {fresh: true, age: 2});
  gas.step();
  const cell = gas.cells.indexOf(1);
  assert.equal(cell, 9 * 16 + 4);
  assert.equal(gas.age[cell], 3);
  gas.step();
  assert.equal(gas.cells.includes(1), false);
});

test('attached terrain bypasses the mobile-liquid lifetime check', () => {
  const world = new LiquidWorld({width: 16, height: 16, seed: 1,
    materials: [{...physics, id: 'terrain', cell_type: 'liquid', liquid_static: true,
      liquid_sand: true, lifetime: 1}]});
  world.fillRect(6, 6, 3, 3, 1);
  world.step(24);
  assert.equal(world.countMaterials().get(1), 9);
});

test('ignited explosive material reaches the shared terrain-damage implementation', () => {
  const world = new LiquidWorld({width: 32, height: 32, seed: 1, materials: [
    {...physics, id: 'rock', cell_type: 'liquid', liquid_static: true, liquid_sand: true,
      density: 10, hardness: 100, durability: 0},
    {...physics, id: 'powder', cell_type: 'liquid', liquid_sand: true,
      burnable: true, fire_hp: -1, temperature_of_fire: 100, requires_oxygen: false,
      hardness: 20, durability: 0,
      explosion_config: {cell_explosion_damage_required: 0, cell_explosion_power: 40,
        explosion_radius: 20, hole_enabled: true, ray_energy: 50000,
        max_durability_to_destroy: 10, hole_destroy_liquid: false,
        create_cell_material: 'fire', create_cell_probability: 100}},
    {...physics, id: 'fire', cell_type: 'fire', on_fire: true, temperature_of_fire: 100},
  ]});
  world.fillRect(9, 9, 11, 11, 1);
  world.setCell(14, 14, 2);
  const before = world.countMaterials().get(1);
  world.applyEnvironmentCircle(14, 14, 0, 'ignite');
  world.step();
  assert.ok(world.effects.some(effect => effect.type === 'explosion' && effect.applied));
  assert.ok(world.countMaterials().get(1) < before);
  assert.notEqual(world.cells[14 * 32 + 14], 2);
});
