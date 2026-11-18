import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CellGlow, emissionProfile, cellEmission, cellAlpha, compositeCellChannel, renderCellBodies, byteRound} from '../src/liquids/appearance.mjs';
import {materialRGBA} from '../src/liquids/materials.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/noita-liquid-colors.json', import.meta.url)));
const rgba = packed => [packed >>> 16 & 255, packed >>> 8 & 255, packed & 255, packed >>> 24];
const packed = (data, offset) => ((data[offset + 3] << 24) | (data[offset] << 16) | (data[offset + 1] << 8) | data[offset + 2]) >>> 0;

test('material colors and emission match the original native instructions', () => {
  for (const row of fixture.materials) {
    const material = {cell_type: 'liquid', graphics: {color: row.argb.toString(16).padStart(8, '0')}, gfx_glow: row.strength};
    assert.deepEqual(materialRGBA(material), row.rgba, row.material);
    assert.deepEqual(rgba(cellEmission(emissionProfile(material), row.rgba)).slice(0, 3), row.emission, row.material);
  }
  for (const row of fixture.alpha_cases) {
    const profile = emissionProfile({cell_type: 'liquid', gfx_glow: row.strength, gfx_glow_color: row.override});
    assert.equal(cellEmission(profile, rgba(row.argb)), row.liquid);
    assert.equal(cellEmission({...profile, gas: true}, rgba(row.argb)), row.gas);
  }
});

test('gas opacity matches the native final-lifetime fade', () => {
  for (const row of fixture.gas_fading) {
    assert.equal(cellAlpha({cell_type: 'gas', lifetime: 450}, row.alpha, 450 - row.remaining), row.output);
    assert.equal(cellAlpha({cell_type: 'liquid', lifetime: 450}, row.alpha, 450 - row.remaining), row.alpha);
  }
});

test('liquid-gap pixels match the original native blend and stores', () => {
  for (const row of fixture.liquid_gaps) {
    const world = {width: 10, height: 1, cells: new Uint16Array(10),
      materials: [null, {cell_type: 'liquid'}, {cell_type: 'liquid'}], _motion: new Uint8Array(10).fill(3)};
    const raw = new Uint8Array(40), output = new Uint8Array(40), visible = new Uint16Array(10);
    world.cells[6 - row.distance] = 1; world.cells[6] = 1;
    raw.set(rgba(row.previous), (6 - row.distance) * 4); raw.set(rgba(row.current), 24);
    if (row.gap) {world.cells[5] = 2; raw.set(rgba(row.gap), 20);}
    const before = world.cells.slice();
    renderCellBodies(world, raw, output, visible);
    assert.deepEqual(Array.from({length: 10}, (_, index) => packed(output, index * 4)), row.output);
    assert.deepEqual(world.cells, before);
    assert.equal(visible[5], 1);
  }
});

test('powder, solid barriers and wide gaps do not become liquid surfaces', () => {
  const world = {width: 12, height: 1, cells: new Uint16Array(12),
    materials: [null, {cell_type: 'liquid'}, {cell_type: 'liquid', liquid_sand: true}], _motion: new Uint8Array(12).fill(3)};
  const raw = new Uint8Array(48).fill(255), output = new Uint8Array(48), visible = new Uint16Array(12);
  world.cells[1] = 1; world.cells[6] = 1;
  renderCellBodies(world, raw, output, visible); assert.equal(visible[4], 0);
  world.cells.fill(0); world.cells[2] = 1; world.cells[4] = 1; world.cells[3] = 65535;
  renderCellBodies(world, raw, output, visible); assert.equal(visible[3], 65535);
  world.cells.fill(0); world.cells[2] = 2; world.cells[4] = 2;
  renderCellBodies(world, raw, output, visible); assert.equal(visible[3], 0);
});

