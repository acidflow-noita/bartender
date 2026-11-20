import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {assignRecipeIds} from '../scripts/data/recipe-ids.mjs';
import {compareRecipeInputs, recipeInputKeys, previewTiming} from '../scripts/data/recipe-card-inputs.mjs';

const catalog = JSON.parse(readFileSync(new URL('../src/data/FULL_MATERIALS_FINAL.json', import.meta.url)));
const pair = ['honey', 'water'].map(id => catalog.find(m => m.id === id));
const rules = pair.map(m => ({input_cell1: m.id, output_cell1: m.id}));
const ledger = [], ids = assignRecipeIds(rules, ledger, true);
const verified = ['a'.repeat(20), 1, 1];
const keysFor = materials => recipeInputKeys(materials, rules, ids, ledger);

test('a site-only data change skips cooking and a sidebar image changes only its own recipe', () => {
  const old = keysFor(pair), media = {1: verified, 2: verified};
  const website = keysFor(pair.map(m => ({...m, wikipage: 'A new URL', description: 'Site copy'})));
  assert.deepEqual(compareRecipeInputs(website, old, media), {changed: [], removed: [], reused: 2});
  const icon = keysFor([{...pair[0], image_local: pair[1].image_local}, pair[1]]);
  assert.deepEqual(compareRecipeInputs(icon, old, media), {changed: ['1'], removed: [], reused: 1});
  const physics = keysFor([{...pair[0], density: pair[0].density + 1}, pair[1]]);
  assert.deepEqual(compareRecipeInputs(physics, old, media).changed, ['1', '2']);
});

test('missing media, added recipes and retired recipe links trigger a catalog update', () => {
  assert.deepEqual(compareRecipeInputs({1:'a',2:'b',3:'c'}, {1:'a',2:'b',4:'d'}, {1:verified,4:verified}),
    {changed:['2','3'],removed:['4'],reused:1});
  assert.deepEqual(compareRecipeInputs({1:'a'}, {1:'a',2:'b'}, {1:verified,2:verified}),
    {changed:[],removed:['2'],reused:1});
});

test('a timing-only change can reuse every frame and a different clip length requires a render', () => {
  const fresh = previewTiming([]);
  assert.equal(fresh.canRetime, false);
  const old = fresh.after.map((_, i) => Math.round((i + 1) * 1000 / 60) - Math.round(i * 1000 / 60));
  assert.equal(previewTiming(old).canRetime, true);
  assert.equal(previewTiming(old).current, false);
  assert.equal(previewTiming(fresh.after).current, true);
  assert.equal(previewTiming(old.slice(1)).canRetime, false);
});
