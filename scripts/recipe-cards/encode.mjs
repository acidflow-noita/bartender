import sharp from 'sharp';
import {createCanvas} from '@napi-rs/canvas';
import {WIDTH, HEIGHT, SIDEBAR_WIDTH, CELL_SCALE} from './sidebar.mjs';
import {RECIPE_TANK} from '../../src/reactions/experiment.js';
import {LIQUID_TICK_MS} from '../../src/liquids/playback.mjs';

export const ANIMATION_LIMIT = 9_900_000;
const {width: W, height: H} = RECIPE_TANK;
const fullTank = {left: 0, top: 0, right: W, bottom: H};
sharp.concurrency(1);
sharp.cache(false);

function changedBounds(current, previous) {
  let left = W, top = H, right = 0, bottom = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (current[i] === previous[i]) continue;
    if (x < left) left = x;
    if (x >= right) right = x + 1;
    if (y < top) top = y;
    bottom = y + 1;
  }
  return right ? {left, top, right, bottom} : null;
}

function paintTank(target, stride, offset, bounds, current, previous) {
  const {left, top, right, bottom} = bounds, rowWidth = (right - left) * CELL_SCALE;
  for (let y = top; y < bottom; y++) {
    const row = offset + (y - top) * CELL_SCALE * stride;
    for (let x = left; x < right; x++) {
      const i = y * W + x, start = row + (x - left) * CELL_SCALE;
      // A transparent pixel in a delta frame keeps the previous game pixel.
      const color = previous && current[i] === previous[i] ? 0 : current[i];
      target.fill(color, start, start + CELL_SCALE);
    }
    for (let dy = 1; dy < CELL_SCALE; dy++) target.copyWithin(row + dy * stride, row, row + rowWidth);
  }
}

function chunk(name, ...data) {
  const size = data.reduce((total, bytes) => total + bytes.length, 0);
  const header = Buffer.alloc(8);
  header.write(name); header.writeUInt32LE(size, 4);
  if (size % 2) data.push(Buffer.alloc(1));
  return Buffer.concat([header, ...data]);
}

async function losslessFrame(bytes, width, height) {
  const still = await sharp(bytes, {raw: {width, height, channels: 4}}).webp({lossless: true, effort: 1}).toBuffer();
  for (let at = 12; at + 8 <= still.length;) {
    const size = still.readUInt32LE(at + 4), end = at + 8 + size + (size % 2);
    if (still.toString('ascii', at, at + 4) === 'VP8L') return still.subarray(at, end);
    at = end;
  }
  throw new Error('Missing lossless WebP frame.');
}

function animationFrame(x, y, width, height, index, frame) {
  // WebP ANMF positions use pairs of display pixels. The tank is on a six-pixel grid.
  const header = Buffer.alloc(16);
  header.writeUIntLE(x / 2, 0, 3); header.writeUIntLE(y / 2, 3, 3);
  header.writeUIntLE(width - 1, 6, 3); header.writeUIntLE(height - 1, 9, 3);
  const delay = Math.round((index + 1) * LIQUID_TICK_MS) - Math.round(index * LIQUID_TICK_MS);
  header.writeUIntLE(delay, 12, 3);
  header[15] = index === 0 ? 2 : 0;
  return chunk('ANMF', header, frame);
}

// Keep the sidebar in the first frame. All later frames patch only changed tank pixels.
export async function encodeCard(sidebar, frames, posterIndex) {
  const ctx = createCanvas(WIDTH, HEIGHT).getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, WIDTH, HEIGHT); ctx.drawImage(sidebar, 0, 0);
  const image = ctx.getImageData(0, 0, WIDTH, HEIGHT).data;
  const card = Buffer.from(image.buffer, image.byteOffset, image.byteLength);
  const pixels = new Uint32Array(card.buffer, card.byteOffset, WIDTH * HEIGHT);
  const cells = frame => new Uint32Array(frame.buffer, frame.byteOffset, W * H);
  paintTank(pixels, WIDTH, SIDEBAR_WIDTH, fullTank, cells(frames[posterIndex]));
  const poster = await sharp(card, {raw: {width: WIDTH, height: HEIGHT, channels: 4}}).png().toBuffer();
  let previous = cells(frames[0]);
  paintTank(pixels, WIDTH, SIDEBAR_WIDTH, fullTank, previous);
  const features = Buffer.alloc(10);
  features[0] = 0x12; // Animation and transparency in delta frames.
  features.writeUIntLE(WIDTH - 1, 4, 3); features.writeUIntLE(HEIGHT - 1, 7, 3);
  const parts = [Buffer.from('WEBP'), chunk('VP8X', features), chunk('ANIM', Buffer.alloc(6)),
    animationFrame(0, 0, WIDTH, HEIGHT, 0, await losslessFrame(card, WIDTH, HEIGHT))];
  const scratch = Buffer.allocUnsafe(W * H * CELL_SCALE * CELL_SCALE * 4);
  const patch = new Uint32Array(scratch.buffer, scratch.byteOffset, scratch.length / 4);
  let unchanged;
  for (let i = 1; i < frames.length; i++) {
    const current = cells(frames[i]), bounds = changedBounds(current, previous);
    if (bounds) {
      const width = (bounds.right - bounds.left) * CELL_SCALE, height = (bounds.bottom - bounds.top) * CELL_SCALE;
      paintTank(patch, width, 0, bounds, current, previous);
      const frame = await losslessFrame(scratch.subarray(0, width * height * 4), width, height);
      parts.push(animationFrame(SIDEBAR_WIDTH + bounds.left * CELL_SCALE, bounds.top * CELL_SCALE, width, height, i, frame));
    } else {
      unchanged ??= await losslessFrame(Buffer.alloc(4), 1, 1);
      parts.push(animationFrame(0, 0, 1, 1, i, unchanged));
    }
    previous = current;
  }
  const animation = chunk('RIFF', ...parts);
  if (animation.length > ANIMATION_LIMIT) throw new Error('Recipe animation exceeds 9.9 MB');
  if (poster.length >= 5_000_000) throw new Error('Recipe poster exceeds X card limit');
  return {animation, poster};
}
