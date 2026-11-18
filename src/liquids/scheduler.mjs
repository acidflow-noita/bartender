import {LiquidRandom} from './native-rules.mjs';

export const CELL_REGION_SIZE = 64;

export function workerReactionPass(counter, forced = false) {
  counter++;
  const periodic = counter > 10;
  return {counter: periodic ? 0 : counter, normal: forced || periodic};
}

function shuffle(regions, random) {
  // 0x996a20 uses a forward shuffle with unbiased 15-bit draws.
  for (let i = 1; i < regions.length; i++) {
    const count = i + 1, limit = 32768 - 32768 % count;
    let sample;
    do {sample = random.next();} while (sample >= limit);
    const other = sample % count;
    [regions[i], regions[other]] = [regions[other], regions[i]];
  }
}

export class CellReactionScheduler {
  constructor(width, height, seed = 1) {
    this.width = width; this.height = height;
    this.columns = Math.ceil(width / CELL_REGION_SIZE);
    this.rows = Math.ceil(height / CELL_REGION_SIZE);
    const count = this.columns * this.rows;
    this.cellRegion = new Uint16Array(width * height);
    for (let y = 0; y < height; y++) {
      const row = Math.floor(y / CELL_REGION_SIZE) * this.columns;
      for (let column = 0; column < this.columns; column++) {
        const x = column * CELL_REGION_SIZE;
        this.cellRegion.fill(row + column, y * width + x, y * width + Math.min(width, x + CELL_REGION_SIZE));
      }
    }
    this.pending = new Uint8Array(count);
    this.counters = new Uint8Array(count);
    this.normal = new Uint8Array(count);
    this.order = Array.from({length: count}, (_, i) => i);
    this.shuffleRandom = new LiquidRandom(seed);
    this.cursor = 0;
    shuffle(this.order, this.shuffleRandom);
  }

  region(index) {
    return this.cellRegion[index];
  }

  mark(index) {
    if (index >= 0 && index < this.width * this.height) this.pending[this.region(index)] = 1;
  }

  advance(random, forceAll = false) {
    this.normal.fill(0);
    // 0x7269c3 wakes one region from a shuffled sweep of the loaded area.
    const swept = this.order[this.cursor++];
    this.pending[swept] = 1;
    if (this.cursor === this.order.length) {
      this.cursor = 0;
      shuffle(this.order, this.shuffleRandom);
    }
    const active = [];
    for (let region = 0; region < this.pending.length; region++) {
      if (forceAll || this.pending[region]) active.push(region);
    }
    // 0x7271cb also forces one active region on every world update.
    const selected = active[random.integer(active.length - 1)];
    for (const region of active) {
      const pass = workerReactionPass(this.counters[region], forceAll || region === swept || region === selected);
      this.counters[region] = pass.counter;
      this.normal[region] = Number(pass.normal);
    }
    this.pending.fill(0);
    return {swept, selected, active};
  }

  isNormal(index) {return this.normal[this.region(index)] !== 0;}
}
