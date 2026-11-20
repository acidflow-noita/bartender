import {LIQUID_TICK_MS} from '../../src/liquids/playback.mjs';

export const CLIP_TICKS = 144;

// WebP uses integer milliseconds. Chromium presents consecutive 17 ms frames more
// reliably than alternating 16 and 17. Center each correction to keep the clock
// within 9 ms of the native ticks. Durations below 11 ms can be clamped by viewers.
export function recipeFrameDelays(count) {
  const delays = new Array(count).fill(17);
  for (let start = 0; start < count; start += 54) {
    const end = Math.min(count, start + 54), length = end - start;
    const duration = Math.round(end * LIQUID_TICK_MS) - Math.round(start * LIQUID_TICK_MS);
    let correction = length * 17 - duration;
    const shortFrames = Math.ceil(correction / 6), first = start + Math.floor((length - shortFrames) / 2);
    for (let i = first; correction > 0; i++) {
      const amount = Math.min(6, correction);
      delays[i] -= amount; correction -= amount;
    }
  }
  return delays;
}

// A timing change touches only the three duration bytes in each WebP animation frame.
export function retimeRecipeWebp(bytes, before, after) {
  if (before.length !== after.length || bytes.toString('ascii', 0, 4) !== 'RIFF'
      || bytes.toString('ascii', 8, 12) !== 'WEBP' || bytes.readUInt32LE(4) !== bytes.length - 8) {
    throw new Error('Invalid WebP for recipe timing update.');
  }
  const result = Buffer.from(bytes);
  let frame = 0;
  for (let at = 12; at < bytes.length;) {
    const size = bytes.readUInt32LE(at + 4), end = at + 8 + size + size % 2;
    if (end > bytes.length) throw new Error('Truncated recipe WebP.');
    if (bytes.toString('ascii', at, at + 4) === 'ANMF') {
      if (size < 16 || bytes.readUIntLE(at + 20, 3) !== before[frame]) throw new Error('Unexpected source frame timing.');
      result.writeUIntLE(after[frame++], at + 20, 3);
    }
    at = end;
  }
  if (frame !== after.length) throw new Error('Unexpected recipe frame count.');
  return result;
}
