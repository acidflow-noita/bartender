// Noitamap's Holy Mountain pool filter samples the already enlarged pixel art.
// These separable tables map physical display pixels back to the current tank.
class SampleAxis {
  constructor(cells, pixels, stride, horizontal) {
    this.cells = cells;
    this.pixels = pixels;
    this.stride = stride;
    this.horizontal = horizontal;
    this.original = new Int32Array(pixels);
    this.displaced = new Int32Array(pixels);
    this.first = new Int32Array(pixels);
    this.second = new Int32Array(pixels);
    this.fraction = new Float64Array(pixels);
    this.end = new Int32Array(pixels);
    this.cellEnd = new Int32Array(cells);
    for (let p = 0; p < pixels; p++) {
      const cell = Math.floor((p + .5) * cells / pixels);
      this.original[p] = cell * stride;
      this.cellEnd[cell] = p + 1;
    }
  }

  update(phase, strength) {
    const {cells, pixels, stride, horizontal, original} = this;
    for (let p = 0; p < pixels; p++) {
      const world = (p + .5) * cells / pixels;
      const offset = strength * (horizontal ? .854 * Math.sin(phase + world * (50 / 427))
        : -.484 * Math.cos(phase + 50 - world * (50 / 242)));
      const displaced = world + offset;
      this.displaced[p] = displaced >= 0 && displaced < cells ? Math.floor(displaced) * stride : -1;
      const screen = p + offset * pixels / cells;
      const first = Math.floor(screen);
      const t = Math.max(0, Math.min(1, (screen - first - .2) / .6));
      const weight = t * t * (3 - 2 * t);
      const a = original[first] ?? -1, b = original[first + 1] ?? -1;
      this.first[p] = weight === 1 ? b : a;
      this.second[p] = weight === 0 ? a : b;
      this.fraction[p] = this.first[p] === this.second[p] ? 0 : weight;
    }
    // Adjacent display pixels often have exactly the same guarded samples.
    // Coalesce them before the color pass, especially on high-DPI screens.
    for (let p = pixels - 1; p >= 0; p--) {
      const q = p + 1;
      const repeat = q < pixels && original[p] === original[q] && this.displaced[p] === this.displaced[q]
        && this.first[p] === this.first[q] && this.second[p] === this.second[q] && this.fraction[p] === this.fraction[q];
      this.end[p] = repeat ? this.end[q] : q;
    }
  }
}

export class TankRefraction {
  constructor(width, height) {
    this.width = width; this.height = height;
    this.staticEnd = new Int32Array(width * height);
    this.staticRows = new Uint8Array(height);
    this.taps = new Int32Array(4); this.weights = new Float64Array(4);
    this.resize(width, height);
  }

  resize(width, height) {
    this.x = new SampleAxis(this.width, width, 1, true);
    this.y = new SampleAxis(this.height, height, this.width, false);
    this.phase = -1;
    this.strength = 0;
    this.reduced = width < this.width || height < this.height;
  }

  // At reduced resolution a display pixel can straddle a shoreline or an air hole.
  liquidFootprint(px, py, mask) {
    const x0 = Math.floor(px * this.width / this.x.pixels), x1 = Math.ceil((px + 1) * this.width / this.x.pixels);
    const y0 = Math.floor(py * this.height / this.y.pixels), y1 = Math.ceil((py + 1) * this.height / this.y.pixels);
    if (x1 - x0 > 32 || y1 - y0 > 32) return false;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (!mask[y * this.width + x]) return false;
    return true;
  }

  // Return a single source cell, or fill four valid display-space taps for a transition.
  sample(px, py, mask) {
    const {x, y} = this, original = x.original[px] + y.original[py];
    if (!this.strength || !mask[original]) return original;
    const u = x.displaced[px], v = y.displaced[py];
    if (u < 0 || v < 0 || !mask[u + v] || (this.reduced && !this.liquidFootprint(px, py, mask))) return original;
    const x0 = x.first[px], x1 = x.second[px], y0 = y.first[py], y1 = y.second[py];
    if (x0 === x1 && y0 === y1) return x0 >= 0 && y0 >= 0 && mask[x0 + y0] ? x0 + y0 : original;
    const fx = x.fraction[px], fy = y.fraction[py], {taps, weights} = this;
    if (x0 === x1 || y0 === y1) {
      const a = x0 < 0 || y0 < 0 ? -1 : y0 + x0, b = x1 < 0 || y1 < 0 ? -1 : y1 + x1;
      if (!mask[a]) return mask[b] ? b : original;
      if (!mask[b]) return a;
      const fraction = x0 === x1 ? fy : fx;
      taps[0] = a; taps[1] = b;
      weights[0] = 1 - fraction; weights[1] = fraction;
      this.tapCount = 2;
      return -1;
    }
    this.tapCount = 4;
    taps[0] = x0 < 0 || y0 < 0 ? -1 : y0 + x0;
    taps[1] = x1 < 0 || y0 < 0 ? -1 : y0 + x1;
    taps[2] = x0 < 0 || y1 < 0 ? -1 : y1 + x0;
    taps[3] = x1 < 0 || y1 < 0 ? -1 : y1 + x1;
    weights[0] = (1 - fx) * (1 - fy); weights[1] = fx * (1 - fy);
    weights[2] = (1 - fx) * fy; weights[3] = fx * fy;
    let first = -1, multiple = false;
    for (let k = 0; k < 4; k++) {
      if (!mask[taps[k]]) {weights[k] = 0; continue;}
      if (!weights[k]) continue;
      if (first === -1) first = taps[k]; else if (first !== taps[k]) multiple = true;
    }
    return multiple ? -1 : first >= 0 ? first : original;
  }

