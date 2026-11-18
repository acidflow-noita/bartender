const f = Math.fround;
export const DT = f(1 / 60);
export const RNG_SCALE = 4.656612875e-10;

// 0x00fdf530 (int16[256]); 0x00872560, the game's 3D simplex noise.
export const SIMPLEX_PERMUTATION = Object.freeze([
  151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7, 225, 140,
  36, 103, 30, 69, 142, 8, 99, 37, 240, 21, 10, 23, 190, 6, 148, 247, 120, 234,
  75, 0, 26, 197, 62, 94, 252, 219, 203, 117, 35, 11, 32, 57, 177, 33, 88, 237,
  149, 56, 87, 174, 20, 125, 136, 171, 168, 68, 175, 74, 165, 71, 134, 139, 48,
  27, 166, 77, 146, 158, 231, 83, 111, 229, 122, 60, 211, 133, 230, 220, 105,
  92, 41, 55, 46, 245, 40, 244, 102, 143, 54, 65, 25, 63, 161, 1, 216, 80, 73,
  209, 76, 132, 187, 208, 89, 18, 169, 200, 196, 135, 130, 116, 188, 159, 86,
  164, 100, 109, 198, 173, 186, 3, 64, 52, 217, 226, 250, 124, 123, 5, 202, 38,
  147, 118, 126, 255, 82, 85, 212, 207, 206, 59, 227, 47, 16, 58, 17, 182, 189,
  28, 42, 223, 183, 170, 213, 119, 248, 152, 2, 44, 154, 163, 70, 221, 153, 101,
  155, 167, 43, 172, 9, 129, 22, 39, 253, 19, 98, 108, 110, 79, 113, 224, 232,
  178, 185, 112, 104, 218, 246, 97, 228, 251, 34, 242, 193, 238, 210, 144, 12,
  191, 179, 162, 241, 81, 51, 145, 235, 249, 14, 239, 107, 49, 192, 214, 31,
  181, 199, 106, 157, 184, 84, 204, 176, 115, 121, 50, 45, 127, 4, 150, 254,
  138, 236, 205, 93, 222, 114, 67, 29, 24, 72, 243, 141, 128, 195, 78, 66, 215,
  61, 156, 180,
]);
const perm = new Uint8Array([...SIMPLEX_PERMUTATION, ...SIMPLEX_PERMUTATION]);
const gradients = [
  [1, 1, 0],
  [-1, 1, 0],
  [1, -1, 0],
  [-1, -1, 0],
  [1, 0, 1],
  [-1, 0, 1],
  [1, 0, -1],
  [-1, 0, -1],
  [0, 1, 1],
  [0, -1, 1],
  [0, 1, -1],
  [0, -1, -1],
];
function corner(x, y, z, index) {
  const t = 0.6 - x * x - y * y - z * z;
  if (t < 0) return 0;
  const g = gradients[index % 12];
  // Keep the original accumulation order (including the y-before-x dot product).
  return (g[1] * y + g[0] * x + g[2] * z) * t * t * t * t;
}
export function simplex3(x, y, z) {
  const s = (x + y + z) * (1 / 3);
  const i = Math.floor(x + s),
    j = Math.floor(y + s),
    k = Math.floor(z + s);
  const t = (i + j + k) * (1 / 6);
  const x0 = x - (i - t),
    y0 = y - (j - t),
    z0 = z - (k - t);
  let i1 = 0,
    j1 = 0,
    k1 = 0,
    i2 = 0,
    j2 = 0,
    k2 = 0;
  if (x0 >= y0) {
    if (y0 >= z0) {
      i1 = 1;
      i2 = 1;
      j2 = 1;
    } else if (x0 >= z0) {
      i1 = 1;
      i2 = 1;
      k2 = 1;
    } else {
      k1 = 1;
      i2 = 1;
      k2 = 1;
    }
  } else {
    if (y0 < z0) {
      k1 = 1;
      j2 = 1;
      k2 = 1;
    } else if (x0 < z0) {
      j1 = 1;
      j2 = 1;
      k2 = 1;
    } else {
      j1 = 1;
      i2 = 1;
      j2 = 1;
    }
  }
  const ii = i & 255,
    jj = j & 255,
    kk = k & 255;
  const n0 = corner(x0, y0, z0, perm[ii + perm[jj + perm[kk]]]);
  const n1 = corner(
    x0 - i1 + 1 / 6,
    y0 - j1 + 1 / 6,
    z0 - k1 + 1 / 6,
    perm[ii + i1 + perm[jj + j1 + perm[kk + k1]]],
  );
  const n2 = corner(
    x0 - i2 + 1 / 3,
    y0 - j2 + 1 / 3,
    z0 - k2 + 1 / 3,
    perm[ii + i2 + perm[jj + j2 + perm[kk + k2]]],
  );
  const n3 = corner(
    x0 - 1 + 0.5,
    y0 - 1 + 0.5,
    z0 - 1 + 0.5,
    perm[ii + 1 + perm[jj + 1 + perm[kk + 1]]],
  );
  return (n1 + n0 + n2 + n3) * 32;
}

