import {nativeFlag} from './native-rules.mjs';
import {createBurningExplosion, applyReactionEffects} from './effects.mjs';
import {queueMaterialCreation} from './mutations.mjs';

const EMPTY = 0;
const WALL = 65535;
const f32 = Math.fround;
const typeOf = material => String(material?.cell_type ?? '').toLowerCase();
const byte = value => Number(value) & 255;
export const signedByte = value => (Number(value) << 24) >> 24;
const signedShort = value => (Number(value) << 16) >> 16;
const numeric = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const targetCache = new WeakMap();

function materialId(world, value) {
  if (!value || value === 'air') return EMPTY;
  if (typeof value === 'string') return world.getMaterialId(value);
  let ids = targetCache.get(world);
  if (!ids) {
    ids = new Map();
    world.materials.forEach((material, id) => {
      if (material && Number.isInteger(material.initial_id)) ids.set(material.initial_id, id);
    });
    targetCache.set(world, ids);
  }
  return ids.get(value) ?? EMPTY;
}

function replace(world, index, id, options, source = null) {
  if (source) {
    source.replace(id, options);
    return source.id === EMPTY ? -1 : index;
  }
  if (world.cells[index] !== id) world._replaceMaterial(index, id, options);
  return id === EMPTY ? -1 : index;
}

function cardinalNeighbor(world, index) {
  const x = index % world.width;
  const y = Math.floor(index / world.width);
  switch (world.random.integer(3)) {
    case 0: return world._index(x - 1, y);
    case 1: return world._index(x + 1, y);
    case 2: return world._index(x, y - 1);
    default: return world._index(x, y + 1);
  }
}

export function gasInitialAge(lifetime, random) {
  if (!(lifetime > 0)) return 0;
  const radius = Math.max(1, Math.trunc(f32(f32(lifetime) * f32(.3))));
  return random.integer(radius * 2) - radius;
}

export function ignitionChance(material, random) {
  const threshold = numeric(material.hundred_minus_autoignition_temp,
    100 - numeric(material.autoignition_temperature, 100));
  return random.integer(100) < threshold;
}

export function offspringHeat(temperature, random) {
  const unit = f32(random.next() / 32767);
  const scale = f32(f32(unit * 0.5399999618530273) + f32(.75)); // Native 0x01053648.
  return Math.trunc(f32(signedByte(temperature) * scale)) | 0;
}

// Gas age counts moves. Liquid and fire age count elapsed ticks.
export function initializeCellEnvironment(world, index, material, options = {}) {
  const type = typeOf(material);
  world.age[index] = 0;
  world.burning[index] = 0;
  world.fireTemperature[index] = signedByte(numeric(material?.temperature_of_fire, 50));
  world.gasDirection[index] = 0;
  world.gasHeat[index] = 0;
  world.gasIdle[index] = 0;
  if (nativeFlag(material?.on_fire)) {
    // ICellBurnable consumes the birth draw even though on_fire forces true.
    (world.effectRandom ?? world.random).integer(100);
    world.burning[index] = 1;
  }
  if (type === 'gas') {
    world.gasDirection[index] = world.random.integer(100) < 50 ? 1 : -1;
    world.age[index] = gasInitialAge(numeric(material.lifetime), world.random);
  } else if (type === 'fire') {
    world.age[index] = world.random.integer(20);
    world.burning[index] = 1;
  } else if (type === 'liquid') {
    world.age[index] = -gasInitialAge(numeric(material.lifetime), world.random) | 0;
  }
  if (Number.isInteger(options.age)) world.age[index] = options.age;
  if (type === 'gas' && Number.isFinite(options.gasHeat)) world.gasHeat[index] = Math.trunc(options.gasHeat);
  if (Number.isFinite(options.temperature)) world.fireTemperature[index] = signedByte(options.temperature);
  if (options.burning === true || options.forceIgnite === true) world.burning[index] = 1;
}

export function convertCellEnvironment(world, index, previous, material) {
  if (!previous || !material || (typeOf(previous) || 'liquid') !== (typeOf(material) || 'liquid')) return false;
  if (world.burning[index] && !nativeFlag(material.burnable)) return false;
  if ((typeOf(material) || 'liquid') === 'liquid') {
    world.age[index] = 0;
    if (world._attached) world._attached[index] = nativeFlag(material.liquid_static) ? 2 : 0;
  }
  // Gas and fire use the base material-pointer setter. Their other state stays.
  return true;
}

