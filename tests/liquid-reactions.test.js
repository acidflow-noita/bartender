import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileContactReactions, inspectContactReactions, applyContactReaction,
  stepContactReactions, convertReactionBlob, reactionThreshold} from '../src/liquids/reactions.mjs';
import {LiquidRandom} from '../src/liquids/native-rules.mjs';
import {queueMaterialCreation, flushMaterialCreations} from '../src/liquids/mutations.mjs';

const read = file => JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8'));
const materials = [null, ...read('../src/data/FULL_MATERIALS_FINAL.json').filter(material => material.id !== 'air')];
const reactions = read('../src/data/jsons/reactions.json');
const ids = new Map(materials.map((material, index) => [material?.id, index]));
ids.set('air', 0);
const table = compileContactReactions(materials, reactions);

test('the complete runtime reaction table resolves against the material catalog', () => {
  assert.equal(table.rules.length, reactions.length);
  assert.deepEqual(table.unavailable, []);
  for (const rule of table.rules) {
    const {ordinal, inputs, outputs, ...source} = rule;
    assert.deepEqual(source, reactions[ordinal]);
    for (const id of [...inputs, ...outputs]) {
      assert.ok(id === null || id === 0 || materials[id]);
    }
  }
});

test('contact lookup preserves the native first-slot owner', () => {
  const forward = table.candidates(ids.get('lava'), ids.get('water'));
  const backward = table.candidates(ids.get('water'), ids.get('lava'));
  const rule = forward.find(rule => rule.input_cell1 === 'lava' && rule.input_cell2 === 'water');
  assert.ok(rule);
  assert.deepEqual(backward, []);
  assert.deepEqual(rule.outputs, [ids.get('rock_static'), ids.get('steam'), null]);
  assert.equal(rule.reaction_rate, 80);
  assert.equal(rule.blob_radius1, 6);
  assert.equal(rule.blob_radius2, 3);
  assert.equal(rule.blob_restrict_to_input_material1, true);
  assert.equal(rule.blob_restrict_to_input_material2, true);
});

test('acid corrosion uses expanded target materials and retains fast reaction flags', () => {
  const rules = table.candidates(ids.get('acid'), ids.get('wood_static'));
  const rule = rules.find(rule => rule.input_cell1 === 'acid');
  assert.equal(rule.fast_reaction, true);
  assert.equal(rule.reaction_rate, 50);
  assert.deepEqual(rule.outputs, [ids.get('acid'), ids.get('acid_gas'), null]);
  assert.equal(rule.blob_radius1, 2);
  assert.equal(rule.blob_radius2, 2);
  assert.deepEqual(table.candidates(ids.get('acid'), 65535), []);
});

test('empty-space contacts map to cell zero and keep directional constraints', () => {
  const rule = table.candidates(ids.get('rock_static'), 0)
    .find(rule => rule.input_cell1 === 'rock_static' && rule.input_cell2 === 'air');
  assert.equal(rule.direction, 'top');
  assert.equal(rule.reaction_rate, 1);
  assert.deepEqual(rule.inputs, [ids.get('rock_static'), 0, null]);
});

test('third reactants and omitted outputs retain distinct meanings', () => {
  const rule = table.candidates(ids.get('cement'), ids.get('fire'))
    .find(rule => rule.input_cell1 === 'cement');
  assert.equal(rule.has_input_cell3, true);
  assert.equal(rule.inputs[2], ids.get('cement'));
  assert.equal(rule.outputs[2], null);
  assert.equal(rule.req_lifetime, 50);
});

test('oil ignition is not invented as a contact-table reaction', () => {
  assert.deepEqual(table.candidates(ids.get('oil'), ids.get('fire')), []);
  const oil = materials[ids.get('oil')];
  assert.equal(oil.burnable, true);
  assert.equal(oil.autoignition_temperature, 10);
});

test('a restricted material catalog reports rules it cannot execute', () => {
  const table = compileContactReactions([null, {id: 'water'}], reactions);
  assert.ok(table.unavailable.length > 0);
  for (const rule of table.rules) {
    assert.ok([...rule.inputs, ...rule.outputs].every(id => id === null || id === 0 || id === 1));
  }
});

