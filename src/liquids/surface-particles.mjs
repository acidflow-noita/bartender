import {DT, RNG_SCALE, NoitaRandom, EmissionRandom, stepParticle, particleQuad, particleGlowQuad} from './particle-motion.mjs';
import {packedMaterialColor} from './materials.mjs';

const f = Math.fround;

// Noita checks the path in one-cell increments. Liquid motes disappear on
// contact with a liquid or solid. Other cosmetic materials can bounce.
function travel(world, p, oldX, oldY, rng) {
  const dx = p.x - p.lastCheckX, dy = p.y - p.lastCheckY;
  const distance = Math.hypot(dx, dy), steps = Math.min(60, Math.floor(distance + .5));
  if (p.x < 0 || p.x >= world.width || p.y < 0 || p.y >= world.height) return false;
  if (!steps) return true;
  const ux = dx / distance, uy = dy / distance;
  let x = oldX, y = oldY;
  for (let n = 0; n < steps; n++) {
    const nextX = f(x + ux), nextY = f(y + uy);
    const column = Math.trunc(nextX), row = Math.trunc(nextY);
    if (column < 0 || row < 0 || column >= world.width || row >= world.height) return false;
    const id = world.cells[row * world.width + column], kind = world.kind[id];
    if (id === 65535 || kind === 1 || kind === 3) {
      if (!p.canBounce) return false;
      if (Math.abs(ux) > Math.abs(uy)) p.vx = -p.vx; else p.vy = -p.vy;
      if (Math.abs(p.vx) < 10) p.vx = f(p.vx + rng.float(-10, 10));
      const damping = rng.float(.1, .3);
      p.vx = f(p.vx * damping); p.vy = f(p.vy * damping);
      const speed = Math.hypot(p.vx, p.vy);
      if (p.life > 1 && speed < 40) p.life = rng.float(.5, 1.5);
      p.canBounce = speed >= 10;
      p.x = x; p.y = y; p.prevX = oldX; p.prevY = oldY;
      return true;
    }
    p.lastCheckX = column; p.lastCheckY = row;
    x = nextX; y = nextY;
  }
  return true;
}

export class SurfaceParticles {
  constructor(world) {
    const ids = new Map(world.materials.flatMap((m, id) => m ? [[m.initial_id, id]] : []));
    this.effects = world.materials.map(material => {
      const effect = material?.particle_effect;
      if (!effect || !ids.has(effect.m_material_id)) return null;
      return {...effect, material: ids.get(effect.m_material_id)};
    });
    this.reset(world);
  }

  reset(world) {
    this.generation = world.random;
    // Rendering owns both streams so hovering and image loads cannot affect physics.
    this.random = new NoitaRandom(((world.seed ?? 1) % 2147483646) + 1);
    this.ranges = new EmissionRandom(world.seed);
    this.items = [];
    this.poolSizes = [0, 0, 0];
    this.tick = world.tick;
    this.time = 0;
  }

