import sharp from 'sharp';
import {createCanvas} from '@napi-rs/canvas';
import {WIDTH, HEIGHT, SIDEBAR_WIDTH, CELL_SCALE} from './sidebar.mjs';
import {RECIPE_TANK} from '../../src/reactions/experiment.js';

export const ANIMATION_LIMIT = 9_900_000;
const {width: W, height: H} = RECIPE_TANK;
sharp.concurrency(1);
sharp.cache(false);

// Compose from the original RGBA cells. Every enlarged game pixel is an exact
// integer-sized square, and every frame gets the same, recipe sidebar.
export async function encodeCard(sidebar, frames, posterIndex) {
  const canvas = createCanvas(WIDTH, HEIGHT), ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, WIDTH, HEIGHT); ctx.drawImage(sidebar, 0, 0);
  const background = ctx.getImageData(0, 0, WIDTH, HEIGHT).data;
  const base = new Uint32Array(background.buffer, background.byteOffset, WIDTH * HEIGHT);
  const frameSize = WIDTH * HEIGHT, bytes = Buffer.allocUnsafe(frameSize * 4 * frames.length);
  const pixels = new Uint32Array(bytes.buffer, bytes.byteOffset, frameSize * frames.length);
  for (const [index, frame] of frames.entries()) {
    const cells = new Uint32Array(frame.buffer, frame.byteOffset, W * H);
    const offset = index * frameSize;
    pixels.set(base, offset);
    for (let y = 0; y < H; y++) {
      const row = offset + y * CELL_SCALE * WIDTH + SIDEBAR_WIDTH;
      for (let x = 0; x < W; x++) {
        const left = row + x * CELL_SCALE;
        pixels.fill(cells[y * W + x], left, left + CELL_SCALE);
      }
      for (let dy = 1; dy < CELL_SCALE; dy++) pixels.copyWithin(row + dy * WIDTH, row, row + W * CELL_SCALE);
    }
  }
  const delay = frames.map((_, i) => i === 0 ? 350 : i === frames.length - 1 ? 650 : 100);
  const raw = {width: WIDTH, height: HEIGHT, channels: 4};
  const still = bytes.subarray(posterIndex * frameSize * 4, (posterIndex + 1) * frameSize * 4);
  const [animation, poster] = await Promise.all([
    sharp(bytes, {raw: {...raw, height: HEIGHT * frames.length, pageHeight: HEIGHT}})
      .webp({lossless: true, effort: 0, loop: 0, delay}).toBuffer(),
    sharp(still, {raw}).png().toBuffer(),
  ]);
  if (animation.length > ANIMATION_LIMIT) throw new Error('Recipe animation exceeds 9.9 MB');
  if (poster.length >= 5_000_000) throw new Error('Recipe poster exceeds X card limit');
  return {animation, poster};
}