  draw(source, output, mask, seconds, strength = 1) {
    if (!strength && this.x.pixels === this.width && this.y.pixels === this.height) {
      this.strength = 0; this.phase = -1;
      output.set(source);
      return;
    }
    const phase = (seconds % (Math.PI / 5)) * 10;
    if (phase !== this.phase || strength !== this.strength) {
      this.x.update(phase, strength); this.y.update(phase, strength);
      this.phase = phase; this.strength = strength;
    }
    const pixels = new Uint32Array(source.buffer, source.byteOffset, source.length / 4);
    const result = new Uint32Array(output.buffer, output.byteOffset, output.length / 4);
    const {x, y, taps, weights, staticEnd, staticRows} = this;
    const width = x.pixels;
    // Air and solid spans have one exact color at every display scale.
    // Store their right edge once in tank space, then copy each span in one pass.
    for (let row = 0, index = 0; row < this.height; row++) {
      let fixed = true;
      for (let col = 0; col < this.width;) {
        if (strength && mask[index]) {staticEnd[index++] = 0; fixed = false; col++; continue;}
        const start = index, color = pixels[index];
        do {index++; col++;} while (col < this.width && (!strength || !mask[index]) && pixels[index] === color);
        staticEnd.fill(x.cellEnd[col - 1], start, index);
      }
      staticRows[row] = Number(fixed);
    }
    for (let py = 0; py < y.pixels;) {
      const row = py * width, sourceRow = y.original[py];
      for (let px = 0; px < width;) {
        const dest = row + px, original = sourceRow + x.original[px];
        let end = staticEnd[original], color;
        if (end > px) {
          color = pixels[original];
        } else {
          const cell = this.sample(px, py, mask);
          if (cell >= 0) color = pixels[cell];
          else {this.mix(source, output, dest, taps, weights); color = result[dest];}
          end = this.reduced ? px + 1 : x.end[px];
        }
        if (end - px > 12) result.fill(color, dest, row + end);
        else for (let i = dest; i < row + end; i++) result[i] = color;
        px = end;
      }
      const sourceY = sourceRow / this.width;
      const end = staticRows[sourceY] ? y.cellEnd[sourceY] : this.reduced ? py + 1 : y.end[py];
      for (let repeat = py + 1; repeat < end; repeat++) result.copyWithin(repeat * width, row, row + width);
      py = end;
    }
  }

  mix(source, output, dest, taps, weights) {
    let r = 0, g = 0, b = 0, alpha = 0, total = 0;
    for (let k = 0; k < this.tapCount; k++) {
      const w = weights[k];
      if (!w) continue;
      const at = taps[k] * 4, a = source[at + 3] * w;
      r += source[at] * a; g += source[at + 1] * a; b += source[at + 2] * a;
      alpha += a; total += w;
    }
    const i = dest * 4;
    if (!alpha) {output.fill(0, i, i + 4); return;}
    output[i] = r / alpha; output[i + 1] = g / alpha; output[i + 2] = b / alpha;
    output[i + 3] = alpha / total;
  }

  materialAt(wx, wy, mask, ids) {
    const px = Math.max(0, Math.min(this.x.pixels - 1, Math.floor(wx * this.x.pixels / this.width)));
    const py = Math.max(0, Math.min(this.y.pixels - 1, Math.floor(wy * this.y.pixels / this.height)));
    const cell = this.sample(px, py, mask);
    if (cell >= 0) return ids[cell];
    let best = 0, material = 0;
    for (let k = 0; k < this.tapCount; k++) {
      if (!this.weights[k]) continue;
      const id = ids[this.taps[k]];
      let contribution = 0;
      for (let j = 0; j < this.tapCount; j++) if (ids[this.taps[j]] === id) contribution += this.weights[j];
      if (contribution > best) {best = contribution; material = id;}
    }
    return material;
  }
}

// The original one-to-one canvas API also supplies hover IDs in place.
export function createTankRefraction(width, height) {
  const filter = new TankRefraction(width, height);
  const output = new Uint8ClampedArray(width * height * 4);
  const originalIds = new Uint16Array(width * height);
  return (pixels, ids, mask, tick) => {
    filter.draw(pixels, output, mask, tick / 60);
    pixels.set(output);
    originalIds.set(ids);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (mask[y * width + x]) ids[y * width + x] = filter.materialAt(x + .5, y + .5, mask, originalIds);
    }
  };
}