function world(samples = [], width = 15, height = 13) {
  let cursor = 0;
  return {
    width, height, materials, cells: new Uint16Array(width * height),
    age: new Int32Array(width * height), changed: [],
    getMaterialId(name) { return ids.get(name) ?? 0; },
    _index(x, y) { return x < 0 || y < 0 || x >= width || y >= height ? -1 : y * width + x; },
    random: {
      next() { return samples[cursor++] ?? 0; },
      integer(maximum) { return this.next() % (maximum + 1); },
      get samplesUsed() { return cursor; },
    },
    put(x, y, material, age = 0) {
      const index = y * width + x;
      this.cells[index] = typeof material === 'number' ? material : ids.get(material);
      this.age[index] = age;
      return index;
    },
    _replaceMaterial(index, material) {
      this.cells[index] = material;
      this.age[index] = 0;
      this.changed.push(index);
    },
  };
}

const base = reactions.find(rule => rule.input_cell1 === 'water' && !rule.has_input_cell3);
function rule(overrides = {}) {
  return {...base, input_cell1: 'water', input_cell2: 'oil', output_cell1: 'steam', output_cell2: 'smoke',
    input_cell3: null, output_cell3: null, reaction_rate: 100, fast_reaction: false,
    has_input_cell3: false, req_lifetime: 0, blob_radius1: 0, blob_radius2: 0,
    blob_restrict_to_input_material1: true, blob_restrict_to_input_material2: true,
    direction: 'none', convert_all: false, destroy_horizontally_lonely_pixels: false,
    explosion_config: null, cosmetic_particle: null, entity_file: null, ...overrides};
}

test('native inclusive hundredth-percent threshold preserves the boundary sample', () => {
  const index = compileContactReactions(materials, [rule({reaction_rate: 80})]);
  for (const [roll, expected] of [[8000, true], [8001, false]]) {
    const w = world(), first = w.put(5, 5, 'water'), second = w.put(6, 5, 'oil');
    assert.equal(Boolean(applyContactReaction(index, w, first, second, {roll})), expected);
    assert.equal(w.cells[first], ids.get(expected ? 'steam' : 'water'));
  }
  const zero = compileContactReactions(materials, [rule({reaction_rate: 0})]);
  const w = world(), first = w.put(5, 5, 'water'), second = w.put(6, 5, 'oil');
  assert.ok(applyContactReaction(zero, w, first, second, {roll: 0}));
});

test('one shared sample selects one candidate without falling through failed rules', () => {
  const index = compileContactReactions(materials, [rule(), rule({reaction_rate: 1})]);
  const w = world(), first = w.put(5, 5, 'water'), second = w.put(6, 5, 'oil');
  assert.equal(applyContactReaction(index, w, first, second, {roll: 201}), null);
  assert.equal(w.cells[first], ids.get('water'));
  assert.equal(applyContactReaction(index, w, first, second, {roll: 200}).ruleIndex, 0);
});

test('normal and fast tables remain separate and source screening precedes neighbor sampling', () => {
  const index = compileContactReactions(materials, [rule(), rule({fast_reaction: true})]);
  const w = world([10001, 1]), first = w.put(5, 5, 'water');
  w.put(6, 5, 'oil');
  assert.equal(stepContactReactions(index, w, first, {fast: true}), null);
  assert.equal(w.random.samplesUsed, 0);
  const acid = world([5001, 1]), source = acid.put(5, 5, 'acid');
  acid.put(6, 5, 'wood_static');
  assert.equal(stepContactReactions(table, acid, source, {fast: true}), null);
  assert.equal(acid.random.samplesUsed, 1);
  const allowed = world([5000, 1]), a = allowed.put(5, 5, 'acid');
  const b = allowed.put(6, 5, 'wood_static');
  assert.ok(stepContactReactions(table, allowed, a, {fast: true}));
  assert.equal(allowed.cells[b], ids.get('acid_gas'));
  assert.equal(allowed.random.samplesUsed, 2);
});

test('direction is the neighbor position relative to the first reactant', () => {
  const index = compileContactReactions(materials, [rule({direction: 'top'})]);
  const w = world(), first = w.put(5, 5, 'water'), above = w.put(5, 4, 'oil'), right = w.put(6, 5, 'oil');
  assert.equal(applyContactReaction(index, w, first, right, {roll: 0}), null);
  assert.ok(applyContactReaction(index, w, first, above, {roll: 0}));
  assert.equal(w.cells[right], ids.get('oil'));
});

