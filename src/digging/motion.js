const f32 = Math.fround;
const DT = f32(1 / 60);
const ORIGIN = 1024.5;
const MAX_FRAMES = 3600;
const MAX_CELLS = 65536;
const finite = Number.isFinite;
const nonnegative = (value) => finite(value) && value >= 0;
const speedSquared = (vx, vy) => f32(f32(vx * vx) + f32(vy * vy));
const cellKey = (x, y) => `${Math.trunc(x)},${Math.trunc(y)}`;

function capVelocity(state, limit) {
  const squared = speedSquared(state.vx, state.vy);
  if (squared > f32(limit * limit)) {
    const magnitude = f32(Math.sqrt(squared));
    state.vx = f32(f32(state.vx / magnitude) * limit);
    state.vy = f32(f32(state.vy / magnitude) * limit);
  }
}

// VelocitySystem 0xc370c0: gravity, then signed air friction, then a vector
// terminal-speed cap. Negative friction accelerates Black Hole during flight.
function updateVelocity(state, spell, motion) {
  if (motion.limitToMaxVelocity) capVelocity(state, 61440);
  if (!motion.updatesVelocity) return;
  state.vx = f32(state.vx + f32(f32(motion.gravityX) * DT));
  state.vy = f32(state.vy + f32(f32(spell.gravity) * DT));
  state.vx = f32(state.vx - f32(f32(DT * state.vx) * f32(spell.airFriction)));
  state.vy = f32(state.vy - f32(f32(DT * state.vy) * f32(spell.airFriction)));
  if (motion.applyTerminalVelocity) capVelocity(state, f32(motion.terminalVelocity));
}

function addPoint(points, x, y) {
  const point = [x - ORIGIN, y - ORIGIN];
  const previous = points.at(-1);
  if (!previous || point[0] !== previous[0] || point[1] !== previous[1]) points.push(point);
}

function lineLength(points) {
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    length += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  return length;
}

// Grid trace 0x63fa50 visits truncated cells along float32 unit steps. Its
// rounded squared-distance cutoff can sample a cell past the requested end.
// A rejected contact leaves the projectile at the last accepted position.
function traceFrame(state, endX, endY, material, contact) {
  const startX = state.x, startY = state.y;
  const dx = f32(endX - startX), dy = f32(endY - startY);
  const distanceSquared = speedSquared(dx, dy);
  const cutoff = Math.min(1048576, Math.trunc(f32(distanceSquared + 0.5)));
  let acceptedX = startX, acceptedY = startY;
  let previousKey = cellKey(startX, startY);

  const visit = (x, y) => {
    const key = cellKey(x, y);
    if (state.cleared.has(key)) return true;
    if (state.contacts >= MAX_CELLS) return null;
    const hp = state.damaged.get(key) ?? material.hardness;
    const hit = contact(hp, state.vx, state.vy);
    if (!hit || !nonnegative(hit.damage) || !Number.isInteger(hit.remaining) || hit.remaining < 0
      || hit.remaining !== hp - hit.damage || typeof hit.removed !== "boolean"
      || (hit.removed && hit.remaining !== 0) || !finite(hit.vxAfter) || !finite(hit.vyAfter)) return null;
    state.contacts++;
    state.vx = f32(hit.vxAfter);
    state.vy = f32(hit.vyAfter);
    if (hit.removed) {
      state.cleared.add(key);
      state.damaged.delete(key);
      addPoint(state.removedPoints, Math.trunc(x) + 0.5, Math.trunc(y) + 0.5);
      return true;
    }
    if (hit.damage > 0) state.damaged.set(key, hit.remaining);
    state.blockedPoint = [Math.trunc(x) + 0.5 - ORIGIN, Math.trunc(y) + 0.5 - ORIGIN];
    return false;
  };

  if (cutoff < 1) {
    const accepted = visit(endX, endY);
    // This native short-distance branch writes the original position even
    // when the cell callback succeeds; it does not use a fractional step.
    return accepted === null ? null : {x: startX, y: startY, collided: !accepted};
  }
  const distance = f32(Math.sqrt(distanceSquared));
  const stepX = f32(dx / distance), stepY = f32(dy / distance);
  let x = startX, y = startY;
  for (let step = 0; step < 1024; step++) {
    x = f32(x + stepX);
    y = f32(y + stepY);
    const key = cellKey(x, y);
    if (key !== previousKey) {
      const accepted = visit(x, y);
      if (accepted === null) return null;
      if (!accepted) return {x: acceptedX, y: acceptedY, collided: true};
      acceptedX = x;
      acceptedY = y;
      previousKey = key;
    }
    if (speedSquared(f32(x - startX), f32(y - startY)) >= cutoff) {
      return {x: endX, y: endY, collided: false};
    }
  }
  // Do not invent a continuation when the native 1024-step guard is reached.
  return null;
}

