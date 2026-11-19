import {liquidTextureUrl, materialRGBA, textureOffset, WORLD_RENDER_IMAGES} from './materials.mjs';
import {pendingColor} from './stains.mjs';

const toARGB = (r, g, b, a) => ((a << 24) | (r << 16) | (g << 8) | b) >>> 0;
const quarter = color => (color >>> 2) & 0x3f3f3f;

export const browserImages = {
  async load(url) {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  },
  canvas: () => document.createElement('canvas'),
};

async function readImage(url, images) {
  const asset = await images.load(url);
  const canvas = images.canvas();
  canvas.width = asset.naturalWidth; canvas.height = asset.naturalHeight;
  const context = canvas.getContext('2d', {willReadFrequently: true});
  context.drawImage(asset, 0, 0);
  const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const pixels = new Uint32Array(canvas.width * canvas.height);
  for (let i = 0; i < pixels.length; i++) {
    const offset = i * 4;
    pixels[i] = toARGB(rgba[offset], rgba[offset + 1], rgba[offset + 2], rgba[offset + 3]);
  }
  return {pixels, width: canvas.width, height: canvas.height};
}

// The native palette sampler uses width * t, including its last-texel clamp.
function samplePalette(image, row, t) {
  const x = Math.min(image.width - 1, Math.max(0, Math.fround(t * image.width)));
  const index = row * image.width + Math.floor(x), fraction = x % 1;
  const a = image.pixels[index];
  if (!fraction) return a;
  const b = image.pixels[index + 1];
  const channel = shift => Math.trunc(((a >>> shift) & 255) * (1 - fraction) + ((b >>> shift) & 255) * fraction);
  return toARGB(channel(16), channel(8), channel(0), 255);
}

export class MaterialArtwork {
  constructor(world, invalidate, images = browserImages) {
    this.source = images;
    this.world = world;
    this.invalidate = invalidate;
    this.urls = world.materials.map(liquidTextureUrl);
    this.colors = world.materials.map(material => toARGB(...materialRGBA(material)));
    this.textures = [];
    this.offsetMaps = new Map();
    this.loads = new Map();
    this.failures = new Set();
    this.pending = 0;
    this.pendingPigments = false;
    this.redrawTimer = null;
    this.images = {};
  }

  load(url, accept) {
    if (!this.loads.has(url)) {
      this.pending++;
      const promise = readImage(url, this.source).then(image => {if (this.invalidate) accept(image);})
        .catch(() => this.failures.add(url)).finally(() => {
          if (--this.pending === 0 && this.invalidate) {
            if (this.pendingPigments) {
              // Deferred blends settle in microtasks after the texture promise.
              this.pendingPigments = false;
              clearTimeout(this.redrawTimer);
              this.redrawTimer = setTimeout(() => this.invalidate?.(), 0);
            } else this.invalidate();
          }
        });
      this.loads.set(url, promise);
    }
    return this.loads.get(url);
  }

  offsets(image, randomized) {
    const key = `${image.width},${image.height},${randomized}`;
    if (!this.offsetMaps.has(key)) {
      const {width, height} = this.world, map = new Uint32Array(width * height);
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        map[y * width + x] = textureOffset(x, y, image.width, image.height, randomized) / 4;
      }
      this.offsetMaps.set(key, map);
    }
    return this.offsetMaps.get(key);
  }

  preload(id) {
    const url = this.urls[id];
    if (!url) return Promise.resolve();
    return this.load(url, image => {
      for (let i = 1; i < this.urls.length; i++) if (this.urls[i] === url) {
        this.textures[i] = {pixels: image.pixels, offsets: this.offsets(image, !!this.world.materials[i].graphics.randomize_colors)};
      }
    });
  }

  color(id, origin) {
    const texture = this.textures[id];
    if (texture) return texture.pixels[texture.offsets[origin]];
    if (this.invalidate && this.urls[id] && !this.loads.has(this.urls[id])) void this.preload(id);
    return this.colors[id];
  }

  pigment(id, origin) {
    const url = this.urls[id];
    if (!url || this.textures[id] || this.failures.has(url)) return this.color(id, origin);
    this.pendingPigments = true;
    return pendingColor(this.preload(id).then(() => this.color(id, origin)));
  }

  image(name) {
    if (!this.images[name]) {
      const url = '/liquids/textures/' + WORLD_RENDER_IMAGES[name].split('/').at(-1);
      this.load(url, image => {
        if (name === 'fireGlow') {
          for (let i = 0; i < image.pixels.length; i++) image.pixels[i] = quarter(image.pixels[i]) | 0xff000000;
        }
        this.images[name] = image;
      });
    }
    return this.images[name];
  }

  flame(age, row) {
    const image = this.image('fire');
    if (!image) return undefined;
    const t = Math.fround(age / 40);
    return samplePalette(image, row, Math.fround(t * t));
  }

  flameGlow(age, row, color) {
    if (age >= 15) return quarter(color);
    const image = this.image('fireGlow');
    return image ? samplePalette(image, row, Math.fround(age / 40)) & 0xffffff : 0;
  }

  burning(row, sample) {
    const image = this.image('burning');
    return image?.pixels[row * image.width + sample % image.width];
  }

  dispose() {
    this.invalidate = null;
    clearTimeout(this.redrawTimer);
    this.textures.length = 0; this.offsetMaps.clear(); this.loads.clear();
  }
}
