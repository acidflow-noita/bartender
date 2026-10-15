// Noita Jan 25 2025, SHA256 a0d9f9ca...17d914. Native evidence:
// ray stepping / integer energy: ev_6e8a65bf... (0x656b10)
// 360 directions / raster selection: ev_f61bfc... (0x657960)
// See task/digging-native/explosion-rays-instructions.asm and evidence.json.
// This is a nominal, fresh, uniform terrain calculation, not a live-world
// simulation. Transcendentals use JavaScript Math followed by native f32
// rounding; exact platform libm agreement has not been runtime-validated.
const f32 = Math.fround;
const ORIGIN = Object.freeze([1024.5, 1024.5]);
const INT_MAX = 2147483647;
const MAX_RADIUS = 4096; // Supported input bound; the native ray cap is 2048².
const STEP_LIMIT = 2048;
const LENGTH_SQUARED_LIMIT = 0x400000;
const TWO_PI = f32(6.2831855);
const DEGREES_PER_RADIAN = 57.29577951308232;
const scenarios = new Map();
const traces = new Map();

function remember(cache, key, value, limit) {
  cache.delete(key);
  cache.set(key, value);
  if (cache.size > limit) cache.delete(cache.keys().next().value);
  return value;
}

const distanceSquared = (x, y) => {
  const dx = f32(x - ORIGIN[0]), dy = f32(y - ORIGIN[1]);
  return f32(f32(dy * dy) + f32(dx * dx));
};

function traceDirections(radius) {
  if (traces.has(radius)) return remember(traces, radius, traces.get(radius), 4);
  const directions = Array.from({length: 360}, (_, angleIndex) => {
    // 0x658741–0x658829: rotate (-radius, 0), add the float world origin,
    // then let the ray helper subtract it again before normalization.
    const angle = f32(f32(angleIndex / 360) * TWO_PI);
    const cosine = f32(Math.cos(angle)), sine = f32(Math.sin(angle));
    const endX = f32(ORIGIN[0] + f32(f32(cosine * -radius) - f32(sine * 0)));
    const endY = f32(ORIGIN[1] + f32(f32(sine * -radius) + f32(cosine * 0)));
    const dx = f32(endX - ORIGIN[0]), dy = f32(endY - ORIGIN[1]);
    const lengthSquared = f32(f32(dx * dx) + f32(dy * dy));
    const cap = Math.min(LENGTH_SQUARED_LIMIT, Math.trunc(f32(lengthSquared + 0.5)));
    const length = f32(Math.sqrt(lengthSquared));
    const stepX = length > 0 ? f32(dx / length) : 0;
    const stepY = length > 0 ? f32(dy / length) : 0;
    const contacts = [];
    let x = ORIGIN[0], y = ORIGIN[1], cellX = Math.trunc(x), cellY = Math.trunc(y), distance = 0;
    for (let step = 1; distance < cap; ++step) {
      x = f32(x + stepX);
      y = f32(y + stepY);
      distance = distanceSquared(x, y);
      // 0x656c66: step 2049 advances position, but does not visit a cell.
      if (step > STEP_LIMIT) break;
      const nextX = Math.trunc(x), nextY = Math.trunc(y);
      if (nextX !== cellX || nextY !== cellY) {
        contacts.push(distance);
        cellX = nextX;
        cellY = nextY;
      }
    }
    return {contacts, end: distance};
  });
  return remember(traces, radius, directions, 4);
}

function angularBin(x, y) {
  // 0x6597df–0x6598fd: atan2 receives normalized y, x; its result is f32.
  // The +179 offset and clamp (rather than wrapping) are intentional.
  const length = f32(Math.sqrt(f32(f32(y * y) + f32(x * x))));
  const angle = length === 0 ? 0 : f32(Math.atan2(f32(y / length), f32(x / length)));
  const degrees = angle * DEGREES_PER_RADIAN + 179;
  return Math.max(0, Math.min(359, Math.floor(degrees + (degrees >= 0 ? 0.5 : -0.5))));
}