function runVariant(spell, material, kind, contact, launchSpeed, lifetimeFrames, phaseOrder) {
  const motion = spell.projectileMotion;
  const state = {x: ORIGIN, y: ORIGIN, vx: f32(launchSpeed), vy: 0, contacts: 0,
    cleared: new Set([cellKey(ORIGIN, ORIGIN)]), damaged: new Map(), removedPoints: [],
    blockedPoint: null};
  const travelPoints = [[0, 0]];
  let frames = 0, endReason = "lifetime", conditional = false, samplingGaps = false;
  for (; frames < lifetimeFrames;) {
    if (phaseOrder === "forces-before-move") updateVelocity(state, spell, motion);
    // ProjectileSystem 0xc06c60 clamps again before computing v * dt.
    if (motion.applyTerminalVelocity) capVelocity(state, f32(motion.terminalVelocity));
    else if (motion.limitToMaxVelocity) capVelocity(state, 61440);
    const endX = f32(state.x + f32(state.vx * DT));
    const endY = f32(state.y + f32(state.vy * DT));
    if (![state.vx, state.vy, endX, endY].every(finite)) return null;
    const position = kind === "path" ? traceFrame(state, endX, endY, material, contact)
      : {x: endX, y: endY, collided: false};
    if (!position) return null;
    if (kind === "cell" && Math.hypot(position.x - state.x, position.y - state.y) > spell.cellEaterRadius * 2) {
      samplingGaps = true;
    }
    state.x = position.x;
    state.y = position.y;
    addPoint(travelPoints, state.x, state.y);
    frames++;
    if (position.collided) {
      if (motion.bouncesLeft > 0 || motion.projectileFriction !== 0 || motion.penetrateWorld) {
        conditional = true;
        endReason = "collision-context";
        break;
      }
      if (motion.onCollisionDie || motion.onCollisionRemoveProjectile) {
        endReason = "collision";
        break;
      }
    }
    // The movement helper tests low velocity after the terrain contacts.
    if (motion.dieOnLowVelocity && speedSquared(state.vx, state.vy)
      <= f32(motion.dieOnLowVelocityLimit * motion.dieOnLowVelocityLimit)) {
      endReason = "low-velocity";
      break;
    }
    // Lifetime 0xc06fc0 decrements after movement, including the final frame.
    if (frames >= lifetimeFrames) break;
    if (phaseOrder === "forces-after-move") updateVelocity(state, spell, motion);
  }
  const removedCells = state.cleared.size - 1;
  const points = kind === "cell" ? travelPoints : state.removedPoints.length
    ? state.removedPoints : [state.blockedPoint ?? [0, 0]];
  const travelLength = lineLength(travelPoints);
  const length = kind === "cell" ? travelLength + spell.cellEaterRadius * 2
    : removedCells ? lineLength(state.removedPoints) + 1 : 0;
  return {points, conditional, samplingGaps,
    diagnostic: {phaseOrder, launchSpeed, lifetimeFrames, frames, removedCells,
      damagedCells: state.damaged.size, contacts: state.contacts, endReason, travelLength, length,
      finalVelocity: [state.vx, state.vy]}};
}

/**
 * A nominal rightward cast from the center of an air cell into otherwise
 * uniform, stationary material, with no modifiers or external forces.
 * contact(hp, vx, vy) supplies native penetration damage and remaining velocity.
 * Width is a 1-pixel terrain trace or a cell eater's diameter. The length is
 * removed-cell centerline length + 1 for penetration, or travel + diameter for
 * cell eating. Both force/movement phase orders and launch/lifetime endpoints
 * are evaluated; these are reference scenarios, not arbitrary-world bounds.
 */
