import {EMPTY, WALL} from './engine.mjs';
import {MaterialArtwork} from './artwork.mjs';
import {SurfaceParticles} from './surface-particles.mjs';
import {TankRefraction} from './refraction.mjs';
import {LiquidRandom} from './native-rules.mjs';
import {resolvedColor} from './stains.mjs';
import {CellGlow, emissionProfile, cellEmission, cellAlpha, renderCellBodies} from './appearance.mjs';

const WALL_COLOR = 0xff59697c;
const WARM_ZONE = '#e0662a', COLD_ZONE = '#3b9fe0';

function outlineRegion(context, mask, width, height, color) {
  context.beginPath(); context.strokeStyle = color; context.lineWidth = .35;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = y * width + x;
    if (!mask[index]) continue;
    if (x === 0 || !mask[index - 1]) {context.moveTo(x, y); context.lineTo(x, y + 1);}
    if (x === width - 1 || !mask[index + 1]) {context.moveTo(x + 1, y); context.lineTo(x + 1, y + 1);}
    if (y === 0 || !mask[index - width]) {context.moveTo(x, y); context.lineTo(x + 1, y);}
    if (y === height - 1 || !mask[index + width]) {context.moveTo(x, y + 1); context.lineTo(x + 1, y + 1);}
  }
  context.stroke();
}

// Keep the cell alpha through presentation. A glow contributes its own coverage
// so the regular screen blend over the tank's black CSS background still holds.
export function composeTankPixels(bodies, history, pixels) {
  pixels.set(bodies);
  for (let at = 0, light = 0; at < pixels.length; at += 4, light += 3) {
    const g = Math.max(history[light], history[light + 1], history[light + 2]) - .008;
    if (g <= 0) continue;
    const a = bodies[at + 3] / 255, coverage = a + (1 - a) * g;
    for (let channel = 0; channel < 3; channel++) {
      const base = bodies[at + channel] * a;
      const glow = Math.max(0, history[light + channel] - .008);
      pixels[at + channel] = (base + (255 - base) * glow) / coverage;
    }
    pixels[at + 3] = coverage * 255;
  }
}

export function minaReferenceBounds({width, height}) {
  if (width < 10 || height < 20) return null;
  // Keep the 8 by 18 game-pixel box used by Digging.
  return {x: width - 9, y: height - 19, width: 8, height: 18};
}

