import {prepareEnvironmentFlags, applyEnvironmentFlags} from './thermal.mjs';
import {nativeFlag} from './native-rules.mjs';
import {queueBlobMutation} from './mutations.mjs';

const EMPTY = 0;
const WALL = 65535;
const NONE = Object.freeze([]);
const f32 = Math.fround;
const TAU = f32(6.2831855);
const pairKey = (first, second) => first * 65536 + second;

const materialId = (ids, name) => name === 'air' ? EMPTY : ids.get(name);

// Reaction XML reader 0x00702464 stores float32(probability * 100) as int32.
export const reactionThreshold = probability => Math.trunc(f32(f32(probability) * 100));

/** Compile the expanded runtime table. Tag and inheritance expansion has
 * already happened in CellFactory and must not run a second time here. */
export function compileContactReactions(materials, sourceRules) {
  if (!Array.isArray(materials) || !Array.isArray(sourceRules)) {
    throw new TypeError('Provide the indexed material array and expanded reaction table.');
  }
  const ids = new Map();
  materials.forEach((material, index) => {
    if (material?.id) ids.set(material.id, index);
  });
  const pairs = new Map();
  const normalPairs = new Map();
  const fastPairs = new Map();
  const rules = [];
  const unavailable = [];
  const unsupported = [];
  const maxima = new Map();
  const add = (map, first, second, rule) => {
    const key = pairKey(first, second);
    let candidates = map.get(key);
    if (!candidates) { candidates = []; map.set(key, candidates); }
    candidates.push(rule);
  };
  sourceRules.forEach((source, ordinal) => {
    const inputs = [1, 2, 3].map(slot => source[`input_cell${slot}`] == null
      ? null : materialId(ids, source[`input_cell${slot}`]));
    const outputs = [1, 2, 3].map(slot => source[`output_cell${slot}`] == null
      ? null : materialId(ids, source[`output_cell${slot}`]));
    if (inputs.slice(0, 2).some(id => id == null) || [...inputs, ...outputs].some(id => id === undefined)) {
      unavailable.push(ordinal);
      return;
    }
    if (!Number.isFinite(source.reaction_rate) || source.reaction_rate < 0 || source.reaction_rate > 100) {
      throw new TypeError(`Invalid reaction probability at row ${ordinal}.`);
    }
    if (!['none', 'top', 'bottom', 'left', 'right'].includes(source.direction)) {
      throw new TypeError(`Invalid reaction direction at row ${ordinal}.`);
    }
    if (source.has_input_cell3 && inputs[2] === null) {
      throw new TypeError(`Missing third reactant at row ${ordinal}.`);
    }
    const rule = {...source, ordinal, inputs, outputs};
    rules.push(rule);
    if (source.convert_all) unsupported.push({ordinal, fields: ['convert_all']});
    add(pairs, inputs[0], inputs[1], rule);
    add(source.fast_reaction ? fastPairs : normalPairs, inputs[0], inputs[1], rule);
    const key = inputs[0] * 2 + Number(Boolean(source.fast_reaction));
    maxima.set(key, Math.max(maxima.get(key) ?? 0, reactionThreshold(source.reaction_rate)));
  });
  return {
    sourceCount: sourceRules.length,
    rules,
    unavailable,
    unsupported,
    candidates(first, second, {fast} = {}) {
      if (first === WALL || second === WALL) return NONE;
      const map = fast === undefined ? pairs : fast ? fastPairs : normalPairs;
      return map.get(pairKey(first, second)) ?? NONE;
    },
    maximum(material, id, fast) {
      const value = material?.[fast ? 'max_fast_reaction_probability' : 'max_reaction_probability'];
      return Number.isFinite(value) ? value : maxima.get(id * 2 + Number(Boolean(fast))) ?? 0;
    },
  };
}

export function inspectContactReactions(index) {
  return {
    sourceCount: index.sourceCount,
    resolvedCount: index.rules.length,
    unavailableCount: index.unavailable.length,
    unsupportedCount: index.unsupported.length,
    unsupported: index.unsupported,
    effects: {
      explosions: index.rules.filter(rule => rule.explosion_config).length,
      entities: index.rules.filter(rule => rule.entity_file).length,
      cosmeticParticles: index.rules.filter(rule => rule.cosmetic_particle).length,
    },
  };
}

function cellIndex(world, x, y) {
  return x < 0 || y < 0 || x >= world.width || y >= world.height ? -1 : y * world.width + x;
}

