import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, existsSync, rmSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {fetchCargo} from '../scripts/data/wiki.mjs';
import {refreshData} from '../scripts/refresh-data.mjs';
import {groupTagMaterials} from '../src/data/jsons/tag_files_maker.js';
import {processRawResponses, buildMaterialData} from '../src/data/FULL_MATERIALS_FINAL.json.js';
import {buildCandidate, datasetDiff} from '../scripts/build-data-candidate.mjs';
import {loadSources, dataRoot} from '../scripts/data/sources.mjs';
import {readCatalog} from '../scripts/data/catalog.mjs';
import {refreshSpellImages} from '../src/data/SPELLS_DIRECT_URLS.json.js';
import {refreshMaterialImages} from '../src/data/MATERIALS_DIRECT_URLS.json.js';

test('wiki acquisition paginates beyond 500 records and retries transient errors', async () => {
  const rows = Array.from({length: 1201}, (_, id) => ({id: String(id)}));
  const offsets = []; let attempts = 0;
  const result = await fetchCargo({tables: 'Materials'}, {wait: async () => {}, fetcher: async url => {
    if (attempts++ === 0) return {ok: false, status: 503};
    const offset = Number(url.searchParams.get('offset')); offsets.push(offset);
    return {ok: true, json: async () => ({cargoquery: rows.slice(offset, offset + 500).map(title => ({title}))})};
  }});
  assert.deepEqual(result, rows); assert.deepEqual(offsets, [0, 500, 1000]);
});

test('repeated pages and malformed responses fail instead of silently truncating data', async () => {
  await assert.rejects(fetchCargo({}, {pageSize: 1, fetcher: async () => ({ok: true, json: async () => ({cargoquery: [{title: {id: 'water'}}]})})}), /repeated a page/);
  await assert.rejects(fetchCargo({}, {retries: 0, fetcher: async () => ({ok: true, json: async () => ({error: {info: 'API failure'}})})}), /API failure/);
});

test('failed refreshes never promote an incomplete snapshot', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'bartender-refresh-'));
  t.after(() => rmSync(directory, {recursive: true, force: true}));
  const output = join(directory, 'snapshot');
  await assert.rejects(refreshData({output, fetcher: async () => ({ok: true, json: async () => ({cargoquery: []})})}), /Empty wiki/);
  assert.equal(existsSync(output), false);
});

test('tag generator reads actual id fields, preserves order and rejects invalid paths', () => {
  assert.deepEqual(groupTagMaterials([{id: 'water', tag: 'liquid'}, {id: 'oil', tag: 'liquid'}, {id: 'water', tag: 'liquid'}]), {liquid: ['water', 'oil']});
  assert.throws(() => groupTagMaterials([{material_id: 'water', tag: 'liquid'}]), /Invalid/);
  assert.throws(() => groupTagMaterials([{id: 'water', tag: '../escape'}]), /Invalid/);
});

test('material generator can run offline without modifying its inputs and rejects corrupt image snapshots', () => {
  const input = {id: 'water', cell_type: 'liquid', hp: 0, tags: ['[liquid]']};
  const [row] = buildMaterialData({technicalMaterials: [input], materialsXml: '<Materials><CellData name="water" hp="12"/></Materials>',
    wikiMaterials: [{id: 'water', name: 'Water', type: 'Liquid', image: 'Water.png'}], urlMap: {water: {url: 'https://example.test/water.png', local: 'Water.png'}}});
  assert.equal(row.hardness, 0); assert.equal(row.hp, 12); assert.equal(row.image_local, 'Water.png');
  assert.equal(input.hp, 0); assert.equal(input.hardness, undefined);
  assert.throws(() => processRawResponses('{broken}'), SyntaxError);
});

test('spell image refresh preserves the complete game-derived catalog and writes only to its output directory', t => {
  const directory=mkdtempSync(join(tmpdir(),'bartender-spell-images-'));
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const outputRoot=pathToFileURL(directory+'/');
  const before=readFileSync(new URL('FULL_SPELLS_FINAL.json',dataRoot),'utf8');
  const result=refreshSpellImages({outputRoot});
  assert.deepEqual(result.urls,JSON.parse(readFileSync(new URL('SPELLS_DIRECT_URLS.json',dataRoot))));
  assert.deepEqual(result.spells,JSON.parse(before));
  assert.deepEqual(JSON.parse(readFileSync(join(directory,'FULL_SPELLS_FINAL.json'))),result.spells);
  assert.deepEqual(JSON.parse(readFileSync(join(directory,'SPELLS_DIRECT_URLS.json'))),result.urls);
  assert.equal(readFileSync(new URL('FULL_SPELLS_FINAL.json',dataRoot),'utf8'),before);
  assert.throws(()=>refreshSpellImages({outputRoot,rawResponses:'{broken}'}),SyntaxError);
  assert.throws(()=>refreshSpellImages({outputRoot,rawResponses:'{}'}),/No spell images/);
  assert.deepEqual(JSON.parse(readFileSync(join(directory,'FULL_SPELLS_FINAL.json'))),result.spells);
});

