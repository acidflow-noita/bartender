import {createCanvas, ImageData, loadImage} from '@napi-rs/canvas';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {recipeCells, RECIPE_TANK} from '../../src/reactions/experiment.js';
import {drawText, wrapText} from './pixel-type.mjs';

export const WIDTH = 960, CELL_SCALE = 6;
export const HEIGHT = RECIPE_TANK.height * CELL_SCALE, SIDEBAR_WIDTH = WIDTH - RECIPE_TANK.width * CELL_SCALE;
const ICON = 36, ICON_X = 36, TEXT_X = 84, LINE = 24;
const GAP = 34, ITEM_GAP = 8;
const BG = '#020618', FG = '#e2e8f0', DIM = '#a5b4c8';
const logoWidth = 210, logoHeight = 42, logoY = 12, bodyStart = logoY + logoHeight + 16;
const rowCache = new WeakMap();
let logo;

function inkBounds(canvas) {
  const {width, height} = canvas;
  const pixels = canvas.getContext('2d').getImageData(0, 0, width, height).data;
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!pixels[(y * width + x) * 4 + 3]) continue;
      left = Math.min(left, x); right = Math.max(right, x);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
  }
  return right < left ? null : {x: left, y: top, width: right - left + 1, height: bottom - top + 1};
}

function drawInk(ctx, image, box, x, y) {
  ctx.drawImage(image, box.x, box.y, box.width, box.height, x, y, box.width, box.height);
}

async function loadLogo() {
  // Rasterize the site's two-color navbar logo at its final size, then snap
  // the stroke and fill to their original inks so no soft fringe survives.
  const original = readFileSync(new URL('./bartender_logo.svg', import.meta.url), 'utf8');
  const svg = original.replace(/<svg\b[^>]*>/, tag => tag
    .replace(/width="[^"]*"/, 'width="' + logoWidth + '"')
    .replace(/height="[^"]*"/, 'height="' + logoHeight + '"')
    .replace('<svg ', '<svg shape-rendering="crispEdges" '));
  const {data, info} = await sharp(Buffer.from(svg), {density: 72}).ensureAlpha().raw().toBuffer({resolveWithObject: true});
  if (info.width !== logoWidth || info.height !== logoHeight) throw new Error('Unexpected navbar logo dimensions.');
  const pixels = new Uint8ClampedArray(data.length), green = [41, 191, 61], white = [255, 255, 255];
  for (let i = 0; i < pixels.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const distance = color => (data[i] - color[0]) ** 2 + (data[i+1] - color[1]) ** 2 + (data[i+2] - color[2]) ** 2;
    pixels.set(distance(green) <= distance(white) ? green : white, i); pixels[i+3] = 255;
  }
  const image = createCanvas(logoWidth, logoHeight);
  image.getContext('2d').putImageData(new ImageData(pixels, logoWidth, logoHeight), 0, 0);
  return image;
}

async function rasterRow(material) {
  const lines = wrapText(material.name, SIDEBAR_WIDTH - TEXT_X - 12);
  const baseline = lines.length * LINE, text = createCanvas(SIDEBAR_WIDTH - TEXT_X, baseline + 16);
  const words = text.getContext('2d');
  lines.forEach((line, i) => drawText(words, line, 0, (i + 1) * LINE, FG));
  const label = inkBounds(text);
  if (!label) throw new Error('No visible glyphs for ' + material.id);
  const icon = createCanvas(ICON, ICON), art = icon.getContext('2d');
  art.imageSmoothingEnabled = false;
  const file = material.image_local || 'Material_' + material.id + '.png';
  const image = await loadImage(fileURLToPath(new URL('../../src/data/images/materials/' + encodeURIComponent(file), import.meta.url)));
  const ratio = ICON / Math.max(image.width, image.height);
  const width = Math.round(image.width * ratio), height = Math.round(image.height * ratio);
  art.drawImage(image, Math.floor((ICON - width) / 2), Math.floor((ICON - height) / 2), width, height);

  const ink = inkBounds(icon);
  const textAscent = baseline - label.y;
  const ascent = Math.max(textAscent, ink?.height ?? 0), descent = Math.max(0, label.y + label.height - baseline);
  const row = createCanvas(SIDEBAR_WIDTH, ascent + descent), ctx = row.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  // Air and a few effects have fully transparent artwork. Keep their icon
  // slot. For visible icons, align their last pixel to the body baseline.
  if (ink) drawInk(ctx, icon, ink, ICON_X + ink.x, ascent - ink.height);
  drawInk(ctx, text, label, TEXT_X + label.x, ascent - textAscent);
  return {material, row, ascent, descent};
}

async function groupLayout(rule, side, byId) {
  const rows = await Promise.all(recipeCells(rule, side).map(id => {
    const material = byId.get(id);
    if (!material) throw new Error('Unknown recipe material: ' + id);
    if (!rowCache.has(material)) rowCache.set(material, rasterRow(material));
    return rowCache.get(material);
  }));
  const baselines = [];
  rows.forEach((row, i) => {
    // Use a six-pixel stride so repeated rows keep their phase at chat sizes.
    const previous = rows[i - 1];
    const base = previous ? baselines[i-1] + CELL_SCALE * Math.ceil((previous.descent + ITEM_GAP + row.ascent) / CELL_SCALE) : row.ascent;
    baselines.push(base);
  });
  const height = rows.length ? baselines.at(-1) + rows.at(-1).descent : 0;
  return {rows, baselines, height};
}

const connector = createCanvas(220, 42);
drawText(connector.getContext('2d'), 'produces', 0, 27, DIM);
const connectorInk = inkBounds(connector);

export async function layoutSidebar(rule, byId) {
  const [inputs, outputs] = await Promise.all(['input', 'output'].map(side => groupLayout(rule, side, byId)));
  const height = inputs.height + 2 * GAP + connectorInk.height + outputs.height;
  const available = HEIGHT - bodyStart - 12;
  if (height > available) throw new Error('Recipe sidebar overflow: ' + [...inputs.rows, ...outputs.rows].map(r => r.material.name).join(', '));
  let top = bodyStart + Math.floor((available - height) / 2);
  const firstOutput = top + inputs.height + GAP * 2 + connectorInk.height + (outputs.baselines[0] ?? 0);
  top += Math.round(firstOutput / CELL_SCALE) * CELL_SCALE - firstOutput;
  return {inputs, outputs, top, connectorTop: top + inputs.height + GAP, outputTop: top + height - outputs.height};
}

export async function drawSidebar(rule, byId) {
  const {inputs, outputs, top, outputTop, connectorTop} = await layoutSidebar(rule, byId);
  const canvas = createCanvas(SIDEBAR_WIDTH, HEIGHT), ctx = canvas.getContext('2d');
  ctx.fillStyle = BG; ctx.fillRect(0, 0, SIDEBAR_WIDTH, HEIGHT);
  ctx.imageSmoothingEnabled = false;
  logo ??= loadLogo();
  ctx.drawImage(await logo, (SIDEBAR_WIDTH - logoWidth) / 2, logoY);
  drawInk(ctx, connector, connectorInk, 3 * Math.round((SIDEBAR_WIDTH - connectorInk.width) / 6), connectorTop);
  for (const [group, y] of [[inputs, top], [outputs, outputTop]]) {
    group.rows.forEach((row, i) => {
      const base = y + group.baselines[i];
      ctx.drawImage(row.row, 0, base - row.ascent);
      if (i) drawText(ctx, '+', 12, base, DIM);
    });
  }
  return canvas;
}