function shaderStep(source, previous, width, height) {
  const size = source.length, horizontal = new Float32Array(size), vertical = new Float32Array(size);
  const clamp = (value, upper) => Math.max(0, Math.min(upper, value));
  const sample = (buffer, x, y, channel) => {
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const at = (px, py) => buffer[(clamp(py, height - 1) * width + clamp(px, width - 1)) * 3 + channel];
    return (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy)
      + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
  };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) for (let c = 0; c < 3; c++) {
    let sum = 0;
    for (let tap = -5; tap <= 5; tap++) sum += sample(previous, x + tap * 1.5, y, c);
    horizontal[(y * width + x) * 3 + c] = Math.fround(byteRound(Math.fround(sum * .1) * 255) / 255);
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) for (let c = 0; c < 3; c++) {
    let sum = 0;
    for (let tap = -5; tap <= 5; tap++) sum += sample(horizontal, x, y + tap * 1.5, c);
    vertical[(y * width + x) * 3 + c] = Math.fround(sum / 12.2);
  }
  const output = new Float32Array(size);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const u = (x + .5) / width, v = 1 - (y + .5) / height;
    let edge = 1;
    if (u > .95) edge = 1 - (u - .95) * 2; else if (u < .05) edge = 1 - (.05 - u) * 2;
    if (v > .95) edge = 1 - (v - .95) * 2; else if (v < .05) edge = 1 - (.05 - v) * 2;
    edge = Math.fround(edge);
    for (let c = 0; c < 3; c++) {
      const index = (y * width + x) * 3 + c, incoming = Math.fround(source[index] / 255) * 4;
      output[index] = Math.fround(byteRound((incoming * .125 + vertical[index] * edge * .95 + incoming * .05) * 255) / 255);
    }
  }
  return output;
}

test('glow history matches the literal shader taps and quantization', () => {
  const width = 9, height = 7, glow = new CellGlow(width, height), source = new Uint8Array(width * height * 3);
  source.set([32, 22, 5], (3 * width + 4) * 3); source.set([8, 60, 40], 0);
  let expected = new Float32Array(source.length);
  for (let tick = 0; tick < 18; tick++) {
    expected = shaderStep(source, expected, width, height);
    assert.deepEqual(glow.resolve(source, tick), expected);
  }
});

test('hover redraws cannot build glow, and reset clears old emission', () => {
  const glow = new CellGlow(9, 7), source = new Uint8Array(9 * 7 * 3).fill(20);
  const first = glow.resolve(source, 0).slice();
  for (let i = 0; i < 20; i++) assert.deepEqual(glow.resolve(source, 0), first);
  for (let tick = 1; tick < 12; tick++) glow.resolve(source, tick);
  assert.ok(glow.history[30] > first[30]);
  glow.reset(); source.fill(0);
  assert.equal(glow.resolve(source, 0).some(Boolean), false);
});

test('Ambrosia retains half opacity while its native emission brightens the image', () => {
  const material = fixture.materials.find(row => row.material === 'magic_liquid_protection_all');
  assert.equal(material.rgba[3], 128);
  const glow = new CellGlow(32, 32), source = new Uint8Array(32 * 32 * 3);
  for (let i = 0; i < source.length; i += 3) source.set(material.emission, i);
  for (let tick = 0; tick < 60; tick++) glow.resolve(source, tick);
  const at = (16 * 32 + 16) * 3;
  const rendered = material.rgba.slice(0, 3).map((value, channel) => compositeCellChannel(value, 128, 0, glow.history[at + channel]));
  assert.ok(rendered[0] > 220 && rendered[1] > 170 && rendered[2] < 140, rendered.join(','));
  assert.equal(compositeCellChannel(200, 128, 0, 0), 100);
  assert.equal(compositeCellChannel(0, 0, 0, 0), 0);
});

test('surface particles reproduce native acceptance and launch velocities only at an exposed cell', async () => {
  const {SurfaceParticles} = await import('../src/liquids/surface-particles.mjs');
  const materials = JSON.parse(readFileSync(new URL('../src/data/FULL_MATERIALS_FINAL.json', import.meta.url)));
  const artwork = {color: () => 0xff112233};
  for (const row of fixture.surface_trials) {
    const material = materials.find(m => m.id === row.material);
    const world = {width: 1, height: 2, tick: 0, seed: row.seed, materials: [null, material], cells: Uint16Array.of(0, 1)};
    const fx = new SurfaceParticles(world);
    world.tick++; fx.advance(world, artwork);
    const p = fx.items[0];
    assert.deepEqual(p ? [p.vx, p.vy] : null, row.velocity, `${row.material} seed ${row.seed}`);
    fx.advance(world, artwork); assert.equal(fx.items.length, Number(row.velocity !== null));
    world.cells[0] = 65535; fx.reset(world); world.tick++; fx.advance(world, artwork);
    assert.equal(fx.items.length, 0, 'a covered surface cannot emit through its lid');
  }
});