// 0x008720c0. JS bitwise operations deliberately wrap to 32 bits.
export function coordinateHash(a, b, c) {
  a = ((a - b - c) ^ (c >>> 13)) >>> 0;
  b = ((b - a - c) ^ (a << 8)) >>> 0;
  c = ((c - a - b) ^ (b >>> 13)) >>> 0;
  a = ((a - b - c) ^ (c >>> 12)) >>> 0;
  b = ((b - a - c) ^ (a << 16)) >>> 0;
  c = ((c - a - b) ^ (b >>> 5)) >>> 0;
  a = ((a - b - c) ^ (c >>> 3)) >>> 0;
  b = ((b - a - c) ^ (a << 10)) >>> 0;
  return ((c - a - b) ^ (b >>> 15)) >>> 0;
}
export class NoitaRandom {
  constructor(state = 1) {
    this.state = state;
  }
  next() {
    this.state = (Math.trunc(this.state) * 16807) % 2147483647;
    if (this.state < 1) this.state += 2147483647;
    return this.state;
  }
  integer(min, max) {
    return min + Math.trunc((max - min + 1) * this.next() * RNG_SCALE);
  }
  float(min, max) {
    return f(f(f(this.next() * RNG_SCALE) * f(f(max) - f(min))) + f(min));
  }
  seed(x, y, worldSeed) {
    worldSeed >>>= 0;
    const salt = (worldSeed ^ 0x93262e6f) >>> 0;
    x += salt & 0xfff;
    y += (salt >>> 12) & 0xfff;
    const a = Math.trunc(x * 134217727) >>> 0;
    const b =
      Math.trunc(
        Math.abs(y) < 102400 && Math.abs(x) > 1
          ? (y * 3483.328 + a) * y
          : y * 134217727,
      ) >>> 0;
    this.state =
      (coordinateHash(a, b, worldSeed) / 4294967295) * 2147483639 + 1;
    if (this.state >= 2147483647) this.state *= 0.5;
    this.next();
    for (let i = worldSeed & 3; i > 0; i--) this.next();
    return this;
  }
}
export function proceduralRandomi(x, y, min, max, worldSeed = 0) {
  return new NoitaRandom().seed(x, y, worldSeed).integer(min, max);
}
export class EmissionRandom {
  constructor(state = 1) {
    this.state = state >>> 0;
  }
  next() {
    this.state = (Math.imul(this.state, 214013) + 2531011) >>> 0;
    return (this.state >>> 16) & 32767;
  }
  unit() {
    return f(this.next() / 32767);
  }
  range(min, max) {
    return f(f(this.unit() * f(f(max) - f(min))) + f(min));
  }
}