test('third-reactant sampling reflects a repeated second contact and retains omitted output', () => {
  const index = compileContactReactions(materials, [rule({has_input_cell3: true, input_cell3: 'sand'})]);
  const w = world([1]), first = w.put(5, 5, 'water'), second = w.put(6, 5, 'oil'), third = w.put(4, 5, 'sand', 90);
  assert.ok(applyContactReaction(index, w, first, second, {roll: 0}));
  assert.equal(w.cells[third], ids.get('sand'));
  assert.equal(w.age[third], 90);
  const missed = world([2]), a = missed.put(5, 5, 'water'), b = missed.put(6, 5, 'oil');
  missed.put(4, 5, 'sand');
  assert.equal(applyContactReaction(index, missed, a, b, {roll: 0}), null);
});

test('lifetime gates the first reactant and outputs apply in third-second-first order', () => {
  const index = compileContactReactions(materials, [rule({req_lifetime: 50, has_input_cell3: true,
    input_cell3: 'sand', output_cell3: 'air'})]);
  const w = world([0]), first = w.put(5, 5, 'water', 49), second = w.put(6, 5, 'oil'), third = w.put(4, 5, 'sand');
  assert.equal(applyContactReaction(index, w, first, second, {roll: 0}), null);
  assert.equal(w.random.samplesUsed, 0);
  w.age[first] = 50;
  assert.ok(applyContactReaction(index, w, first, second, {roll: 0}));
  assert.deepEqual(w.changed, [third, second, first]);
  assert.equal(w.cells[third], 0);
});

test('lonely-pixel cleanup checks horizontal occupancy after the second conversion', () => {
  const index = compileContactReactions(materials, [rule({output_cell2: 'air', destroy_horizontally_lonely_pixels: true})]);
  const w = world(), first = w.put(5, 5, 'water'), second = w.put(6, 5, 'oil');
  assert.ok(applyContactReaction(index, w, first, second, {roll: 0}));
  assert.equal(w.cells[first], 0);
  const supported = world(), a = supported.put(5, 5, 'water'), b = supported.put(6, 5, 'oil');
  supported.put(4, 5, 'rock_static');
  assert.ok(applyContactReaction(index, supported, a, b, {roll: 0}));
  assert.equal(supported.cells[a], ids.get('steam'));
});

test('restricted reaction blobs stop at foreign cells and cross their own converted output', () => {
  const w = world(), center = w.put(5, 5, 'lava');
  w.put(6, 5, 'rock_static');
  const within = w.put(7, 5, 'lava');
  const barrier = w.put(8, 5, 65535);
  const beyond = w.put(9, 5, 'lava');
  convertReactionBlob(w, center, ids.get('lava'), ids.get('rock_static'), 5);
  assert.equal(w.cells[within], ids.get('rock_static'));
  assert.equal(w.cells[barrier], 65535);
  assert.equal(w.cells[beyond], ids.get('lava'));
  const empty = world(), position = empty.put(5, 5, 0);
  assert.equal(convertReactionBlob(empty, position, 0, ids.get('fire'), 2), 0);
});

test('actual water-lava contact converts both local materials without crossing walls', () => {
  const w = world(), lava = w.put(5, 5, 'lava'), water = w.put(6, 5, 'water');
  const otherWater = w.put(7, 5, 'water'), wall = w.put(8, 5, 65535), isolated = w.put(9, 5, 'water');
  const result = applyContactReaction(table, w, lava, water, {roll: 500});
  assert.ok(result);
  assert.equal(w.cells[lava], ids.get('rock_static'));
  assert.equal(w.cells[water], ids.get('steam'));
  assert.equal(w.cells[otherWater], ids.get('steam'));
  assert.equal(w.cells[wall], 65535);
  assert.equal(w.cells[isolated], ids.get('water'));
});

test('reaction explosion events preserve source settings and native radius sampling', () => {
  const source = rule({explosion_config: {cell_explosion_probability: 1.1,
    cell_explosion_radius_min: 4, cell_explosion_radius_max: 8, explosion_radius: 20, never_cache: true}});
  const original = structuredClone(source);
  const index = compileContactReactions(materials, [source]);
  const w = world([0, 32767]), first = w.put(5, 5, 'water'), second = w.put(6, 5, 'oil');
  const result = applyContactReaction(index, w, first, second, {roll: 0});
  assert.equal(result.effects[0].config.explosion_radius, 8);
  assert.equal(result.effects[0].config.never_cache, false);
  assert.equal(result.effects[0].x, 5);
  assert.equal(result.effects[0].y, 5);
  assert.deepEqual(source, original);
});