test('refraction animates adjacent resting liquid colors and respects walls', async () => {
  const {createTankRefraction} = await import('../src/liquids/refraction.mjs');
  const w = 12, h = 6, refract = createTankRefraction(w,h);
  const original = new Uint8ClampedArray(w*h*4), mask = new Uint8Array(w*h), ids = new Uint16Array(w*h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y*w+x; mask[i] = Number(x < w-1); ids[i] = x < 6 ? 1 : 2;
    original.set(x < 6 ? [200,40,10,255] : [20,40,180,255],i*4);
  }
  const frame = tick => {const pixels = original.slice(); refract(pixels,ids.slice(),mask,tick);return pixels;};
  const a=frame(3), b=frame(19);
  assert.notDeepEqual(a,b); assert.deepEqual(a,frame(3));
  assert.deepEqual(a.slice(-4),original.slice(-4));
  mask.fill(0); assert.deepEqual(frame(3),original);
});

test('Holy Mountain refraction matches display-pixel reference frames at three scales', async () => {
  const {createHash} = await import('node:crypto');
  const {TankRefraction} = await import('../src/liquids/refraction.mjs');
  const w = 24, h = 16, mask = new Uint8Array(w * h), source = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    mask[i] = Number(x > 1 && x < 22 && y > 1 && y < 15 && !(x === 11 && y > 5 && y < 12));
    source.set(mask[i] ? [x % 2 ? 30 : 220, y % 2 ? 160 : 10, (x + y) * 5 % 256, 255] : [250, 10, 245, 255], i * 4);
  }
  // Noitamap origin/dynamic-map, tests/helpers/liquid-refraction-native.mjs,
  // referenceLiquid at 0.173 s over the original nearest-enlarged map crop.
  const oracle = [[24, 16, '38958baee86da87499b109be8c88e12c441b7d33d17278ca6409d0bb21426109'],
    [33, 22, 'ad6b9c37f2ac8ddbfb5d25c89ee4b27abdba48c28a16c8ccf95c02d67bf322fc'],
    [96, 64, '29393ee90c8e01ecc0c8af10fdfcc2c99c8894743cd362bbe1dc44a810ff58b5']];
  const filter = new TankRefraction(w, h);
  for (const [width, height, hash] of oracle) {
    filter.resize(width, height);
    const out = new Uint8ClampedArray(width * height * 4);
    filter.draw(source, out, mask, .173);
    assert.equal(createHash('sha256').update(out).digest('hex'), hash);
  }
});

test('isolated fire and fading smoke each paint one world cell and leave the adjacent wall intact', () => {
  for (const [kind, coverage] of [['fire',128], ['gas',49]]) {
    const world = {width: 5, height: 1, cells: Uint16Array.of(0,65535,1,0,0), materials: [null,{cell_type: kind}]};
    const raw = new Uint8Array(20), body = new Uint8Array(20), visible = new Uint16Array(5);
    raw.set([91,100,119,255, 200,150,70,190], 4);
    renderCellBodies(world,raw,body,visible,undefined,Uint8Array.of(0,0,49,0,0));
    assert.deepEqual([...body.slice(4,12)],[91,100,119,255, 200,150,70,coverage]);
    assert.deepEqual([...visible],[0,65535,1,0,0]);
  }
});

test('ice keeps its coverage and glow still composites onto the black backdrop', async () => {
  const {composeTankPixels} = await import('../src/liquids/renderer.mjs');
  const src = Uint8Array.of(77,145,178,84, 223,152,40,128, 0,0,0,0);
  const light = Float32Array.of(0,0,0, .4,.35,.2, .05,.1,.02), out = new Uint8ClampedArray(12);
  composeTankPixels(src, light, out);
  assert.deepEqual([...out.slice(0,4)],[77,145,178,84]);
  for (let i=0;i<3;i++) for (let c=0;c<3;c++) {
    const expected = compositeCellChannel(src[i*4+c], src[i*4+3], 0, light[i*3+c]);
    assert.ok(Math.abs(Math.round(out[i*4+c]*out[i*4+3]/255)-expected)<=1);
  }
});

test('resting water on either side of a frozen cell cannot repaint the ice', () => {
  const world = {width: 5, height: 1, cells: Uint16Array.of(0,1,2,1,0),
    materials: [null, {cell_type: 'liquid'}, {cell_type: 'liquid', liquid_static: true, liquid_sand: true}], _motion: new Uint8Array(5).fill(3)};
  const raw = new Uint8Array(20), body = new Uint8Array(20), visible = new Uint16Array(5);
  raw.set([55,98,89,160, 77,145,178,84, 55,98,89,160], 4);
  renderCellBodies(world,raw,body,visible);
  assert.deepEqual([...body.slice(8,12)], [77,145,178,84]);
  assert.equal(visible[2],2);
});
