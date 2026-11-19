import {createCanvas, GlobalFonts} from '@napi-rs/canvas';
import {fileURLToPath} from 'node:url';

const font = fileURLToPath(new URL('./NoitaPixel2.woff2', import.meta.url));
if (!GlobalFonts.registerFromPath(font, 'Recipe bitmap source')) throw new Error('Cannot load the Bartender display font.');

// NoitaPixel2 outlines lie on a roughly 136.5-unit grid in a 1024-unit em.
// Sample its cells at their centers. The body baseline (-153 font units)
// separates ordinary letters from descenders, and the left edge is at 73.
const samplingStep = 16, em = 120, originX = 3, baselineY = 12;
const sample = createCanvas(20 * samplingStep, 18 * samplingStep);
const brush = sample.getContext('2d');
brush.font = em + 'px "Recipe bitmap source"';
brush.textBaseline = 'alphabetic';
brush.fillStyle = '#fff';
const glyphs = new Map();
const scale = 3;

function glyph(character) {
  if (glyphs.has(character)) return glyphs.get(character);
  brush.clearRect(0, 0, sample.width, sample.height);
  brush.fillText(character, originX * samplingStep - 73 * em / 1024, baselineY * samplingStep - 153 * em / 1024);
  const pixels = brush.getImageData(0, 0, sample.width, sample.height).data, ink = [];
  for (let y = 0; y < 18; y++) {
    for (let x = 0; x < 20; x++) {
      const center = (y * samplingStep + samplingStep / 2) * sample.width + x * samplingStep + samplingStep / 2;
      if (pixels[center * 4 + 3] >= 128) ink.push([x - originX, y - baselineY]);
    }
  }
  const advance = Math.max(1, Math.round(brush.measureText(character).width / samplingStep));
  const result = {advance, ink};
  glyphs.set(character, result);
  return result;
}

function textWidth(text) {
  let width = 0;
  for (const ch of text) width += glyph(ch).advance * scale;
  return width;
}

export function drawText(ctx, text, x, baseline, color) {
  ctx.fillStyle = color;
  for (const ch of text) {
    const {ink, advance} = glyph(ch);
    for (const [dx, dy] of ink) ctx.fillRect(x + dx * scale, baseline + dy * scale, scale, scale);
    x += advance * scale;
  }
}

export function wrapText(text, width) {
  const lines = [];
  let line = '';
  const flush = () => {if (line) lines.push(line); line = '';};
  for (const word of text.split(/\s+/)) {
    const next = line ? line + ' ' + word : word;
    if (textWidth(next) <= width) {line = next; continue;}
    flush();
    if (textWidth(word) <= width) {line = word; continue;}
    // A few materials display internal IDs. Keep all characters and prefer
    // their underscore or hyphen boundaries over splitting a word.
    for (const part of word.match(/[^_-]+[_-]*|[_-]+/gu) ?? [word]) {
      if (line && textWidth(line + part) > width) flush();
      for (const ch of part) {
        if (line && textWidth(line + ch) > width) flush();
        line += ch;
      }
    }
  }
  flush();
  if (!lines.length || lines.some(value => textWidth(value) > width)) throw new Error('Cannot fit material name: ' + text);
  return lines;
}
