import {createCanvas, GlobalFonts, loadImage} from '@napi-rs/canvas';
import {fileURLToPath} from 'node:url';
import {recipeCells} from '../../src/reactions/experiment.js';

export const WIDTH = 960, HEIGHT = 480, BANNER_HEIGHT = 144;
const ICON = 36, FONT = 24, LINE = 24, PADDING = 24;
const GAP = 10, JOIN = 36;
const font = new URL('./NoitaPixel2.woff2', import.meta.url);
if (!GlobalFonts.registerFromPath(fileURLToPath(font), 'Bartender Card')) throw new Error('Cannot load the Bartender display font.');
const fontStyle = FONT + 'px "Bartender Card"';
const measure = createCanvas(1, 1).getContext('2d');
measure.font = fontStyle;
const images = new Map();

function layout(names) {
  const slot = (WIDTH - PADDING * 2 - JOIN * (names.length - 1)) / names.length;
  return names.map(name => {
    const lines = [];
    let line = '';
    for (const word of name.split(/\s+/)) {
      const next = line ? line + ' ' + word : word;
      if (line && measure.measureText(next).width > slot - ICON - GAP) {lines.push(line); line = word;}
      else line = next;
    }
    lines.push(line);
    const textWidth = Math.max(...lines.map(text => measure.measureText(text).width));
    if (textWidth + ICON + GAP > slot || lines.length > 2) throw new Error('Recipe caption exceeds banner: ' + name);
    return {lines, width: ICON + GAP + Math.ceil(textWidth)};
  });
}

export function captionRows(rule, byId) {
  return ['input','output'].map(side => {
    const materials = recipeCells(rule, side).map(id => {
      const material = byId.get(id);
      if (!material) throw new Error('Missing recipe material: ' + id);
      return material;
    });
    const slots = layout(materials.map(m => m.name));
    return materials.map((material, index) => ({material, ...slots[index]}));
  });
}

export async function drawBanner(rule, byId) {
  const canvas = createCanvas(WIDTH, BANNER_HEIGHT), ctx = canvas.getContext('2d');
  ctx.fillStyle = '#020618'; ctx.fillRect(0, 0, WIDTH, BANNER_HEIGHT);
  ctx.font = fontStyle; ctx.textBaseline = 'middle'; ctx.imageSmoothingEnabled = false;
  const rows = captionRows(rule, byId);
  const text = (label, x, y, color) => {ctx.fillStyle = color; ctx.fillText(label, x, y);};
  for (const [index, slots] of rows.entries()) {
    const y = index === 0 ? 34 : 110;
    const width = slots.reduce((sum, s) => sum + s.width, 0) + JOIN * (slots.length - 1);
    let x = Math.round((WIDTH - width) / 2);
    for (const [i, slot] of slots.entries()) {
      const file = slot.material.image_local || 'Material_' + slot.material.id + '.png';
      if (!images.has(file)) images.set(file, loadImage(fileURLToPath(new URL('../../src/data/images/materials/' + encodeURIComponent(file), import.meta.url))));
      const image = await images.get(file), scale = ICON / Math.max(image.width, image.height);
      const w = Math.round(image.width * scale), h = Math.round(image.height * scale);
      ctx.drawImage(image, x + Math.floor((ICON - w) / 2), y - Math.floor(h / 2), w, h);
      slot.lines.forEach((line, j) => text(line, x + ICON + GAP, y + (j - (slot.lines.length - 1) / 2) * LINE, '#e2e8f0'));
      x += slot.width;
      if (i < slots.length - 1) {
        text('+', x + (JOIN - ctx.measureText('+').width) / 2, y, '#a5b4c8');
        x += JOIN;
      }
    }
  }
  text('produces', Math.round((WIDTH - ctx.measureText('produces').width) / 2), 72, '#a5b4c8');
  return canvas;
}