test('material image refresh changes only image metadata and preserves all other fields', t => {
  const directory=mkdtempSync(join(tmpdir(),'bartender-material-images-'));
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const outputRoot=pathToFileURL(directory+'/');
  const materials=[{id:'water',name:'Water',hardness:0,density:5.119999885559082,tags:['[liquid]'],
    image:'File:Water.png',icon:'Potion water.png',pouchIcon:null,future:{enabled:false,amount:null}}];
  const original=structuredClone(materials);
  const images=[{name:'Water.png',url:'https://example.test/water.png'},{name:'Potion_water.png',url:'https://example.test/potion.png'}];
  const rawResponses=JSON.stringify({query:{allimages:images}});
  const result=refreshMaterialImages({outputRoot,materials,rawResponses});
  assert.deepEqual(result.materials,[{...original[0],image_url:images[0].url,image_local:'Water.png',
    icon_url:images[1].url,icon_local:'Potion_water.png',pouch_url:null,pouch_local:'no_image_available.png'}]);
  assert.deepEqual(materials,original);
  assert.deepEqual(JSON.parse(readFileSync(join(directory,'FULL_MATERIALS_FINAL.json'))),result.materials);
  assert.deepEqual(JSON.parse(readFileSync(join(directory,'DIRECT_URLS.json'))),result.urls);
  assert.throws(()=>refreshMaterialImages({outputRoot,materials,rawResponses:'{broken}'}),SyntaxError);
  assert.throws(()=>refreshMaterialImages({outputRoot,materials,rawResponses:'{}'}),/No material images/);
  assert.deepEqual(JSON.parse(readFileSync(join(directory,'FULL_MATERIALS_FINAL.json'))),result.materials);
});

test('a cached refresh builds a complete candidate and field diff without altering live sources', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'bartender-candidate-'));
  t.after(() => rmSync(directory, {recursive: true, force: true}));
  const before = loadSources();
  // Synthetic API rows derived from the current metadata; this tests orchestration,
  // not a claim about a new wiki/game version.
  const spells = JSON.parse(readFileSync(new URL('spells.json', dataRoot)));
  const tables = {Materials: before.materials.map(row => Object.fromEntries(['id','name','type','image','icon','pouchIcon','wikipage'].map(key => [key, row[key]]))),
    Spells: spells.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Array.isArray(value) ? value.join(',') : value == null ? '' : String(value)]))),
    Reactions: JSON.parse(readFileSync(new URL('reactions.json', dataRoot)))};
  const snapshot = await refreshData({output: join(directory, 'snapshot'), fetcher: async url => {
    const offset = Number(url.searchParams.get('offset'));
    return {ok: true, json: async () => ({cargoquery: tables[url.searchParams.get('tables')].slice(offset, offset + 500).map(title => ({title}))})};
  }});
  const output = join(directory, 'candidate');
  const diff = await buildCandidate(snapshot, output);
  const candidate = await readCatalog(join(output, 'catalog.duckdb'));
  assert.equal(candidate.materials.length, before.materials.length);
  assert.deepEqual(candidate.reactions, before.reactions, 'wiki rules cannot replace expanded engine reactions');
  assert.deepEqual(candidate.availability, before.availability);
  assert.deepEqual(JSON.parse(readFileSync(join(output, 'diff.json'))), diff);
  assert.deepEqual(loadSources(), before);
  const manifestPath = join(snapshot, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath)); manifest.game.executableSha256 = 'a'.repeat(64);
  writeFileSync(manifestPath, JSON.stringify(manifest));
  await assert.rejects(buildCandidate(snapshot, join(directory, 'unverified')), /Game executable changed/);
  assert.equal(existsSync(join(directory, 'unverified')), false);
});

test('candidate differences distinguish missing, null, zero, additions and reordering', () => {
  const diff = datasetDiff([{id: 'a', n: null}, {id: 'b', n: 1}], [{id: 'b', n: 1}, {id: 'a', n: 0, extra: null}]);
  assert.equal(diff.orderChanged, true);
  assert.deepEqual(diff.records[0].fields.n, {before: null, after: 0, removed: false, added: false});
  assert.equal(diff.records[0].fields.extra.added, true);
  assert.equal(diff.records[0].fields.extra.after, null);
});
