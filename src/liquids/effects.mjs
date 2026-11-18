import {nativeFlag} from './native-rules.mjs';
import {queueExplosion} from './mutations.mjs';

const EMPTY = 0;
const WALL = 65535;
const f32 = Math.fround;
const TAU = f32(6.2831855);
const blocksRay = material => material?.cell_type === 'solid' || nativeFlag(material?.liquid_sand);

function squared(x, y) { return f32(f32(x * x) + f32(y * y)); }

// Burning material path 0x0070fb10 uses damage_required as its gate. The
// radius comes from sqrt(power * variation), not the configured base radius.
export function createBurningExplosion(world, index, material) {
  const source = material?.explosion_config;
  if (!source || material.cell_type === 'solid' || (world._explosionDepth ?? 0) > 0) return null;
  const required = f32(Number(source.cell_explosion_damage_required));
  const power = f32(Number(source.cell_explosion_power));
  if (!Number.isFinite(required) || !Number.isFinite(power) || required < 0 || power < 0) return null;
  const range = Math.min(f32(required + .5), 100);
  const chance = f32(f32(world.random.next() / 32767) * range);
  if (chance < required) return null;
  const variation = f32(f32(f32(world.random.next() / 32767) * .5) + .75);
  const radius = Math.min(f32(Math.sqrt(f32(power * variation))), 150);
  return {type: 'explosion', x: index % world.width, y: Math.floor(index / world.width),
    materialId: material.id, config: {...source, never_cache: false, explosion_radius: radius}};
}

// Native ray helper 0x00656b10. It computes a cutoff and maximum per-cell
// damage before the explosion mutates any cells.
export function traceExplosionRay(world, {x, y, endX, endY, rayEnergy, maxDurability}) {
  const random = world.effectRandom ?? world.random;
  let dx = f32(endX - x), dy = f32(endY - y);
  const squareLength = squared(dx, dy);
  const length = f32(Math.sqrt(squareLength));
  const limit = Math.min(0x400000, Math.trunc(f32(squareLength + .5)));
  if (limit < 1 || length <= 0) return {cutoffSquared: 0, damage: 0};
  dx = f32(dx / length); dy = f32(dy / length);
  let px = f32(x), py = f32(y), oldX = Math.trunc(x), oldY = Math.trunc(y);
  let energy = Math.trunc(rayEnergy), damage = 0, distance = 0;
  for (let step = 1; distance < limit; step++) {
    px = f32(px + dx); py = f32(py + dy);
    distance = squared(f32(px - x), f32(py - y));
    if (step > 2048) break;
    const nextX = Math.trunc(px), nextY = Math.trunc(py);
    if (nextX === oldX && nextY === oldY) continue;
    oldX = nextX; oldY = nextY;
    const index = world._index(nextX, nextY);
    if (index < 0 || world.cells[index] === WALL) return {cutoffSquared: distance, damage};
    const material = world.materials[world.cells[index]];
    if (!blocksRay(material)) continue;
    const spent = Math.min(energy, world.hp[index]);
    energy -= spent;
    damage = Math.max(damage, spent);
    if (material.durability > maxDurability || energy === 0) {
      return {cutoffSquared: f32(distance + ((random.next() & 1) === 0 ? 1 : 0)), damage};
    }
  }
  return {cutoffSquared: distance, damage};
}

export function explosionRayTable(world, {x, y, config}) {
  const radius = f32(config.explosion_radius);
  const cutoffs = new Float32Array(360), damage = new Int32Array(360);
  for (let ray = 0; ray < 360; ray++) {
    const angle = f32(f32(ray / 360) * TAU);
    const endX = f32(x + f32(f32(Math.cos(angle)) * -radius));
    const endY = f32(y + f32(f32(Math.sin(angle)) * -radius));
    const result = traceExplosionRay(world, {x, y, endX, endY,
      rayEnergy: config.ray_energy, maxDurability: config.max_durability_to_destroy});
    cutoffs[ray] = result.cutoffSquared;
    damage[ray] = result.damage;
  }
  return {cutoffs, damage};
}