test('coverage exposes unsupported future convert-all rules and preserved entity effects', () => {
  const index = compileContactReactions(materials, [rule({convert_all: true, entity_file: 'example.xml'})]);
  const report = inspectContactReactions(index);
  assert.equal(report.unsupportedCount, 1);
  assert.deepEqual(report.unsupported, [{ordinal: 0, fields: ['convert_all']}]);
  assert.equal(report.effects.entities, 1);
  const w = world(), first = w.put(5, 5, 'water'), second = w.put(6, 5, 'oil');
  assert.equal(applyContactReaction(index, w, first, second, {roll: 0}), null);
  assert.equal(inspectContactReactions(table).unsupportedCount, 0);
});

test('normal contact samples thermal gates before its neighbor and outside the material reaction maximum', () => {
  const w = world([10000, 0, 1]), first = w.put(5, 5, 'water');
  w.materials = [...materials];
  w.materials[ids.get('water')] = {...materials[ids.get('water')], max_reaction_probability: 0};
  w.cold = new Uint8Array(w.cells.length); w.cold[first] = 1;
  w._motion = new Uint8Array(w.cells.length); w._motion[first] = 3;
  w.vertical = new Float32Array(w.cells.length);
  const result = stepContactReactions(table, w, first);
  assert.ok(result);
  assert.equal(result.ruleIndex, null);
  assert.equal(w.cells[first], ids.get(materials[ids.get('water')].cold_freezes_to_material_name));
  assert.equal(w.random.samplesUsed, 3);
});

test('a selected cold branch blocked by liquid does not fall back to an ordinary reaction', () => {
  const index = compileContactReactions(materials, [rule()]);
  const w = world([0, 0, 1]), first = w.put(5, 5, 'water'), second = w.put(6, 5, 'oil');
  w.cold = new Uint8Array(w.cells.length); w.cold[first] = 1;
  w._motion = new Uint8Array(w.cells.length); w._motion[first] = 3;
  w.vertical = new Float32Array(w.cells.length);
  assert.equal(stepContactReactions(index, w, first), null);
  assert.equal(w.cells[first], ids.get('water'));
  assert.equal(w.cells[second], ids.get('oil'));
});

test('burning oil uses fire contact rules while retaining the original oil cell', () => {
  const w = world([0, 1, 0, 0]), first = w.put(5, 5, 'oil'), second = w.put(6, 5, 'water');
  w.burning = new Uint8Array(w.cells.length); w.burning[first] = 1;
  const result = stepContactReactions(table, w, first);
  assert.ok(result);
  assert.equal(w.cells[first], ids.get('oil'));
  assert.equal(w.cells[second], ids.get('steam'));
  assert.equal(w.random.samplesUsed, 4);
});

test('burning contact uses a strict threshold and samples only occupied neighbors', () => {
  for (const [roll, reacts] of [[1999, true], [2000, false]]) {
    const w = world([0, 1, 0, roll]), first = w.put(5, 5, 'oil');
    w.put(6, 5, 'water');
    w.burning = new Uint8Array(w.cells.length); w.burning[first] = 1;
    assert.equal(Boolean(stepContactReactions(table, w, first)), reacts);
  }
  const w = world([0, 1]), first = w.put(5, 5, 'oil');
  w.burning = new Uint8Array(w.cells.length); w.burning[first] = 1;
  assert.equal(stepContactReactions(table, w, first), null);
  assert.equal(w.random.samplesUsed, 2);
});

test('native on-fire material flag chooses between ordinary and burning contact paths', () => {
  const ordinary = world([0, 2000, 1]), first = ordinary.put(5, 5, 'fire'), second = ordinary.put(6, 5, 'water');
  assert.ok(stepContactReactions(table, ordinary, first));
  assert.equal(ordinary.cells[second], ids.get('steam'));
  assert.equal(ordinary.random.samplesUsed, 3);
  const burning = world([50, 0, 1, 0, 2000]), a = burning.put(5, 5, 'fire'), b = burning.put(6, 5, 'water');
  assert.equal(stepContactReactions(table, burning, a), null);
  assert.equal(burning.cells[b], ids.get('water'));
  assert.equal(burning.random.samplesUsed, 5);
});

