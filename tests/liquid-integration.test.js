import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {JSDOM} from 'jsdom';
import {liquidMaterialRecords, simulationMaterialRecords, LIQUID_MATERIAL_FIELDS, materialRGBA, liquidTextureUrl, WORLD_RENDER_IMAGES} from '../src/liquids/materials.mjs';
import {createLiquidPlayback, LIQUID_TICK_MS} from '../src/liquids/playback.mjs';
import {readLiquidSetup, liquidSetupUrl} from '../src/liquids/url.mjs';
import {defaultSceneProcesses} from '../src/liquids/scenes.mjs';
import {materialPropertyRows, cellReadout} from '../src/liquids/view-data.mjs';
import {renderPageShell} from '../scripts/render-page-shell.mjs';
import {materialSummaryView} from '../src/materials/summary.js';
import {installDom} from './dom.js';

const source = readFileSync(new URL('../src/data/FULL_MATERIALS_FINAL.json', import.meta.url));
const materials = JSON.parse(source);
const liquids = liquidMaterialRecords(materials);
const hash = value => createHash('sha256').update(value).digest('hex');

test('liquid dataset retains exact resolved native values for every liquid, including zero and specialized movement', () => {
  assert.equal(liquids.length, 100);
  assert.deepEqual(liquids.map(material => material.id), materials.filter(material => material.type === 'Liquid').map(material => material.id));
  for (const material of liquids) {
    const original = materials.find(item => item.id === material.id);
    for (const key of LIQUID_MATERIAL_FIELDS) assert.deepEqual(material[key], original[key], `${material.id}.${key}`);
  }
  assert.equal(liquids.find(material => material.id === 'cloud_blood').liquid_gravity, 0);
  assert.equal(liquids.find(material => material.id === 'porridge').liquid_viscosity, 0);
  assert.equal(liquids.find(material => material.id === 'plasma_fading_pink').liquid_sand, true);
  assert.equal(liquids.find(material => material.id === 'slime').liquid_slime, true);
  assert.ok(JSON.stringify(liquids).length < 70000);
});

test('committed liquid textures cover every source path and retain exact source bytes', () => {
  const manifest = JSON.parse(readFileSync(new URL('../public/liquids/texture-manifest.json', import.meta.url)));
  assert.equal(manifest.materialSourceSha256, hash(source));
  const paths = [...new Set([...simulationMaterialRecords(materials).map(material => material.graphics.texture_file).filter(Boolean),
    ...Object.values(WORLD_RENDER_IMAGES)])].sort();
  assert.deepEqual(manifest.files.map(file => file.source), paths);
  for (const file of manifest.files) {
    const bytes = readFileSync(new URL(`../public/liquids/textures/${file.file}`, import.meta.url));
    assert.equal(bytes.length, file.bytes);
    assert.equal(hash(bytes), file.sha256);
  }
  assert.equal(liquidTextureUrl(liquids.find(material => material.id === 'gold_molten')), '/liquids/textures/gold.png');
  assert.equal(liquidTextureUrl({graphics: {texture_file: '../private.png'}}), null);
  assert.deepEqual(materialRGBA({graphics: {color: '80123456'}}), [0x12, 0x34, 0x56, 0x80]);
});

test('fixed playback gives the same ticks at 30 and 120 Hz, pauses, and does not catch up across a hidden tab', () => {
  function run(hz) {
    const callbacks = new Map(); let next = 1, steps = 0;
    const playback = createLiquidPlayback({step: () => steps++, draw() {},
      requestFrame(callback) {const id = next++; callbacks.set(id, callback); return id;}, cancelFrame(id) {callbacks.delete(id);}});
    const frame = time => {const [id, callback] = callbacks.entries().next().value; callbacks.delete(id); callback(time);};
    for (let i = 0; i <= hz; i++) frame(i * 1000 / hz);
    assert.equal(steps, 60);
    playback.setPaused(true); assert.equal(callbacks.size, 0);
    playback.step(); assert.equal(steps, 61); assert.equal(callbacks.size, 0);
    playback.setPaused(false); frame(60000); assert.equal(steps, 61);
    frame(60000 + LIQUID_TICK_MS); assert.equal(steps, 62);
    playback.dispose(); assert.equal(callbacks.size, 0);
  }
  run(30); run(120);
});