// 0x00713e20, no collision/attractor branch. Velocities are pixels/SECOND.
export function stepParticle(p, time, dt = DT) {
  p.age++;
  const nx = f(p.x + f(p.vx * dt)),
    ny = f(p.y + f(p.vy * dt));
  p.alpha = Math.min(1, Math.max(0, f(p.alpha + f(p.fadeRate * dt))));
  if (p.attractor > 0) {
    p.vx = f(p.vx + f(f(f(p.targetX - p.x) * dt) * p.attractor));
    p.vy = f(p.vy + f(f(f(p.targetY - p.y) * dt) * p.attractor));
  }
  p.vx = f(p.vx + f(p.gx * dt));
  p.vy = f(p.vy + f(p.gy * dt));
  if (p.airflowForce > 0) {
    const angle = f(
      f(simplex3(f(nx * p.airflowScale), f(ny * p.airflowScale), time)) *
        f(Math.PI),
    );
    const c = f(Math.cos(angle)),
      s = f(Math.sin(angle));
    p.vx = f(p.vx + f(f(c * 0) - f(s * p.airflowForce)));
    p.vy = f(f(f(c * p.airflowForce) + f(s * 0)) + p.vy);
  }
  if (p.friction !== 0) {
    p.vx = f(p.vx - f(f(p.vx * p.friction) * dt));
    p.vy = f(p.vy - f(f(p.vy * p.friction) * dt));
  }
  p.life = f(p.life - dt);
  const speed = f(Math.sqrt(f(f(p.vx * p.vx) + f(p.vy * p.vy))));
  const dx = f(p.x - nx),
    dy = f(p.y - ny);
  const distance = f(Math.sqrt(f(f(dx * dx) + f(dy * dy))));
  const tx = distance > 0 ? f(dx / distance) : 0,
    ty = distance > 0 ? f(dy / distance) : 0;
  p.x = nx;
  p.y = ny;
  p.prevX = f(f(f(tx * speed) * dt) + nx);
  p.prevY = f(ny + f(f(ty * speed) * dt));
  return p.life >= 0;
}

export function roundedCell(x) {
  return Math.floor(f(x + (x >= 0 ? 0.5 : -0.5)));
}

// 0x00711750 / 0x007113e0. Native points are quads, not GL_POINTS.
export function particleQuad(p) {
  const wide =
    !p.drawLong &&
    p.singleWidth === false &&
    (p.cellType === "gas" || p.cellType === "fire");
  const alpha =
    (Math.trunc(
      f(
        f(p.alpha * (p.drawLong && p.life < 1 ? p.life : wide ? 0.5 : 1)) * 255,
      ),
    ) &
      255) /
    255;
  if (!p.drawLong) {
    const width = wide ? 2 : 1;
    return {
      x: f((p.onGrid === false ? p.x : roundedCell(f(p.x + 0.5))) - width),
      y: f((p.onGrid === false ? p.y : roundedCell(f(p.y + 0.5))) - 1),
      cosine: 1,
      sine: 0,
      length: width,
      alpha,
    };
  }
  const dx = f(p.x - p.prevX),
    dy = f(p.y - p.prevY);
  const distance = f(Math.sqrt(f(f(dx * dx) + f(dy * dy))));
  const length = Math.min(f(distance + 1), 12);
  const angle =
    distance === 0 ? 0 : f(Math.atan2(f(dy / distance), f(dx / distance)));
  return {
    x: f((p.onGrid === false ? p.x : Math.trunc(f(p.x + 0.5))) - 1),
    y: f((p.onGrid === false ? p.y : Math.trunc(f(p.y + 0.5))) - 1),
    cosine: f(Math.cos(angle)),
    sine: f(Math.sin(angle)),
    length,
    alpha,
  };
}

// 0x00711db0 / 0x00711960. gfx_glow selects the glow particle pool; it is
// NOT a per-particle RGB multiplier here. Vertex alpha is packed to 8 bits.
export function particleGlowQuad(p) {
  const alpha = f(p.alpha * (p.life < 1 ? p.life : 1));
  const brightness = p.ultrabright ? (p.drawLong ? 3 : 50) : 1;
  const packedAlpha =
    (Math.trunc(
      f(f(f(alpha * f(p.drawLong ? 0.2 : 0.03)) * brightness) * 255),
    ) &
      255) /
    255;
  if (!p.drawLong)
    return {
      x: f((p.onGrid === false ? p.x : Math.trunc(f(p.x + 0.5))) - 12),
      y: f((p.onGrid === false ? p.y : Math.trunc(f(p.y + 0.5))) - 12),
      cosine: 1,
      sine: 0,
      length: 24,
      height: 24,
      alpha: packedAlpha,
    };
  const q = particleQuad(p);
  const low = f(f(q.length + 16) * -0.5),
    high = f(f(f(q.length + 16) + q.length) * 0.5);
  return {
    x: f(q.x + f(f(q.cosine * low) - f(q.sine * -8))),
    y: f(q.y + f(f(q.sine * low) + f(q.cosine * -8))),
    cosine: q.cosine,
    sine: q.sine,
    length: f(high - low),
    height: 16,
    alpha: packedAlpha,
    anchorX: q.x,
    anchorY: q.y,
    lowX: low,
    highX: high,
    lowY: -8,
    highY: 8,
  };
}