test('burning neighbor sampling reflects at a world edge', () => {
  const w = world([0, 0, 0, 0]), first = w.put(0, 5, 'oil'), second = w.put(1, 5, 'water');
  w.burning = new Uint8Array(w.cells.length); w.burning[first] = 1;
  assert.ok(stepContactReactions(table, w, first));
  assert.equal(w.cells[second], ids.get('steam'));
});

test('reaction probability scaling matches the original XML-reader instructions', () => {
  const fixture = read('./fixtures/noita-poison-reactions.json');
  for (const row of fixture.parser) assert.equal(reactionThreshold(row.probability), row.threshold,
    `probability ${row.probability}`);
});

test('reaction minimum ages match native gates, including negative birth ages', () => {
  const fixture = read('./fixtures/noita-poison-reactions.json');
  for (const row of fixture.lifetime_gate) {
    const index = compileContactReactions(materials, [rule({req_lifetime: row.required})]);
    const w = world(), first = w.put(5, 5, 'water', row.age), second = w.put(6, 5, 'oil');
    assert.equal(Boolean(applyContactReaction(index, w, first, second, {roll: 0})), row.accepted, JSON.stringify(row));
  }
});

test('poison contact acceptance and RNG match the original fast consumer with real virtual methods', () => {
  const fixture = read('./fixtures/noita-poison-reactions.json');
  for (const row of fixture.consumer) {
    const w = world(), first = w.put(5, 5, 'poison');
    w.random = new LiquidRandom(row.seed);
    [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([dx, dy], bit) => {
      w.put(5 + dx, 5 + dy, row.air_mask & (1 << bit) ? 0 : 'poison');
    });
    const result = stepContactReactions(table, w, first, {fast: true});
    assert.equal(Boolean(result), row.accepted, JSON.stringify(row));
    // This fixture stops before native replacement. The test world likewise
    // records material replacement without constructor RNG.
    assert.equal(w.random.state, row.final_state, JSON.stringify(row));
    assert.equal(w.cells[first], ids.get(row.accepted ? 'poison_gas' : 'poison'));
  }
});

test('a detached poison source still queues gas while its physical slot stays empty', () => {
  const w = world(), first = w._index(5, 5);
  w.random = new LiquidRandom(42);
  const source = {id: ids.get('poison'), age: 50, burning: false,
    replace(output) { return queueMaterialCreation(w, first, output); }};
  const result = stepContactReactions(table, w, first, {fast: true, source});
  assert.ok(result);
  assert.equal(source.id, ids.get('poison'));
  assert.equal(w.cells[first], 0);
  assert.equal(w.materialMutations.creations[0].material, ids.get('poison_gas'));
  flushMaterialCreations(w);
  assert.equal(w.cells[first], ids.get('poison_gas'));
  assert.equal(source.id, ids.get('poison'));
});

test('detached source lifetime and same-class conversion use the object view, not empty-slot state', () => {
  const index = compileContactReactions(materials, [rule({req_lifetime: 10, output_cell1: 'blood'})]);
  const w = world(), first = w._index(5, 5), second = w.put(6, 5, 'oil');
  w.age[first] = 999;
  const source = {id: ids.get('water'), age: 9, burning: false, replace(output) { this.id = output; }};
  assert.equal(applyContactReaction(index, w, first, second, {roll: 0, source}), null);
  source.age = 10;
  assert.ok(applyContactReaction(index, w, first, second, {roll: 0, source}));
  assert.equal(source.id, ids.get('blood'));
  assert.equal(w.cells[first], 0);
});

test('a detached burning source retains fire contact behavior without restoring it into the grid', () => {
  const w = world([0, 1, 0, 0]), first = w._index(5, 5), second = w.put(6, 5, 'water');
  const source = {id: ids.get('oil'), burning: true, replace(output) { this.id = output; }};
  assert.ok(stepContactReactions(table, w, first, {source}));
  assert.equal(w.cells[first], 0);
  assert.equal(source.id, ids.get('oil'));
  assert.equal(w.cells[second], ids.get('steam'));
});
