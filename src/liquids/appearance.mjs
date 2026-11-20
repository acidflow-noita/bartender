import {packedMaterialColor} from './materials.mjs';

const f32 = Math.fround;
const clamp = value => Math.max(0, Math.min(1, value));

export function byteRound(value) {
  if (value <= 0) return 0;
  if (value >= 255) return 255;
  const whole = Math.floor(value), fraction = value - whole;
  return whole + Number(fraction > .5 || (fraction === .5 && (whole & 1)));
}

const unitBytes = Float32Array.from({length: 256}, (_, i) => i / 255);
const roundedByte = new Uint8ClampedArray(1);
function unorm(value) {
  roundedByte[0] = value * 255;
  return unitBytes[roundedByte[0]];
}

export function emissionProfile(material) {
  const packed = packedMaterialColor(material?.gfx_glow_color);
  return {
    factor: f32(f32(Math.max(0, Number(material?.gfx_glow) || 0) / 255) * .25),
    override: packed ? [(packed >>> 16) & 255, (packed >>> 8) & 255, packed & 255] : null,
    gas: material?.cell_type === 'gas',
  };
}

// Native cell blitter 0x724c1c. Liquid emission does not use body alpha.
export function cellEmission(profile, color, offset = 0, alpha = color[offset + 3]) {
  if (!profile.factor) return 0;
  let packed = 0;
  for (let channel = 0; channel < 3; channel++) {
    let value = Math.trunc(f32((profile.override?.[channel] ?? color[offset + channel]) * profile.factor)) & 255;
    if (profile.gas) value = (value * alpha) >> 8;
    packed = (packed << 8) | value;
  }
  return packed;
}

export function cellAlpha(material, alpha, age = 0) {
  const remaining = Number(material?.lifetime) - age;
  if (material?.cell_type === 'gas' && material.lifetime > 0 && remaining < 100) {
    return Math.max(0, Math.trunc(f32(f32(remaining / 100) * alpha)));
  }
  return alpha;
}

// Native 0x722340 blends all four byte channels with a 256 denominator.
export function blendCellByte(source, destination, weight = 128) {
  return (source * weight + destination * (255 - weight)) >> 8;
}

const LIQUID = 1, JOIN_GAPS = 2, GAS = 4, FIRE = 8;

export function cellBodyModes(materials) {
  return Uint8Array.from(materials, material => {
    if (material?.cell_type === 'gas') return GAS;
    if (material?.cell_type === 'fire') return FIRE;
    if (material?.cell_type !== 'liquid' || material.liquid_sand || material.liquid_static
        || (material.type != null && material.type !== 'Liquid')) return 0;
    return material.graphics?.is_grass || material.graphics?.is_grass_hashed ? LIQUID : LIQUID | JOIN_GAPS;
  });
}

// Native 0x724580 joins short horizontal liquid gaps and draws falling streaks.
export function renderCellBodies(world, raw, output, visible, liquidMask, gasCoverage, modes = cellBodyModes(world.materials)) {
  const {width, height, cells} = world;
  const colors = new Uint32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
  const drawn = new Uint32Array(output.buffer, output.byteOffset, output.byteLength / 4);
  drawn.fill(0); visible.fill(0);
  const blocksSurface = id => id !== 0 && !(modes[id] & LIQUID);
  const copy = (from, to, id) => {drawn[to] = colors[from]; visible[to] = id;};
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = y * width + x, id = cells[index];
    const mode = modes[id], liquid = mode & LIQUID;
    const motion = world._motion?.[index] ?? 3;
    if (liquidMask) liquidMask[index] = Number(liquid && (motion === 3 || y >= height - 2));
    if (!id) continue;
    if (mode === GAS || mode === FIRE) {
      const alpha = mode === FIRE ? 128 : (gasCoverage?.[index] ?? raw[index * 4 + 3]);
      copy(index, index, alpha === 0 ? 0 : id);
      output[index * 4 + 3] = alpha;
      continue;
    }
    if ((mode & JOIN_GAPS) &&
      (motion === 2 || motion === 3) && x >= 2 && cells[index - 1] !== id && !blocksSurface(cells[index - 1])) {
      for (let distance = 2; distance <= 4 && distance <= x; distance++) {
        if (cells[index - distance] === id) {
          // The one-cell gap reads the intervening pixel. Wider gaps read the far endpoint.
          const reference = index - (distance === 2 ? 1 : distance);
          for (let channel = 0; channel < 4; channel++) {
            const blended = blendCellByte(raw[index * 4 + channel], output[reference * 4 + channel]);
            for (let at = index - distance; at < index; at++) output[at * 4 + channel] = blended;
          }
          visible.fill(id, index - distance, index);
          break;
        }
        if (blocksSurface(cells[index - distance])) break;
      }
    }
    if (liquid && motion === 8 && y < height - 2) {
      copy(index, index + width, id);
      if ((x & 1) === 0) copy(index, index + width * 2, id);
    }
    copy(index, index, id);
  }
}