  advance(world, artwork) {
    if (this.generation !== world.random) this.reset(world);
    if (this.tick === world.tick) return;
    this.tick = world.tick;
    let live = 0;
    this.poolSizes.fill(0);
    for (const p of this.items) {
      const x = p.x, y = p.y;
      if (stepParticle(p, this.time) && p.alpha > 0 && travel(world, p, x, y, this.random)) {
        this.items[live++] = p;
        this.poolSizes[p.pool]++;
      }
    }
    this.items.length = live;
    this.time = f(this.time + DT);
    // 0x724969 collects exposed material cells. 0x724480 emits at y - 1.
    const {width, cells} = world;
    for (let i = width; i < cells.length; i++) {
      if (cells[i - width] !== 0) continue;
      const effect = this.effects[cells[i]];
      if (!effect) continue;
      const {min, max} = effect.count;
      const count = min === max ? min : Math.min(min, max) + this.ranges.next() % (Math.abs(max - min) + 1);
      for (let n = 0; n < count; n++) {
        if (f(this.random.next() * RNG_SCALE) > effect.probability) continue;
        const {start, end} = effect.vel_random;
        const vy = f(effect.vel.y + this.ranges.range(Math.min(start.y, end.y), Math.max(start.y, end.y)));
        const vx = f(effect.vel.x + this.ranges.range(Math.min(start.x, end.x), Math.max(start.x, end.x)));
        const material = world.materials[effect.material];
        const pool = material.gfx_glow > 0 ? 2 : Number(!effect.render_back);
        if (this.poolSizes[pool] >= 100000) continue;
        const life = this.random.float(effect.lifetime.min, effect.lifetime.max);
        this.random.integer(0, 100); // Constructor draw before the on-grid flag is set.
        if (life <= 0) continue;
        const origin = i - width, x = origin % width + .5, y = Math.floor(origin / width) + .5;
        const color = packedMaterialColor(effect.color) || artwork.color(effect.material, origin);
        this.poolSizes[pool]++;
        this.items.push({x, y, prevX: x, prevY: y, lastCheckX: x, lastCheckY: y, vx, vy,
          gx: effect.gravity.x, gy: effect.gravity.y, airflowForce: effect.airflow_force, airflowScale: effect.airflow_scale,
          friction: effect.friction, alpha: f((color >>> 24) / 255), fadeRate: effect.fade_based_on_lifetime ? f(-1 / life) : 0,
          age: 0, life, color, pool, cellType: material.cell_type, canBounce: material.cell_type !== 'liquid', back: effect.render_back,
          onGrid: effect.render_on_grid, drawLong: effect.draw_as_long, singleWidth: effect.particle_single_width,
          glow: material.gfx_glow > 0, glowColor: packedMaterialColor(material.gfx_glow_color) || color});
      }
    }
  }

  paint(width, height, body, halo, stamp) {
    // Draw background particles behind the material's existing alpha.
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      if (p.back) raster(width, height, particleQuad(p), body, p.color, true);
    }
    for (const p of this.items) {
      if (!p.back) raster(width, height, particleQuad(p), body, p.color, false);
      if (p.glow && stamp) raster(width, height, particleGlowQuad(p), halo, p.glowColor, false, stamp);
    }
  }
}

function raster(width, height, quad, target, color, behind, stamp) {
  if (quad.alpha <= 0) return;
  const {x, y, length, cosine, sine, alpha} = quad, h = quad.height ?? 1;
  const x1 = x + cosine * length, y1 = y + sine * length, x2 = x - sine * h, y2 = y + cosine * h;
  const left = Math.max(0, Math.floor(Math.min(x,x1,x2,x1 - sine*h)));
  const right = Math.min(width, Math.ceil(Math.max(x,x1,x2,x1 - sine*h)));
  const top = Math.max(0, Math.floor(Math.min(y,y1,y2,y1 + cosine*h)));
  const bottom = Math.min(height, Math.ceil(Math.max(y,y1,y2,y1 + cosine*h)));
  const r = (color >>> 16) & 255, g = (color >>> 8) & 255, b = color & 255;
  for (let row = top; row < bottom; row++) for (let col = left; col < right; col++) {
    const dx = col + .5 - x, dy = row + .5 - y;
    const u = (dx * cosine + dy * sine) / length, v = (dy * cosine - dx * sine) / h;
    if (u < 0 || v < 0 || u >= 1 || v >= 1) continue;
    if (stamp) {
      const texel = stamp.pixels[Math.floor(v * stamp.height) * stamp.width + Math.floor(u * stamp.width)];
      const a = alpha * (texel >>> 24) / (255 * 255), pos = (row * width + col) * 3;
      target[pos] += r * ((texel >>> 16) & 255) * a;
      target[pos + 1] += g * ((texel >>> 8) & 255) * a;
      target[pos + 2] += b * (texel & 255) * a;
    } else {
      const pos = (row * width + col) * 4, dst = target[pos + 3] / 255;
      const a = behind ? alpha * (1 - dst) : alpha, d = behind ? dst : dst * (1 - alpha);
      const total = a + d;
      target[pos] = Math.round((r * a + target[pos] * d) / total);
      target[pos + 1] = Math.round((g * a + target[pos + 1] * d) / total);
      target[pos + 2] = Math.round((b * a + target[pos + 2] * d) / total);
      target[pos + 3] = Math.round(total * 255);
    }
  }
}