function buildRows(summary, rays, hardness) {
  const rows = [];
  let removedPixelsMin = 0, removedPixelsMax = 0;
  const radiusSquared = f32(summary.sourceRadius * summary.sourceRadius);
  const maxCutoff = Math.max(...rays.map((ray) => ray.cutoffMaxSquared));
  const extent = Math.min(Math.ceil(summary.sourceRadius) - 1, Math.floor(Math.sqrt(maxCutoff)));
  for (let y = -extent; y <= extent; ++y) {
    const guaranteed = [], possible = [];
    let guaranteedStart = null, possibleStart = null;
    for (let x = -extent; x <= extent + 1; ++x) {
      const distance = x * x + y * y;
      let insideMin = false, insideMax = false;
      if (x <= extent && distance < radiusSquared && distance <= maxCutoff) {
        const ray = rays[angularBin(x, y)];
        if (ray.damage >= hardness) {
          insideMin = distance <= ray.cutoffMinSquared;
          insideMax = distance <= ray.cutoffMaxSquared;
        }
      }
      if (insideMin) {
        ++removedPixelsMin;
        if (guaranteedStart === null) guaranteedStart = x;
      } else if (guaranteedStart !== null) {
        guaranteed.push([guaranteedStart, x - 1]);
        guaranteedStart = null;
      }
      if (insideMax) {
        ++removedPixelsMax;
        if (possibleStart === null) possibleStart = x;
      } else if (possibleStart !== null) {
        possible.push([possibleStart, x - 1]);
        possibleStart = null;
      }
    }
    if (possible.length) rows.push({y, guaranteed, possible});
  }
  return {...summary, rows, removedPixelsMin, removedPixelsMax};
}

/**
 * Bounds for an isolated explosion centered at ORIGIN in fresh uniform terrain.
 * Rows contain inclusive integer cell offsets; cell (x,y) occupies x±0.5,y±0.5.
 * Inner/outer bounds cover unknown stop jitter and large-explosion phase, not
 * arbitrary origins, damaged terrain, objects, debris or later reactions.
 * Returns null for unsupported numeric inputs. includeRows:false skips raster
 * work for catalog-wide checks; a later preview upgrades the cached result.
 */
export function evaluateExplosionFootprint({radius, rayEnergy, hardness, durability, maxDurability}, {includeRows = true} = {}) {
  if (!Number.isFinite(radius) || radius < 0 || radius > MAX_RADIUS
    || ![rayEnergy, hardness, durability, maxDurability].every((value) => Number.isInteger(value) && value >= 0 && value <= INT_MAX)) return null;
  radius = f32(radius);
  const key = [radius, rayEnergy, hardness, durability, maxDurability].join("/");
  let entry = scenarios.get(key);
  if (!entry) {
    const summary = {kind: "explosion", origin: ORIGIN, sourceRadius: radius, radiusMin: 0, radiusMax: 0,
      nominal: true, damagePerCell: 0, randomizedLargeRays: radius > 60};
    if (radius === 0 || durability > maxDurability || (rayEnergy === 0 && hardness > 0)) {
      entry = {summary, rays: [], geometry: {...summary, rows: [], removedPixelsMin: 0, removedPixelsMax: 0}};
    } else {
      // Each new sampled cell consumes min(remaining energy, HP). The out
      // damage is the maximum consumed by ANY cell, not the final remainder.
      const exhaustedAt = hardness > 0 ? Math.max(1, Math.ceil(rayEnergy / hardness))
        : rayEnergy === 0 ? 1 : Infinity;
      const rays = traceDirections(radius).map(({contacts, end}) => {
        const exhausted = exhaustedAt <= contacts.length;
        const cutoff = exhausted ? contacts[exhaustedAt - 1] : end;
        const damage = contacts.length ? Math.min(rayEnergy, hardness) : 0;
        // 0x656ddf–0x656e35 adds either 0 or 1 to SQUARED stop distance.
        // 0x6599cd–0x659a31 subtracts sin²(phase)*min(.35*cutoff,100).
        // Bounding that phase avoids assuming a seed or shared RNG history.
        const reduction = radius > 60 ? Math.min(f32(cutoff * f32(0.35)), 100) : 0;
        return {cutoffMinSquared: f32(cutoff - reduction),
          cutoffMaxSquared: exhausted ? f32(cutoff + 1) : cutoff, damage};
      });
      summary.damagePerCell = Math.max(...rays.map((ray) => ray.damage));
      if (summary.damagePerCell >= hardness) {
        summary.radiusMin = Math.min(radius, Math.sqrt(Math.min(...rays.map((ray) => ray.damage >= hardness ? ray.cutoffMinSquared : 0))));
        summary.radiusMax = Math.min(radius, Math.sqrt(Math.max(...rays.map((ray) => ray.damage >= hardness ? ray.cutoffMaxSquared : 0))));
      }
      entry = {summary: {...summary, rays}, rays};
    }
  }
  remember(scenarios, key, entry, 16);
  if (!includeRows) return entry.summary;
  entry.geometry ??= buildRows(entry.summary, entry.rays, hardness);
  return entry.geometry;
}