// The eleven 1.5-pixel taps equal two sliding sums with half weights.
function blurAxis(source, target, width, height, vertical, lane) {
  const length = vertical ? height : width, lines = vertical ? width : height;
  const stride = vertical ? width * 3 : 3, lineStride = vertical ? 3 : width * 3;
  const coefficient = vertical ? 1 / 12.2 : .1;
  target.fill(0);
  for (let line = 0; line < lines; line++) for (let channel = 0; channel < 3; channel++) {
    const base = line * lineStride + channel;
    let first = length, last = -1;
    for (let n = 0, at = base; n < length; n++, at += stride) {
      const value = source[at];
      lane[n + 8] = value;
      if (value) {if (first === length) first = n; last = n;}
    }
    if (last < 0) continue;
    // Clamp the endpoints once per lane. Outside this interval all eleven taps are zero.
    lane.fill(lane[8], 0, 8);
    lane.fill(lane[length + 7], length + 8, length + 17);
    const start = Math.max(0, first - 8), end = Math.min(length, last + 9);
    let sum = 0, a = 0, b = 0, c = 0;
    for (let k = start; k <= start + 16; k++) sum += lane[k];
    for (let k = start + 2; k <= start + 14; k += 3) {
      a += lane[k]; b += lane[k + 1]; c += lane[k + 2];
    }
    for (let p = start, at = base + start * stride; p < end; p++, at += stride) {
      const value = f32((sum + a) * coefficient * .5);
      target[at] = vertical ? value : unorm(value);
      const entering = lane[p + 17];
      const next = a + (entering - lane[p + 2]);
      a = b; b = c; c = next;
      sum += entering - lane[p];
    }
  }
}

export class CellGlow {
  constructor(width, height) {
    this.width = width; this.height = height;
    const size = width * height * 3;
    this.history = new Float32Array(size);
    this.checkpoint = new Float32Array(size);
    this.horizontal = new Float32Array(size);
    this.vertical = new Float32Array(size);
    this.lane = new Float32Array(Math.max(width, height) + 17);
    this.previousSource = new Uint8Array(size);
    this.previousParticles = new Uint8Array(size);
    this.edges = new Float32Array(width * height);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const u = (x + .5) / width, v = 1 - (y + .5) / height;
      let weight = 1;
      if (u > .95) weight = 1 - (u - .95) * 2;
      else if (u < .05) weight = 1 - (.05 - u) * 2;
      if (v > .95) weight = 1 - (v - .95) * 2;
      else if (v < .05) weight = 1 - (.05 - v) * 2;
      this.edges[y * width + x] = weight;
    }
    this.reset();
  }

  reset() {
    this.history.fill(0); this.checkpoint.fill(0); this.previousSource.fill(0); this.previousParticles.fill(0);
    this.tick = null; this.active = false;
  }

  _step(source, previous, particles) {
    // post_glow1.frag and post_glow2.frag use RGBA8 targets.
    blurAxis(previous, this.horizontal, this.width, this.height, false, this.lane);
    blurAxis(this.horizontal, this.vertical, this.width, this.height, true, this.lane);
    let active = false;
    for (let cell = 0, i = 0; cell < this.edges.length; cell++) {
      const edge = this.edges[cell];
      for (let channel = 0; channel < 3; channel++, i++) {
        const old = this.vertical[i] * edge;
        const incoming = unitBytes[source[i]] * 4 + (particles ? unitBytes[particles[i]] * 2.5 : 0);
        const value = old || incoming ? unorm(incoming * .125 + old * .95 + incoming * .05) : 0;
        this.history[i] = value;
        if (value) active = true;
      }
    }
    this.active = active;
  }

  resolve(source, tick = 0, particles = null) {
    tick = Number.isFinite(tick) ? tick : 0;
    if (this.tick !== null && tick < this.tick) this.reset();
    if (tick === this.tick) {
      let changed = false;
      for (let i = 0; i < source.length && !changed; i++) {
        changed = source[i] !== this.previousSource[i] || (particles ? particles[i] : 0) !== this.previousParticles[i];
      }
      if (!changed) return this.history;
    }
    let occupied = this.active;
    for (let i = 0; i < source.length && !occupied; i++) occupied = !!(source[i] || particles?.[i]);
    if (!occupied) {
      this.checkpoint.fill(0); this.history.fill(0);
    } else if (tick === this.tick) {
      // Hover redraws can change the source, but cannot advance its history.
      this._step(source, this.checkpoint, particles);
    } else {
      const frames = this.tick === null ? 1 : Math.min(6, Math.max(1, tick - this.tick));
      for (let frame = 0; frame < frames; frame++) {
        this.checkpoint.set(this.history);
        this._step(source, this.checkpoint, particles);
      }
    }
    this.previousSource.set(source);
    if (particles) this.previousParticles.set(particles); else this.previousParticles.fill(0);
    this.tick = tick;
    return this.history;
  }
}

// post_final.frag screen blend, with neutral illumination for this material view.
export function compositeCellChannel(value, alpha, background, history = 0) {
  const coverage = alpha / 255;
  const base = value / 255 * coverage + background / 255 * (1 - coverage);
  const glow = Math.max(0, history - .008);
  const screen = clamp(base + glow - base * glow);
  return byteRound(clamp(Math.max(base + glow * .6 - .6, screen)) * 255);
}