export function traceDiggingPath(spell, material, {kind, contact} = {}) {
  const motion = spell?.projectileMotion;
  if (!motion || !material || !["cell", "path"].includes(kind)
    || motion.componentEnabled !== true || motion.doMoveToUpdate !== true
    || !nonnegative(spell.speedMin) || !nonnegative(spell.speedMax) || spell.speedMax < spell.speedMin
    || !Number.isInteger(motion.lifetimeFrames) || motion.lifetimeFrames < 0
    || !Number.isInteger(motion.lifetimeRandomness) || motion.lifetimeRandomness < 0
    || motion.lifetimeFrames < motion.lifetimeRandomness
    || motion.lifetimeFrames + motion.lifetimeRandomness > MAX_FRAMES
    || motion.entityLifetimeFrames != null
    || !["applyTerminalVelocity", "updatesVelocity", "limitToMaxVelocity", "collideWithWorld",
      "onCollisionDie", "onCollisionRemoveProjectile", "penetrateWorld", "dieOnLowVelocity"]
      .every((field) => typeof motion[field] === "boolean")
    || !nonnegative(motion.bouncesLeft) || !finite(motion.projectileFriction)
    || (motion.applyTerminalVelocity && !nonnegative(motion.terminalVelocity))
    || (motion.dieOnLowVelocity && !nonnegative(motion.dieOnLowVelocityLimit))
    || (motion.updatesVelocity && ![spell.gravity, motion.gravityX, spell.airFriction].every(finite))) return null;
  if (kind === "path" && (typeof contact !== "function" || !Number.isInteger(material.hardness)
    || material.hardness < 0 || material.hardness > 2147483647 || !motion.collideWithWorld
    || motion.penetrateWorld)) return null;
  if (kind === "cell" && (!(spell.cellEaterRadius > 0) || !finite(spell.cellEaterRadius)
    || spell.cellEaterEatProbability === 0)) return null;

  const variants = [];
  for (const launchSpeed of new Set([spell.speedMin, spell.speedMax])) {
    for (const lifetimeFrames of new Set([Math.max(1, motion.lifetimeFrames - motion.lifetimeRandomness),
      Math.max(1, motion.lifetimeFrames + motion.lifetimeRandomness)])) {
      for (const phaseOrder of ["forces-before-move", "forces-after-move"]) {
        const variant = runVariant(spell, material, kind, contact, launchSpeed, lifetimeFrames, phaseOrder);
        if (!variant) return null;
        variants.push(variant);
      }
    }
  }
  variants.sort((a, b) => a.diagnostic.length - b.diagnostic.length);
  const shortest = variants[0], longest = variants.at(-1);
  if (kind === "path" && variants.every((variant) => variant.diagnostic.contacts === 0)) return null;
  // A single representative cast avoids overlapping shortest/longest ends.
  const previewSpeed = (spell.speedMin + spell.speedMax) / 2;
  const previewLifetime = Math.max(1, motion.lifetimeFrames);
  const preview = variants.find((variant) => variant.diagnostic.launchSpeed === previewSpeed
    && variant.diagnostic.lifetimeFrames === previewLifetime && variant.diagnostic.phaseOrder === "forces-before-move")
    ?? runVariant(spell, material, kind, contact, previewSpeed, previewLifetime, "forces-before-move");
  if (!preview) return null;
  const probabilistic = kind === "cell" && spell.cellEaterEatProbability !== 100;
  const conditional = (kind === "cell" && motion.collideWithWorld)
    || variants.some((variant) => variant.conditional || variant.samplingGaps);
  const partial = kind === "path" && preview.diagnostic.removedCells === 0;
  const caption = partial ? "This cast damages the material without opening a hole."
    : kind === "path" && preview.conditional ? "Dug path up to the first bounce or collision."
    : kind === "cell" && conditional ? "Example path; collisions can shorten it."
    : "Example dug path for one cast. Speed and lifetime can change its length.";
  const samePoints = JSON.stringify(shortest.points) === JSON.stringify(longest.points);
  return {kind: "path", points: shortest.points, ...(samePoints ? {} : {maxPoints: longest.points}),
    previewPoints: preview.points, previewLength: preview.diagnostic.length,
    removalProbability: kind === "cell" ? spell.cellEaterEatProbability / 100 : 1,
    width: kind === "cell" ? spell.cellEaterRadius * 2 : 1,
    lengthMin: shortest.diagnostic.length, lengthMax: longest.diagnostic.length,
    probabilistic, conditional, partial, outlineOnly: probabilistic || kind === "cell" && conditional || partial, caption,
    diagnostics: {reference: "rightward-uniform-stationary", framesPerSecond: 60,
      lengthBasis: kind === "cell" ? "travel-plus-diameter" : "removed-centerline-plus-one-pixel",
      phaseOrderUnverified: true, variants: variants.map((variant) => variant.diagnostic)}};
}