// Native 0x00657960 selects its 360-entry table with the rounded angle +179.
export function explosionRayIndex(dx, dy) {
  const length = f32(Math.sqrt(squared(f32(dx), f32(dy))));
  const angle = length > 0 ? f32(Math.atan2(f32(dy / length), f32(dx / length))) : 0;
  const degrees = angle * 57.29577951308232 + 179;
  return Math.max(0, Math.min(359, Math.floor(degrees + (degrees >= 0 ? .5 : -.5))));
}

function mayDestroy(material, config) {
  if (material.cell_type === 'liquid' && !nativeFlag(material.liquid_sand)) {
    return nativeFlag(config.hole_destroy_liquid);
  }
  if (material.cell_type === 'solid' && !nativeFlag(config.hole_destroy_physics_dynamic)
    && Number(material.solid_static_type) === 0) return false;
  return true;
}

function applyExplosion(world, effect) {
  const {config} = effect;
  const radius = Number(config.explosion_radius);
  if (!nativeFlag(config.hole_enabled) || !Number.isFinite(radius) || radius <= 0
    || !Number.isInteger(config.ray_energy) || config.ray_energy < 0
    || !Number.isInteger(config.max_durability_to_destroy)) return 0;
  const x = f32(effect.x), y = f32(effect.y), centerX = Math.trunc(x), centerY = Math.trunc(y);
  const rays = explosionRayTable(world, {...effect, x, y});
  const radiusSquared = f32(f32(radius) * f32(radius));
  const create = config.create_cell_material ? world.getMaterialId(config.create_cell_material) : EMPTY;
  const random = world.effectRandom ?? world.random;
  const amount = Math.trunc(radius);
  let changed = 0;
  for (let offsetY = -amount; offsetY <= amount; offsetY++) {
    for (let offsetX = -amount; offsetX <= amount; offsetX++) {
      const distance = offsetX * offsetX + offsetY * offsetY;
      if (distance > radiusSquared) continue;
      const index = world._index(centerX + offsetX, centerY + offsetY);
      if (index < 0 || world.cells[index] === WALL) continue;
      const ray = explosionRayIndex(offsetX, offsetY);
      if (distance > rays.cutoffs[ray]) continue;
      const id = world.cells[index];
      if (id === EMPTY) {
        if (create !== EMPTY && random.integer(100) < config.create_cell_probability) {
          world._replaceMaterial(index, create, {fresh: true, immediate: true});
          changed++;
        }
        continue;
      }
      if (distance >= radiusSquared) continue;
      const material = world.materials[id];
      if (!material || material.durability > config.max_durability_to_destroy) continue;
      if (material.cell_type === 'solid' && !nativeFlag(config.destroy_non_platform_solid_enabled)
        && material.platform_type !== 0) continue;
      world.hp[index] -= rays.damage[ray];
      if (world.hp[index] > 0 || !mayDestroy(material, config)) continue;
      const output = create !== EMPTY && random.integer(100) < config.create_cell_probability ? create : EMPTY;
      world._replaceMaterial(index, output, {fresh: true, immediate: true});
      changed++;
    }
  }
  return changed;
}

export function applyReactionEffects(world, effects) {
  let changed = 0;
  for (const effect of effects) {
    if (effect.type !== 'explosion') continue;
    if (world._inStep && !world._committing) {
      queueExplosion(world, effect);
      continue;
    }
    // Native radii above 60 can use a configured angular distortion. Current
    // material/reaction explosions stay below this threshold.
    if (Number(effect.config?.explosion_radius) > 60) {
      world.effects?.push({...effect, tick: world.tick, applied: false,
        unsupported: ['large-explosion-ray-variation']});
      continue;
    }
    const previousDepth = world._explosionDepth ?? 0;
    world._explosionDepth = previousDepth + 1;
    try { changed += applyExplosion(world, effect); }
    finally { world._explosionDepth = previousDepth; }
    world.effects?.push({...effect, tick: world.tick, applied: true});
  }
  return changed;
}
