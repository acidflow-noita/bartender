// Noita a0d9f9ca, CLiquidCell displacement helper 0x0070b200.
// This module contains recovered local rules. The browser world scheduler is
// separate: a matching random generator does not imply full-scene parity.
export class LiquidRandom {
  constructor(seed = 1) {
    this.state = seed >>> 0;
  }

  next() {
    this.state = (Math.imul(this.state, 214013) + 2531011) >>> 0;
    return (this.state >>> 16) & 0x7fff;
  }

  integer(maxInclusive) {
    return this.next() % (maxInclusive + 1);
  }
}

export function nativeFlag(value) {
  return value === true || value === 1 || value === '1';
}

// The native helper consumes a random sample before testing density, including
// equal-density and sand/sand pairs. Preserve that order and single precision.
export function canDisplaceLiquid(source, target, random) {
  if (random.integer(100) < 75) return false;
  if (nativeFlag(source.liquid_sand) && nativeFlag(target.liquid_sand)) return false;
  return Math.fround(source.density) > Math.fround(target.density);
}

// CLiquidCell attachment direction hash, 0x0070acc0. This does not consume the
// world's random stream. The native values 5 and 7 select side contacts; all
// other values select the cell above.
export function attachmentDirection(x, y) {
  let value = (x + 0x67577458 + Math.imul(y, 91)) | 0;
  value = (Math.imul((value >> 13) ^ value, 214013) + 2531011) | 0;
  const bucket = (((value >> ((x & 15) + 1)) ^ value) & 0x7fff) % 3;
  const direction = (y & 1) === 0 ? bucket + 7 : 5 - bucket;
  return direction === 5 ? 1 : direction === 7 ? -1 : 0;
}

// The two native material branches intentionally use different comparisons.
export function allowsSandSlide(viscosity, random) {
  return viscosity < 100 && random.integer(100) < viscosity;
}

export function allowsSlimeSlide(viscosity, random) {
  return viscosity >= 100 || random.integer(100) >= viscosity;
}
