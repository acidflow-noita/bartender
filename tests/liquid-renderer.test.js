import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createLiquidRenderer, minaReferenceBounds} from '../src/liquids/renderer.mjs';
import {getDiggingViewport} from '../src/digging/model.js';
import {installDom} from './dom.js';

test('textures load on demand, share one request, and redraw a paused canvas after decode', async t => {
  const view = installDom(t);
  const originalImage = Object.getOwnPropertyDescriptor(globalThis, 'Image');
  const requests = [], pending = [];
  Object.defineProperty(globalThis, 'Image', {configurable: true, value: class {
    naturalWidth = 1; naturalHeight = 1;
    set src(value) {requests.push(value);}
    decode() {return new Promise(resolve => pending.push(resolve));}
  }});
  t.after(() => {if (originalImage) Object.defineProperty(globalThis, 'Image', originalImage); else delete globalThis.Image;});
  let draws = 0;
  view.HTMLCanvasElement.prototype.getContext = () => ({
    createImageData: (width, height) => ({data: new Uint8ClampedArray(width * height * 4)}),
    putImageData() {draws++;}, drawImage() {},
    getImageData: () => ({data: new Uint8ClampedArray([20, 40, 60, 255])}),
  });
  const material = file => ({graphics: {color: 'ff123456', texture_file: `data/materials_gfx/${file}.png`}});
  const world = {width: 2, height: 1, materials: [null, material('steel'), material('steel'), material('gold')], cells: new Uint16Array(2)};
  const renderer = createLiquidRenderer(document.createElement('canvas'), world);
  t.after(() => renderer.dispose());
  renderer.draw(); assert.deepEqual(requests, []);
  world.cells[0] = 1; world.cells[1] = 2; renderer.draw();
  assert.deepEqual(requests, ['/liquids/textures/steel.png']);
  renderer.draw(); assert.equal(requests.length, 1);
  const before = draws; pending.shift()(); await renderer.ready;
  assert.ok(draws > before);
  assert.deepEqual(renderer.failed, []);
  const preload = renderer.preload(3);
  assert.equal(requests.length, 2); pending.shift()(); await preload;
  assert.equal(requests[1], '/liquids/textures/gold.png');
});

test('Minä uses Digging scale, faces left, and leaves the simulated cells unchanged', async t => {
  const view = installDom(t);
  const originalImage = Object.getOwnPropertyDescriptor(globalThis, 'Image');
  const sources = [], draws = [];
  Object.defineProperty(globalThis, 'Image', {configurable: true, value: class {
    set src(value) {sources.push(value);}
    decode() {return Promise.resolve();}
  }});
  t.after(() => {if (originalImage) Object.defineProperty(globalThis, 'Image', originalImage); else delete globalThis.Image;});
  const context = {
    createImageData: (width, height) => ({data: new Uint8ClampedArray(width * height * 4)}),
    putImageData() {}, drawImage(...args) {draws.push(args);},
  };
  view.HTMLCanvasElement.prototype.getContext = () => context;
  const world = {width: 256, height: 160, materials: [null], cells: new Uint16Array(256 * 160)};
  const before = world.cells.slice();
  const renderer = createLiquidRenderer(document.createElement('canvas'), world);
  t.after(() => renderer.dispose());
  renderer.draw(); await renderer.ready;
  assert.deepEqual(sources, ['/liquids/mina_outline.png']);
  assert.equal(context.imageSmoothingEnabled, false);
  assert.deepEqual(draws.at(-1).slice(1), [247, 141, 8, 18]);
  assert.deepEqual(world.cells, before);
  const digging = getDiggingViewport(0, 640), bounds = minaReferenceBounds(world);
  assert.equal(bounds.width, digging.mina.width / digging.scale);
  assert.equal(bounds.height, digging.mina.height / digging.scale);
  assert.equal(bounds.x + bounds.width - 1, world.width - 2);
  assert.equal(bounds.y + bounds.height - 1, world.height - 2);
  const image = readFileSync(new URL('../public/liquids/mina_outline.png', import.meta.url));
  assert.equal(image.readUInt32BE(16), 48); assert.equal(image.readUInt32BE(20), 108);
  assert.equal(createHash('sha256').update(image).digest('hex'), '0752f1291ba995fe7a97252717eb98cbbc4a01005d1bad90a0e0bdade067f55d');
});

test('a texture that decodes after a pour follows the texel of the moving cell', async t => {
  const {LiquidWorld} = await import('../src/liquids/engine.mjs');
  const view = installDom(t), original = Object.getOwnPropertyDescriptor(globalThis, 'Image');
  let resolve, pixels;
  Object.defineProperty(globalThis, 'Image', {configurable: true, value: class {
    naturalWidth = 1; naturalHeight = 2;
    decode() {return new Promise(done => { resolve = done; });}
  }});
  t.after(() => {if (original) Object.defineProperty(globalThis, 'Image', original); else delete globalThis.Image;});
  view.HTMLCanvasElement.prototype.getContext = () => ({
    createImageData: (w,h) => ({data: new Uint8ClampedArray(w*h*4)}),
    putImageData(img) {pixels = img.data;}, drawImage() {},
    getImageData: () => ({data: new Uint8ClampedArray([255,0,0,255, 0,0,255,255])}),
  });
  const material = {id: 'ink', cell_type: 'liquid', density: 1, liquid_gravity: 1,
    liquid_flow_speed: .9, liquid_damping: .8, graphics: {color: 'ff000000', texture_file: 'data/materials_gfx/ink.png'}};
  const world = new LiquidWorld({width: 5, height: 8, materials: [material], processes: false});
  const renderer = createLiquidRenderer(document.createElement('canvas'), world); t.after(() => renderer.dispose());
  world.setCell(2, 0, 1); renderer.draw(); world.step(); renderer.draw();
  resolve(); await renderer.ready;
  const at = world.cells.indexOf(1); assert.equal(at, 7);
  assert.deepEqual([...pixels.slice(at * 4, at * 4 + 4)], [255,0,0,255]);
});

test('a CSS-sized observer report cannot downscale a high-density canvas', t => {
  const view = installDom(t), canvas = document.createElement('canvas');
  Object.defineProperty(view,'devicePixelRatio',{value:2, configurable:true});
  let notifyResize;
  view.ResizeObserver = class {constructor(fn) {notifyResize = fn;} observe() {} disconnect() {}};
  const rect = {width:40,height:24}; canvas.getBoundingClientRect = () => rect;
  canvas.getContext = () => ({createImageData: (w,h) => ({data:new Uint8ClampedArray(w*h*4)}),
    putImageData() {}, setTransform() {}});
  const world = {width:5,height:3,materials:[null],cells:new Uint16Array(15),tick:0};
  const renderer = createLiquidRenderer(canvas, world); t.after(()=>renderer.dispose());
  notifyResize([{contentRect:rect,devicePixelContentBoxSize:[{inlineSize:40,blockSize:24}]}]);
  assert.deepEqual([canvas.width,canvas.height],[80,48]);
});