export function expireCell(world, index, material) {
  // The fire update uses a random end-of-update removal, not material lifetime.
  if (typeOf(material) === 'fire') return false;
  const lifetime = numeric(material.lifetime);
  if (lifetime > 0 && world.age[index] >= lifetime) {
    replace(world, index, EMPTY);
    return true;
  }
  return false;
}

export function igniteCell(world, index, temperature = 100, {force = false} = {}) {
  const material = world.materials[world.cells[index]];
  if (!material || !nativeFlag(material.burnable) || world.burning[index]) return false;
  const ignited = force || ignitionChance(material, world.random);
  if (ignited) {
    world.burning[index] = 1;
    world.fireTemperature[index] = signedByte(temperature);
  }
  if (force) return true;
  // The gas virtual wrapper converts after the attempt, even if its gate fails.
  if (typeOf(material) === 'gas' || (ignited && numeric(material.fire_hp) === 0)) {
    replace(world, index, materialId(world, material.on_fire_flame_material));
  }
  return ignited;
}

function spreadFire(world, index) {
  const temperature = world.fireTemperature[index];
  if (world.random.integer(100) > temperature) return;
  const neighbor = cardinalNeighbor(world, index);
  if (neighbor < 0) return;
  const material = world.materials[world.cells[neighbor]];
  if (!material) return;
  // The native path also darkens solid and sand colors with one random draw.
  if (typeOf(material) === 'solid' || nativeFlag(material.liquid_sand)) world.random.next();
  if (nativeFlag(material.burnable) && !world.burning[neighbor]) {
    igniteCell(world, neighbor, temperature);
  }
}

function emit(world, index, id, heat, replaceExisting) {
  const x = index % world.width + world.random.integer(2) - 1;
  const y = Math.floor(index / world.width) - 1;
  const target = world._index(x, y);
  if (target < 0 || world.cells[target] !== EMPTY) return false;
  if (world._inStep && !world._committing) {
    queueMaterialCreation(world, target, id, {replace: replaceExisting});
  } else if (id !== EMPTY) {
    world._replaceMaterial(target, id, {gasHeat: heat});
  }
  return true;
}

export function updateOxygenTemperature(temperature, materialTemperature, requiresOxygen, emitted) {
  if (!requiresOxygen) return {temperature: signedByte(temperature), extinguished: false};
  const next = emitted ? signedByte(materialTemperature) : signedByte(temperature - 1);
  return {temperature: next, extinguished: next < 1};
}

function burn(world, index, material) {
  let emitted = false;
  const flames = numeric(material.generates_flames);
  if (flames > 0 && world.random.integer(100) < flames) {
    emitted = emit(world, index, materialId(world, material.on_fire_flame_material),
      offspringHeat(world.fireTemperature[index], world.random), false);
  }
  const oxygen = updateOxygenTemperature(world.fireTemperature[index],
    material.temperature_of_fire, nativeFlag(material.requires_oxygen), emitted);
  world.fireTemperature[index] = oxygen.temperature;
  if (oxygen.extinguished) world.burning[index] = 0;
  const smoke = numeric(material.generates_smoke);
  if (smoke > 0 && world.random.integer(100) < smoke) {
    emit(world, index, materialId(world, material.on_fire_smoke_material),
      offspringHeat(world.fireTemperature[index], world.random), true);
  }
  const explosion = createBurningExplosion(world, index, material);
  if (explosion) {
    applyReactionEffects(world, [explosion]);
    return;
  }
  if (world.burning[index]) spreadFire(world, index);
}

export function canEnterGas(world, source, target) {
  if (target < 0) return false;
  const id = world.cells[target];
  if (id === EMPTY) return true;
  if (id === WALL) return false;
  const material = world.materials[id];
  if (typeOf(material) === 'solid' || typeOf(material) === 'liquid') return false;
  if (typeOf(material) === 'gas' && id === world.cells[source]) return false;
  if (world.random.integer(100) < 75 || typeOf(material) !== 'gas') return false;
  return f32(world.materials[world.cells[source]].density) < f32(material.density);
}

function moveGas(world, index, target) {
  const previousY = Math.floor(index / world.width);
  index = world._swap(index, target);
  if (Math.floor(index / world.width) !== previousY) world.gasIdle[index] = 0;
  world.age[index]++;
  world._environmentReactionEligible[index] = 0;
  return index;
}