test('setup URLs round-trip selected liquid and scene and reject unrelated IDs', () => {
  const setup = {material: 'magic_liquid_invisibility', scene: 'channels', wall: 'wood_static'};
  const href = liquidSetupUrl('https://example.test/liquids?unrelated=keep', setup);
  assert.deepEqual(readLiquidSetup(href, liquids), setup);
  assert.match(href, /unrelated=keep/);
  assert.deepEqual(readLiquidSetup('https://example.test/liquids?material=rock_static&scene=invalid&wall=invalid', liquids), {material: 'water', scene: 'density', wall: 'rock_static'});
});

test('opening in the background preserves play intent and a manual pause survives hiding', () => {
  let callback, steps = 0;
  const clock = createLiquidPlayback({hidden: true, paused: false, step: () => {steps++;}, draw() {},
    requestFrame: fn => {callback = fn; return 1;}, cancelFrame: () => {callback = null;}});
  assert.equal(callback, undefined);
  clock.setHidden(false);
  callback(5000); callback(5000 + LIQUID_TICK_MS);
  assert.equal(steps, 1);
  clock.setPaused(true); clock.setHidden(true); clock.setHidden(false);
  assert.equal(clock.paused, true);
  assert.equal(callback, null);
  clock.setPaused(false); callback(20000);
  assert.equal(steps, 1, 'time spent in a hidden tab does not accumulate');
  clock.dispose();
});

test('shared setups preserve an interaction override and density defaults to movement only', () => {
  assert.equal(defaultSceneProcesses('density'), false);
  assert.equal(defaultSceneProcesses('ambrosia'), true);
  const density = {material: 'water', scene: 'density', wall: 'rock_static', interactions: true};
  assert.deepEqual(readLiquidSetup(liquidSetupUrl('https://example.test/liquids', density), liquids), density);
  const quiet = {material: 'water', scene: 'channels', wall: 'rock_static', interactions: false};
  assert.deepEqual(readLiquidSetup(liquidSetupUrl('https://example.test/liquids', quiet), liquids), quiet);
});

test('Liquids has a static route, current navigation and only its compact dataset preload', () => {
  const template = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
  const dom = new JSDOM(renderPageShell(template, '/liquids'));
  assert.equal(dom.window.document.querySelector('[aria-current="page"]').getAttribute('href'), '/liquids');
  const preloads = [...dom.window.document.querySelectorAll('link[data-page-preload]')];
  assert.equal(preloads.length, 1);
  assert.match(preloads[0].href, /liquidSimulation-/);
  dom.window.close();
});

test('material overview opens the selected liquid in a flow experiment', t => {
  installDom(t);
  const water = materialSummaryView(materials.find(material => material.id === 'water'));
  assert.equal(water.querySelector('a[href^="/liquids"]').getAttribute('href'), '/liquids?material=water&scene=channels');
  const rock = materialSummaryView(materials.find(material => material.id === 'rock_static'));
  assert.equal(rock.querySelector('a[href^="/liquids"]'), null);
});

test('properties follow the selected movement type and retain native lifetime counters', () => {
  const rows = id => new Map(materialPropertyRows(materials.find(material => material.id === id)).map(([key, label, value]) => [key, {label, value}]));
  assert.equal(rows('water').has('liquid_viscosity'), false);
  assert.equal(rows('slime').has('liquid_viscosity'), true);
  assert.equal(rows('smoke').get('gas_upwards_speed').value, materials.find(material => material.id === 'smoke').gas_upwards_speed);
  assert.equal(rows('smoke').get('lifetime').value, '350 moves');
  const smoke = materials.find(material => material.id === 'smoke');
  const world = {width: 1, height: 1, cells: new Uint16Array([1]), materials: [null, smoke],
    age: new Int32Array([15]), burning: new Uint8Array([1]), fireTemperature: new Int8Array([60]), warmth: new Uint8Array([1]), cold: new Uint8Array(1)};
  assert.equal(cellReadout(world, {x: 0, y: 0}), 'Smoke, burning, strength 60, 335 moves left, warmth 1');
});