export function createLiquidRenderer(canvas, world) {
  canvas.width = world.width; canvas.height = world.height;
  const context = canvas.getContext('2d', {alpha: true});
  if (!context) throw new Error('This browser does not support a 2D canvas.');
  context.imageSmoothingEnabled = false;
  const image = context.createImageData(world.width, world.height);
  const foreground = new Uint8Array(world.width * world.height * 4);
  const bodies = new Uint8Array(foreground.length);
  const displayCells = new Uint16Array(world.cells.length);
  const emission = new Uint8Array(world.width * world.height * 3);
  const glow = new CellGlow(world.width, world.height);
  const profiles = world.materials.map(emissionProfile);
  const gasCoverage = new Uint8Array(world.cells.length);
  const liquidMask = new Uint8Array(world.cells.length);
  const particleLight = new Uint8ClampedArray(emission.length);
  const particles = new SurfaceParticles(world);
  const refract = new TankRefraction(world.width, world.height);
  const view = canvas.ownerDocument?.defaultView;
  const motion = view?.matchMedia?.('(prefers-reduced-motion: reduce)');
  let output = context.createImageData(world.width, world.height);
  let zoomActive = false;
  const referenceBounds = minaReferenceBounds(world);
  let reference = null, referenceFailed = false;
  let disposed = false, lastCursor = null;
  let generation = world.random;
  const artwork = new MaterialArtwork(world, () => draw(lastCursor));
  const defaultColor = world.sampleColor;
  world.sampleColor = (id, origin) => artwork.pigment(id, origin);
  const draw = (cursor = null) => {
    lastCursor = cursor;
    if (generation !== world.random) {
      glow.reset(); particles.reset(world); generation = world.random;
    }
    const pixels = image.data;
    const flicker = new LiquidRandom((world.seed ?? 1) + (world.tick ?? 0));
    let zones = 0;
    for (let i = 0; i < world.cells.length; i++) {
      const id = world.cells[i], offset = i * 4, material = world.materials[id];
      const origin = world.colorOrigin?.[i] ?? i, colorId = world.colorMaterial?.[i] || id;
      let color = id === WALL ? WALL_COLOR : id === EMPTY ? 0
        : resolvedColor(world.stain?.[i]) ?? (world.formationColor?.[i] || artwork.color(colorId, origin));
      const age = world.age?.[i] ?? 0;
      const burning = !!world.burning?.[i] && world.processes !== false;
      const row = material?.graphics?.fire_colors_index ?? 0;
      const flame = burning && material.cell_type === 'fire';
      if (burning) {
        const paletteColor = flame ? artwork.flame(age, row) : artwork.burning(row, flicker.next());
        color = paletteColor ?? color;
      }
      foreground[offset] = (color >>> 16) & 255;
      foreground[offset + 1] = (color >>> 8) & 255;
      foreground[offset + 2] = color & 255;
      foreground[offset + 3] = color >>> 24;
      const weight = cellAlpha(material, color >>> 24, age);
      gasCoverage[i] = weight;
      let packed = id !== EMPTY && id !== WALL ? cellEmission(profiles[id], foreground, offset, weight) : 0;
      if (flame && (age >= 15 || !profiles[id].factor)) packed = artwork.flameGlow(age, row, color);
      else if (burning && !profiles[id].factor) packed = (color >>> 2) & 0x3f3f3f;
      emission[i * 3] = (packed >>> 16) & 255;
      emission[i * 3 + 1] = (packed >>> 8) & 255;
      emission[i * 3 + 2] = packed & 255;
      if (material?.cell_type === 'fire' && material.gfx_glow > 0) {
        emission[i * 3] >>= 1;
        emission[i * 3 + 1] >>= 1;
        emission[i * 3 + 2] >>= 1;
      }
      if (world.warmth?.[i]) zones |= 1;
      if (world.cold?.[i]) zones |= 2;
    }
    renderCellBodies(world, foreground, bodies, displayCells, liquidMask, gasCoverage);
    const hasParticles = particles.items.length > 0;
    if (hasParticles) {
      particleLight.fill(0);
      particles.paint(world.width, world.height, bodies, particleLight, artwork.image('particleGlow'));
    }
    const history = glow.resolve(emission, world.tick, hasParticles ? particleLight : null);
    composeTankPixels(bodies, history, pixels);
    const time = Math.floor((world.tick ?? 0) / 2) / 30;
    const strength = zoomActive && !motion?.matches ? Math.min(1, time / .14) : 0;
    refract.draw(pixels, output.data, liquidMask, time, strength);
    context.putImageData(output, 0, 0);
    if (zones & 1) outlineRegion(context, world.warmth, world.width, world.height, WARM_ZONE);
    if (zones & 2) outlineRegion(context, world.cold, world.width, world.height, COLD_ZONE);
    if (reference) context.drawImage(reference, referenceBounds.x, referenceBounds.y, referenceBounds.width, referenceBounds.height);
    if (cursor) {
      const x = Math.floor(cursor.x), y = Math.floor(cursor.y);
      context.strokeStyle = '#07111c'; context.lineWidth = .6;
      context.strokeRect(x, y, 1, 1);
      context.strokeStyle = '#fff'; context.lineWidth = .2;
      context.strokeRect(x, y, 1, 1);
      context.strokeStyle = '#f3f6fa'; context.lineWidth = .6;
      context.beginPath(); context.arc(cursor.x + .5, cursor.y + .5, cursor.radius + .5, 0, Math.PI * 2); context.stroke();
    }
  };
  const resize = entry => {
    if (disposed) return;
    const rect = entry?.contentRect ?? canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const box = entry?.devicePixelContentBoxSize?.[0];
    const ratio = view?.devicePixelRatio || 1;
    const cssW = Math.max(1, Math.round(rect.width * ratio)), cssH = Math.max(1, Math.round(rect.height * ratio));
    // Some browsers report a CSS-sized device box when the page uses a scaled display.
    const w = box?.inlineSize > 0 && Math.abs(box.inlineSize - cssW) <= 1 ? box.inlineSize : cssW;
    const h = box?.blockSize > 0 && Math.abs(box.blockSize - cssH) <= 1 ? box.blockSize : cssH;
    // Match the map's bounded presentation surface on very large displays.
    const scale = Math.min(1, 2048 / w, 2048 / h, Math.sqrt(4194304 / (w * h)));
    const width = Math.max(1, Math.floor(w * scale)), height = Math.max(1, Math.floor(h * scale));
    const active = rect.width / world.width >= (zoomActive ? .5 : .75);
    if (width === canvas.width && height === canvas.height && active === zoomActive) return;
    zoomActive = active;
    canvas.width = width; canvas.height = height;
    context.imageSmoothingEnabled = false;
    context.setTransform(width / world.width, 0, 0, height / world.height, 0, 0);
    output = context.createImageData(width, height);
    refract.resize(width, height);
    draw(lastCursor);
  };
  const onResize = () => resize();
  const onMotion = () => draw(lastCursor);
  const observer = view?.ResizeObserver ? new view.ResizeObserver(entries => resize(entries[0])) : null;
  if (observer) {
    try {observer.observe(canvas, {box: 'device-pixel-content-box'});} catch {observer.observe(canvas);}
  }
  view?.addEventListener('resize', onResize);
  motion?.addEventListener?.('change', onMotion);
  resize();
  const referenceReady = referenceBounds ? (async () => {
    try {
      const asset = new Image(); asset.src = '/liquids/mina_outline.png'; await asset.decode();
      if (disposed) return;
      reference = asset;
    } catch {referenceFailed = true;}
    if (!disposed) draw(lastCursor);
  })() : Promise.resolve();
  return {
    draw,
    displayCells,
    materialAt: (x, y) => refract.materialAt(x, y, liquidMask, displayCells),
    preload: id => artwork.preload(id),
    advance: () => particles.advance(world, artwork),
    get failed() {return [...artwork.failures];},
    get referenceFailed() {return referenceFailed;},
    get ready() {return Promise.all([...artwork.loads.values(), referenceReady]).then(() => ({failed: [...artwork.failures]}));},
    dispose() {
      disposed = true;
      observer?.disconnect(); view?.removeEventListener('resize', onResize);
      motion?.removeEventListener?.('change', onMotion);
      world.sampleColor = defaultColor; artwork.dispose();
    },
  };
}