function stepGas(world, index, material, special, processes) {
  world._environmentReactionEligible[index] = 0;
  if (!special && world.gasIdle[index] >= 100) return index;
  const x = index % world.width, y = Math.floor(index / world.width);
  const stationary = nativeFlag(material.liquid_static);
  if (!stationary && world.random.integer(100) > byte(material.gas_speed)) {
    canEnterGas(world, index, world._index(x, y - 1));
    return index;
  }
  if (stationary) world.gasIdle[index] = 100;
  if (processes && world.gasHeat[index] > 0) {
    world.gasHeat[index] -= world.random.integer(2);
    world.fireTemperature[index] = signedByte(world.gasHeat[index]);
    if (world.random.integer(100) < world.fireTemperature[index]) spreadFire(world, index);
  }
  if (processes && world.burning[index]) {
    const id = world.cells[index], stamp = world._changedAt?.[index];
    burn(world, index, material);
    if (world.cells[index] !== id || world._changedAt?.[index] !== stamp) {
      return world.cells[index] === EMPTY ? -1 : index;
    }
  }
  if (!stationary) {
    let target = world._index(x, y - 1);
    if (world.random.integer(100) < byte(material.gas_upwards_speed) && canEnterGas(world, index, target)) {
      return moveGas(world, index, target);
    }
    if (world.random.integer(100) < byte(material.gas_horizontal_speed)) {
      const direction = world.gasDirection[index] || 1;
      target = world._index(x + direction, y);
      if (canEnterGas(world, index, target)) return moveGas(world, index, target);
      target = world._index(x - direction, y);
      if (canEnterGas(world, index, target)) {
        index = moveGas(world, index, target);
        world.gasDirection[index] *= -1;
        return index;
      }
    }
    target = world._index(x, y + 1);
    if (world.random.integer(100) < byte(material.gas_downwards_speed)
      && target >= 0 && world.cells[target] === EMPTY) return moveGas(world, index, target);
    if (world.gasIdle[index] < 100) world.gasIdle[index]++;
  }
  if (world.gasIdle[index] < 100) canEnterGas(world, index, world._index(x, y - 1));
  world._environmentReactionEligible[index] = 1;
  return index;
}

function isSandOrSolid(world, index) {
  if (index < 0 || world.cells[index] === WALL) return true;
  const material = world.materials[world.cells[index]];
  return material && (typeOf(material) === 'solid' || nativeFlag(material.liquid_sand));
}

function stepFire(world, index, processes) {
  world._environmentReactionEligible[index] = 0;
  if (processes) {
    spreadFire(world, index);
    spreadFire(world, index);
  }
  const x = index % world.width, y = Math.floor(index / world.width);
  if (world.random.integer(100) < 35) {
    const above = world._index(x, y - 1);
    if (above >= 0 && world.cells[above] === EMPTY) return world._swap(index, above);
    if (world.random.integer(100) < 35) return index;
    const direction = world.random.integer(100) < 50 ? -1 : 1;
    for (const side of [direction, -direction]) {
      const target = world._index(x + side, y);
      if (target >= 0 && world.cells[target] === EMPTY) return world._swap(index, target);
    }
    // Preserve draws from the native soot pass. Its color darkening is separate.
    if (processes && isSandOrSolid(world, above) && world.random.integer(100) < 20) {
      world.random.next();
      const distance = world.random.integer(5) + 1;
      for (let offset = 2; offset < distance + 1; offset++) {
        world.random.next();
        const side = world.random.integer(2) - 1;
        const target = world._index(x + side, y - offset);
        if (target < 0 || !isSandOrSolid(world, target)) break;
      }
    }
  }
  if (processes && (world.random.next() & 15) === 0) return replace(world, index, EMPTY);
  world._environmentReactionEligible[index] = 1;
  return index;
}

export function stepGasOrFire(world, index, material, {special = false, processes = true} = {}) {
  return typeOf(material) === 'fire' ? stepFire(world, index, processes)
    : stepGas(world, index, material, special, processes);
}

