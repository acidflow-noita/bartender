// Mirrors the material textures of the image CDN (the ones the graph displays) into
// src/data/images/materials-cdn/Material_<id>.png.
//
// Why: the graph export embeds these copies, because the CDN sends no CORS headers and the page
// cannot read its images. They are kept apart from src/data/images/materials, which holds older
// versions of some textures (half transparent liquids, for example) and is left untouched.
//
// Usage: node scripts/sync-material-images.mjs [--check]
//   --check  only report differences, write nothing (exit code 1 if any file is outdated)

import {readFileSync, writeFileSync, existsSync, mkdirSync} from 'node:fs';

const CDN = 'https://noita-bartender-images.acidflow.stream/images/materials';
const dir = new URL('../src/data/images/materials-cdn/', import.meta.url);
const check = process.argv.includes('--check');

const readJson = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const ids = new Set(readJson('../src/data/FULL_MATERIALS_FINAL.json').map(material => material.id));
for (const path of ['../src/data/reactions_all_mods.json', '../src/data/apotheosis/reactions_apotheosis.json', '../src/data/apotheosis/reactions_apotheosis_secret.json']) {
  for (const reaction of readJson(path)) {
    for (const key of ['reagent1', 'reagent2', 'reagent3', 'product1', 'product2', 'product3']) {
      const id = reaction[key];
      if (id && !id.startsWith('[')) ids.add(id); // [bracketed] ids are tags, not materials
    }
  }
}

if (!check) mkdirSync(dir, {recursive: true});
const result = {unchanged: 0, updated: [], added: [], unavailable: []};

async function sync(id) {
  const name = `Material_${id}.png`;
  let response;
  try {
    response = await fetch(`${CDN}/${encodeURIComponent(name)}`);
  } catch (error) {
    result.unavailable.push(`${name} (${error.message})`);
    return;
  }
  if (!response.ok) {
    result.unavailable.push(`${name} (HTTP ${response.status})`);
    return;
  }
  const remote = Buffer.from(await response.arrayBuffer());
  const file = new URL(name, dir);
  const exists = existsSync(file);
  if (exists && readFileSync(file).equals(remote)) {
    result.unchanged++;
    return;
  }
  (exists ? result.updated : result.added).push(name);
  if (!check) writeFileSync(file, remote);
}

const queue = [...ids];
await Promise.all(Array.from({length: 8}, async () => {
  while (queue.length) await sync(queue.pop());
}));

const verb = check ? 'outdated' : 'updated';
console.log(`${ids.size} materials: ${result.unchanged} unchanged, ${result.updated.length} ${verb}, ${result.added.length} ${check ? 'missing' : 'added'}, ${result.unavailable.length} not on the CDN`);
if (result.unavailable.length) console.log(`Not on the CDN:\n  ${result.unavailable.sort().join('\n  ')}`);
if (check && (result.updated.length || result.added.length)) process.exitCode = 1;
