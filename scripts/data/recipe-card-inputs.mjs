import {createHash} from 'node:crypto';
import {readFileSync, readdirSync} from 'node:fs';
import {basename, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {simulationMaterialRecords} from '../../src/liquids/materials.mjs';
import {CLIP_TICKS, recipeFrameDelays} from '../recipe-cards/timing.mjs';
import {recipeCells} from '../../src/reactions/experiment.js';
import {assignRecipeIds} from './recipe-ids.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = path => readFileSync(join(root, path));
const json = path => JSON.parse(read(path));
const hash = data => createHash('sha256').update(data).digest('hex');
const digest = values => hash(JSON.stringify(values));
const browserOnly = new Set(['hover.mjs', 'input.mjs', 'playback.mjs', 'scenes.mjs', 'url.mjs', 'view-data.mjs']);

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}

function sharedInputs(materials) {
  const files = ['src/reactions/experiment.js', 'public/liquids/mina.png'];
  for (const dir of ['src/liquids', 'scripts/recipe-cards', 'public/liquids/textures']) {
    for (const name of readdirSync(join(root, dir)).sort()) {
      if (dir === 'src/liquids' && browserOnly.has(name)) continue;
      if (dir === 'scripts/recipe-cards' && name === 'timing.mjs') continue;
      files.push(dir + '/' + name);
    }
  }
  const pixels = files.map(path => [path, hash(read(path))]);
  const packages = json('package-lock.json').packages;
  const codecs = ['sharp', '@img/sharp-linux-x64', '@img/sharp-libvips-linux-x64', '@napi-rs/canvas', '@napi-rs/canvas-linux-x64-gnu']
    .map(name => [name, packages['node_modules/' + name].integrity]);
  const physics = simulationMaterialRecords(materials).map(({image_local, wikipage, ...material}) => material);
  return digest([pixels, codecs, canonical(physics), CLIP_TICKS]);
}

// IDs already identify the full native rule. Only the icons and labels named in that rule enter its sidebar.
export function recipeInputKeys(materials, rules, ids, ledger) {
  const shared = sharedInputs(materials), byId = new Map(materials.map(m => [m.id, m]));
  const icons = new Map(), artwork = new Map();
  function sidebarKey(id) {
    if (!artwork.has(id)) {
      const material = byId.get(id);
      if (!material) throw new Error('Unknown recipe material: ' + id);
      const file = material.image_local || 'Material_' + id + '.png';
      if (basename(file) !== file) throw new Error('Invalid material icon: ' + file);
      if (!icons.has(file)) icons.set(file, hash(read('src/data/images/materials/' + file)));
      artwork.set(id, digest([material.name, icons.get(file)]));
    }
    return artwork.get(id);
  }
  return Object.fromEntries(rules.map((rule, i) => {
    const slots = [...recipeCells(rule, 'input'), ...recipeCells(rule, 'output')];
    return [ids[i], digest([shared, ledger[ids[i] - 1], ...slots.map(sidebarKey)])];
  }));
}

export function planRecipeInputs() {
  const materials = json('src/data/FULL_MATERIALS_FINAL.json'), rules = json('src/data/jsons/reactions.json');
  const ledger = json('src/data/reaction-share-ids.json');
  const ids = assignRecipeIds(rules, ledger, true);
  return recipeInputKeys(materials, rules, ids, ledger);
}

export function publishedInputs() {
  let snapshot;
  try {snapshot = json('src/data/recipe-card-inputs.json');}
  catch (error) {if (error.code !== 'ENOENT') throw error;}
  return {recipes: snapshot?.recipes ?? {}, frameDelays: snapshot?.frameDelays ?? []};
}

export function previewTiming(before) {
  const after = recipeFrameDelays(CLIP_TICKS + 1);
  const canRetime = before.length === after.length && before.every(ms => Number.isInteger(ms) && ms > 0);
  return {after, canRetime, current: canRetime && before.every((ms, i) => ms === after[i])};
}

export function validPublishedRecipe(entry) {
  return Array.isArray(entry) && /^[a-f0-9]{20}$/.test(entry[0]) && entry[1] === 1
    && Number.isInteger(entry[2]) && entry[2] >= 1 && entry[2] <= 24;
}

export function compareRecipeInputs(keys, publishedKeys, media) {
  const changed = Object.keys(keys).filter(id => keys[id] !== publishedKeys[id] || !validPublishedRecipe(media[id]));
  const previousIds = new Set([...Object.keys(media), ...Object.keys(publishedKeys)]);
  const removed = [...previousIds].filter(id => !Object.hasOwn(keys, id));
  return {changed, removed, reused: Object.keys(keys).length - changed.length};
}

export const recipePart = id => Math.floor((Number(id) - 1) / 100) + 1;
export const archiveName = part => 'recipes-' + String(part).padStart(3, '0') + '.zip';

export function publicationPlan() {
  const keys = planRecipeInputs(), before = publishedInputs(), media = json('src/data/recipe-card-media.json');
  const timing = previewTiming(before.frameDelays), snapshot = {frameDelays: timing.after, recipes: keys};
  const {changed, removed, reused} = compareRecipeInputs(keys, timing.canRetime ? before.recipes : {}, media);
  const changedIds = new Set(changed), parts = new Set(), restoreParts = new Set();
  const activeParts = new Set(Object.keys(keys).map(recipePart));
  for (const id of Object.keys(keys)) {
    if (changedIds.has(id) || !timing.current) parts.add(recipePart(id));
    if (!changedIds.has(id)) restoreParts.add(recipePart(id));
  }
  for (const id of removed) if (activeParts.has(recipePart(id))) parts.add(recipePart(id));
  const inputs = digest(snapshot);
  return {keys, snapshot, inputs, tag: 'recipe-media-inputs-' + inputs.slice(0,20), parts: [...parts].sort((a,b) => a-b),
    restoreParts, changed: changed.length, removed: removed.length, retimed: timing.current ? 0 : reused, reused: timing.current ? reused : 0};
}