export function stepCellEnvironment(world, index, material, {processes = true, source = null} = {}) {
  if (!processes || !world.burning[index]) return index;
  const id = world.cells[index], stamp = world._changedAt?.[index];
  burn(world, index, material);
  if (!source && (world.cells[index] !== id || world._changedAt?.[index] !== stamp)) {
    return world.cells[index] === EMPTY ? -1 : index;
  }
  const fireHP = Math.trunc(numeric(material.fire_hp, -1));
  if (fireHP >= 0) {
    let consumed = world.random.integer(fireHP) === 0;
    if (!consumed && (nativeFlag(material.liquid_static) || world._attached?.[index])
      && world.random.integer(fireHP) <= 29) {
      const x = index % world.width, y = Math.floor(index / world.width);
      const direction = world.random.integer(3);
      const dx = direction === 0 ? -1 : direction === 1 ? 1 : 0;
      const dy = direction === 2 ? -1 : direction === 3 ? 1 : 0;
      let neighbor = world._index(x + dx, y + dy);
      if (neighbor < 0) neighbor = world._index(x - dx, y - dy);
      consumed = neighbor < 0 || world.cells[neighbor] === EMPTY;
    }
    if (consumed) {
      world._environmentReactionEligible[index] = 0;
      return replace(world, index, materialId(world, material.on_fire_flame_material), undefined, source);
    }
  }
  return index;
}

export function stepAttachedEnvironment(world, index, material, {special = false} = {}) {
  const result = {index, reaction: null, burn: false};
  const gate = special && world.random.integer(100) < 20;
  if (!gate) {
    if (numeric(material.max_fast_reaction_probability) > 0) {
      result.reaction = 'fast';
      return result;
    }
  } else {
    if (material.liquid_sticks_to_ceiling > 0 && world._releaseAttachment(index, material)) return result;
    if (numeric(material.max_reaction_probability) > 0 && world.random.integer(100) < 50) {
      result.reaction = 'normal';
      return result;
    }
  }
  result.burn = Boolean(world.burning[index]);
  if (!result.burn && special) {
    // 0x70ad30 removes an isolated attached pixel only when all four samples exist.
    const x = index % world.width, y = Math.floor(index / world.width);
    const neighbors = [world._index(x - 1, y), world._index(x + 1, y),
      world._index(x, y - 1), world._index(x, y + 1)];
    if (neighbors.every(neighbor => neighbor >= 0 && world.cells[neighbor] === EMPTY)) {
      result.index = replace(world, index, EMPTY);
    }
  }
  return result;
}

// The native normal-reaction callback chooses these gates before its neighbor.
// World masks hold the engine's cold/warm strengths, not temperature degrees.
export function prepareEnvironmentFlags(world, index, material, source = null) {
  let coldTarget = 0, warmTarget = 0;
  const cold = byte(world.cold?.[index] ?? 0), warmth = byte(world.warmth?.[index] ?? 0);
  const coldId = cold ? materialId(world, material.cold_freezes_to_material_name
    || material.cold_freezes_to_material_id) : 0;
  if (coldId) {
    const reverse = signedShort(numeric(material.cold_freezes_chance_rev, 100));
    if (reverse >= 0 && world.random.integer(reverse) < cold) {
      const motion = source?.getState?.('_motion') ?? world._motion[index];
      const vertical = source?.getState?.('vertical') ?? world.vertical[index];
      const eligible = typeOf(material) !== 'liquid' || (motion === 3 && vertical === 0);
      if (eligible) coldTarget = coldId;
    }
  }
  const warmId = warmth ? materialId(world, material.warmth_melts_to_material) : 0;
  if (warmId) {
    const reverse = signedShort(numeric(material.warmth_melts_chance_rev, 100));
    if (reverse >= 0 && world.random.integer(reverse) < warmth) warmTarget = warmId;
  }
  return {coldTarget, warmTarget};
}

export function applyEnvironmentFlags(world, index, material, flags, neighbor, source = null) {
  if (neighbor < 0) return false;
  const neighborId = world.cells[neighbor];
  const other = world.materials[neighborId];
  if (flags.coldTarget) {
    if (other && typeOf(other) === 'liquid' && !nativeFlag(other.liquid_sand)) return false;
    if (source) source.replace(flags.coldTarget);
    else replace(world, index, flags.coldTarget);
    return true;
  }
  if (flags.warmTarget && neighborId !== (source?.id ?? world.cells[index])) {
    if (source) source.replace(flags.warmTarget);
    else replace(world, index, flags.warmTarget);
    return true;
  }
  return false;
}
