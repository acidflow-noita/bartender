import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {LiquidWorld, WALL} from '../src/liquids/engine.mjs';

const capture = JSON.parse(readFileSync(new URL('./fixtures/noita-tank-frames.json', import.meta.url)));
const materials = Object.entries(capture.materials).map(([id, material]) => ({id, cell_type: id === 'wall' ? 'solid' : 'liquid', ...material}));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

for (const scene of capture.cases) test(`native movement and color transport through 64 ticks: ${scene.name}`, () => {
  const {width, height, seed} = capture;
  const world = new LiquidWorld({width, height, seed, materials, processes: scene.stains});
  world.sampleColor = (_id, origin) => (0xff000000 | ((origin % width) * 9 << 16)
    | (Math.floor(origin / width) * 11 << 8) | (origin * 7 & 255)) >>> 0;
  world.fillRect(0, 0, width, 1, WALL); world.fillRect(0, height - 1, width, 1, WALL);
  world.fillRect(0, 0, 1, height, WALL); world.fillRect(width - 1, 0, 1, height, WALL);
  for (const [name, x, y, w, h] of scene.rects) world.fillRect(x, y, w, h, name === 'wall' ? WALL : world.getMaterialId(name));
  for (const frame of scene.frames) {
    world.step(frame.tick - world.tick);
    const cells = Uint8Array.from(world.cells, id => id === WALL ? 255 : id);
    const colors = Buffer.alloc(world.cells.length * 4);
    world.cells.forEach((id, i) => {
      if (id && id !== WALL) colors.writeUInt32LE(world.stain[i] ?? world.sampleColor(id, world.colorOrigin[i]), i * 4);
    });
    assert.equal(hash(cells), frame.cells, `occupied cells at tick ${frame.tick}`);
    assert.equal(hash(colors), frame.colors, `pixel colors at tick ${frame.tick}`);
    assert.equal(world.random.state, frame.rng, `movement RNG at tick ${frame.tick}`);
  }
});