// 0x004abca0 uses the low two bits of the next 15-bit sample.
function randomNeighbor(world, index, reflect = false) {
  const x = index % world.width, y = Math.floor(index / world.width);
  let dx = 0, dy = 0;
  switch (world.random.next() & 3) {
    case 0: dx = -1; break;
    case 1: dx = 1; break;
    case 2: dy = -1; break;
    default: dy = 1;
  }
  const next = cellIndex(world, x + dx, y + dy);
  return next < 0 && reflect ? cellIndex(world, x - dx, y - dy) : next;
}

function replace(world, index, output) {
  if (index < 0 || world.cells[index] === WALL || world.cells[index] === output) return 0;
  world._replaceMaterial(index, output);
  return 1;
}

function sourceState(source, world, index, name) {
  return source?.[name] ?? source?.getState?.(name) ?? world[name]?.[index] ?? 0;
}

function replaceSource(world, index, output, source) {
  if (!source) return replace(world, index, output);
  if (source.id === output) return 0;
  if (typeof source.replace !== 'function') throw new TypeError('A detached reaction source needs a replacement callback.');
  return source.replace(output) === false ? 0 : 1;
}

// GridWorld::0x0071ab50. Restricted blobs trace through their input and
// converted output. A foreign material blocks that ray.
export function convertReactionBlob(world, center, input, output, radius, restricted = true) {
  if (center < 0 || center >= world.cells.length || world.cells[center] === WALL) return 0;
  if (world._inStep && !world._committing) {
    queueBlobMutation(world, center, input, output, radius, restricted);
    return 0;
  }
  const x = center % world.width, y = Math.floor(center / world.width);
  let changed = 0;
  if (!restricted) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy < radius * radius) {
          changed += replace(world, cellIndex(world, x + dx, y + dy), output);
        }
      }
    }
    return changed;
  }
  if (input === output || radius < 0 || world.cells[center] === EMPTY || world.cells[center] !== input) return 0;
  changed += replace(world, center, output);
  const rays = Math.trunc(f32(f32(radius * TAU) + .5));
  const increment = f32(TAU / rays);
  let angle = f32(0);
  for (let ray = 0; ray < rays; ray++, angle = f32(angle + increment)) {
    const dx = f32(Math.cos(angle)), dy = f32(Math.sin(angle));
    let px = f32(x), py = f32(y);
    for (let distance = 0; distance < radius; distance++) {
      px = f32(px + dx); py = f32(py + dy);
      const next = cellIndex(world, Math.trunc(px), Math.trunc(py));
      if (next < 0 || world.cells[next] === WALL) break;
      if (world.cells[next] === input) changed += replace(world, next, output);
      else if (world.cells[next] !== output) break;
    }
  }
  return changed;
}

function directionMatches(world, first, second, direction) {
  const dx = second % world.width - first % world.width;
  const dy = Math.floor(second / world.width) - Math.floor(first / world.width);
  if (Math.abs(dx) + Math.abs(dy) !== 1) return false;
  return direction === 'none' || (dx < 0 ? direction === 'left' : dx > 0
    ? direction === 'right' : dy < 0 ? direction === 'top' : direction === 'bottom');
}

/** Apply one direct CellFactory table lookup. The caller may supply the same
 * roll it used to screen the source material and choose this contact. */
export function applyContactReaction(index, world, first, second, {fast = false, roll, source} = {}) {
  if (first < 0 || second < 0 || first >= world.cells.length || second >= world.cells.length) return null;
  const firstId = source?.id ?? world.cells[first], secondId = world.cells[second];
  if (firstId === EMPTY || firstId === WALL || secondId === WALL) return null;
  const candidates = index.candidates(firstId, secondId, {fast});
  if (!candidates.length) return null;
  const maximum = index.maximum(world.materials[firstId], firstId, fast);
  if (fast && maximum <= 0) return null;
  roll ??= world.random.integer(10000);
  if (roll > maximum) return null;
  // 0x00706cc0 and 0x00706d30 use this same sample to select one table row.
  const rule = candidates[roll % candidates.length];
  if (roll > reactionThreshold(rule.reaction_rate) || rule.convert_all
    || !directionMatches(world, first, second, rule.direction)
    || (rule.req_lifetime > 0 && sourceState(source, world, first, 'age') < rule.req_lifetime)) return null;
  let third = -1;
  if (rule.has_input_cell3) {
    third = randomNeighbor(world, first);
    if (third === second) {
      third = cellIndex(world, 2 * (first % world.width) - second % world.width,
        2 * Math.floor(first / world.width) - Math.floor(second / world.width));
    }
    if (third < 0 || world.cells[third] !== rule.inputs[2]) return null;
  }
  let changed = 0;
  // 0x0070ebf0 applies the third output, second output, then first output.
  if (third >= 0 && rule.outputs[2] !== null) changed += replace(world, third, rule.outputs[2]);
  if (rule.blob_radius2) {
    changed += convertReactionBlob(world, second, rule.inputs[1], rule.outputs[1],
      rule.blob_radius2, rule.blob_restrict_to_input_material2);
  } else changed += replace(world, second, rule.outputs[1]);
  if (rule.blob_radius1) {
    changed += convertReactionBlob(world, first, rule.inputs[0], rule.outputs[0],
      rule.blob_radius1, rule.blob_restrict_to_input_material1);
  } else {
    let output = rule.outputs[0];
    if (rule.destroy_horizontally_lonely_pixels) {
      const x = first % world.width, y = Math.floor(first / world.width);
      const left = cellIndex(world, x - 1, y), right = cellIndex(world, x + 1, y);
      if (left >= 0 && right >= 0 && world.cells[left] === EMPTY && world.cells[right] === EMPTY) output = EMPTY;
    }
    changed += replaceSource(world, first, output, source);
  }
  const effects = [];
  if (rule.explosion_config) {
    const config = rule.explosion_config;
    const probability = Number(config.cell_explosion_probability);
    if (f32(world.random.next() / 32767) < probability) {
      const minimum = Number(config.cell_explosion_radius_min);
      const maximum = Number(config.cell_explosion_radius_max);
      const radius = f32(f32(f32(world.random.next() / 32767) * f32(maximum - minimum)) + minimum);
      effects.push({type: 'explosion', x: first % world.width, y: Math.floor(first / world.width),
        config: {...config, explosion_radius: radius, never_cache: false}, ruleIndex: rule.ordinal});
    }
  }
  return {ruleIndex: rule.ordinal, changed, effects};
}

// Burning callback 0x0070f160 substitutes fire for slot one. This path uses
// a separate table-selection draw and a strict probability comparison.
function stepBurningContact(index, world, first, source) {
  const fireId = world.getMaterialId('fire');
  if (!fireId) return null;
  const maximum = index.maximum(world.materials[fireId], fireId, false);
  if (world.random.integer(10000) > maximum) return null;
  const second = randomNeighbor(world, first, true);
  if (second < 0 || world.cells[second] === EMPTY || world.cells[second] === WALL) return null;
  const selector = world.random.integer(1024);
  const candidates = index.candidates(fireId, world.cells[second], {fast: false});
  if (!candidates.length) return null;
  const rule = candidates[selector % candidates.length];
  if (world.random.integer(maximum) >= reactionThreshold(rule.reaction_rate)) return null;
  let changed = 0;
  if (rule.blob_radius2) {
    changed += convertReactionBlob(world, second, rule.inputs[1], rule.outputs[1],
      rule.blob_radius2, rule.blob_restrict_to_input_material2);
  } else changed += replace(world, second, rule.outputs[1]);
  if (rule.blob_radius1) {
    changed += convertReactionBlob(world, first, rule.inputs[0], rule.outputs[0],
      rule.blob_radius1, rule.blob_restrict_to_input_material1);
  } else if (rule.outputs[0] !== fireId) changed += replaceSource(world, first, rule.outputs[0], source);
  return {ruleIndex: rule.ordinal, changed, effects: []};
}

// Normal contact path 0x0070e8c0 and fast path 0x0070eaf0. The world owns
// their update cadence and runs temperature conversion before normal contact.
export function stepContactReactions(index, world, first, {fast = false, source} = {}) {
  const id = source?.id ?? world.cells[first];
  if (id === EMPTY || id === WALL) return null;
  const material = world.materials[id];
  if (!fast && (sourceState(source, world, first, 'burning') || material.cell_type === 'fire')
    && !(nativeFlag(material.on_fire) && world.random.integer(100) < 50)) {
    return stepBurningContact(index, world, first, source);
  }
  const maximum = index.maximum(material, id, fast);
  if (fast && maximum <= 0) return null;
  const roll = world.random.integer(10000);
  const flags = fast ? null : prepareEnvironmentFlags(world, first, material, source);
  const thermal = flags && (flags.coldTarget || flags.warmTarget);
  if (!thermal && roll > maximum) return null;
  const second = randomNeighbor(world, first);
  if (second < 0 || world.cells[second] === WALL) return null;
  if (thermal) {
    return applyEnvironmentFlags(world, first, world.materials[id], flags, second, source)
      ? {ruleIndex: null, changed: 1, effects: []} : null;
  }
  return applyContactReaction(index, world, first, second, {fast, roll, source});
}
