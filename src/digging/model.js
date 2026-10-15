import {evaluateConversions, evaluateLifecycle, hasTerrainConversion} from "./effects.js";
import {evaluateExplosionFootprint} from "./explosion.js";
import {traceDiggingPath} from "./motion.js";

const nonnegative = (value) => Number.isFinite(value) && value >= 0;
const positive = (value) => Number.isFinite(value) && value > 0;
const result = (status, reason, radius = null, method = null) => ({status, reason, radius, method});
// These standalone spells emit acid in raw_data/projectiles/deck/*.xml.
// Acid Trail and conversion modifiers require another projectile/material.
const acidSpells = new Set(["ACIDSHOT", "MATERIAL_ACID", "CLOUD_ACID", "CIRCLE_ACID", "SEA_ACID"]);

export function isDiggingSpell(spell) {
  return acidSpells.has(spell.id) || spell.tags?.includes("digging") || positive(spell.cellEaterRadius) ||
    positive(spell.groundPenetrationCoeff) || positive(spell.laserBeamRadius) ||
    hasTerrainConversion(spell) || !!spell.diggingLifecycle ||
    (spell.explosionEnabled !== false && positive(spell.radius) && positive(spell.rayEnergy));
}

export function getBaseRadius(spell) {
  const radii = [spell?.cellEaterRadius, spell?.explosionEnabled !== false ? spell?.radius : null,
    spell?.diggingLifecycle?.blackHole?.maximumRadius,
    ...(spell?.conversionEffects ?? []).filter((effect) => hasTerrainConversion({conversionEffects: [effect]}))
      .map((effect) => effect.radius),
    ...(spell?.diggingLifecycle?.secondaryProjectiles ?? []).map((entry) => getBaseRadius(entry.profile))].filter(positive);
  return radii.length ? Math.max(...radii) : null;
}

export function evaluateDigging(spell, material, {preview = true} = {}) {
  if (!spell || !material) return result("empty", "Select a spell and a material to compare them.");
  if (spell.type === "Projectile modifier") {
    return result("conditional", "This modifier needs a base projectile. Its digging depends on that projectile and the spell combination; it has no standalone cast footprint.");
  }
  const effects = evaluateConversions(spell, material);
  const lifecycle = evaluateLifecycle(spell, material, (child, target) => evaluateDigging(child, target, {preview: false}));
  if (acidSpells.has(spell.id)) effects.push(evaluateAcid(spell, material));
  if (positive(spell.cellEaterRadius)) effects.push(evaluateCellEating(spell, material));
  if (positive(spell.groundPenetrationCoeff)) effects.push(evaluatePenetration(spell, material));
  if (positive(spell.laserBeamRadius)) effects.push(evaluateLaser(spell, material));
  if (spell.explosionEnabled !== false && positive(spell.radius) && spell.rayEnergy !== 0) effects.push(evaluateExplosion(spell, material, preview));
  if (lifecycle) effects.push(lifecycle);
  if (!effects.length) {
    return result("unsupported", "No verified terrain-removal effect is available for this spell.");
  }
  // Each effect has its own rules. A failed explosion cannot rule out
  // penetration or corrosion, and an unknown effect must not become zero.
  const successful = effects.filter((effect) => ["digs", "path", "converts"].includes(effect.status));
  const primary = successful[0] ?? effects.find((effect) => effect.status === "partial")
    ?? effects.find((effect) => effect.status === "conditional") ?? effects.find((effect) => effect.status === "unsupported") ?? effects[0];
  const circularEffect = successful.filter((effect) => positive(effect.radius) && !effect.reachOnly)
    .sort((a, b) => b.radius - a.radius)[0] ?? null;
  const outcome = {...primary, effects, circularEffect};
  const sourceEffect = primary.footprint ? primary : !primary.reachOnly ? circularEffect : null;
  if (sourceEffect?.footprint) {
    outcome.footprint = sourceEffect.footprint;
    // A representative secondary projectile was evaluated without raster
    // rows. Build those only for the selected preview, using its own settings.
    if (preview && outcome.footprint.kind === "explosion" && !outcome.footprint.rows) {
      outcome.footprint = evaluateExplosionFootprint({...sourceEffect.explosion,
        hardness: material.hardness, durability: material.durability});
    }
  }
  if (preview && ["cell", "path"].includes(primary.method) && ["digs", "path"].includes(primary.status)
      && material.id !== "air" && !material.tags?.includes("[box2d]") && material.is_just_particle_fx !== true) {
    const footprint = traceDiggingPath(spell, material, {kind: primary.method,
      contact: (hardness, vx, vy) => penetrationContactVector(spell, {...material, hardness}, vx, vy)});
    if (footprint) {
      outcome.footprint = footprint;
      outcome.reason = primary.method === "cell"
        ? "Cell eating ignores hardness and durability. The preview follows the effect along a nominal cast; its width is twice the cell-eating radius."
        : "Penetration damages cells along the projectile's path. The preview follows a nominal cast with contact slowdown; first-cell damage below is calculated separately at the launch-speed range.";
    }
  }
  return outcome;
}

function evaluateAcid(spell, material) {
  if (!Array.isArray(material.tags)) {
    return result("unsupported", "Acid reactivity is unavailable for this material.", null, "acid");
  }
  // materials.xml: [acid] + [corrodible] -> [acid] + acid_gas. This
  // reaction ignores explosion hardness/durability and also applies to objects.
  if (material.tags.includes("[corrodible]")) {
    return result("digs", `Acid dissolves ${material.name}. The hole grows as acid flows, so it has no fixed radius.`, null, "acid");
  }

  return result("blocked", `${material.name} resists acid.`, 0, "acid");
}

function evaluateCellEating(spell, material) {
  if (spell.cellEaterOnlyStain === true) {
    return result("blocked", "This effect removes stains, not terrain cells.", 0, "cell");
  }
  if (spell.cellEaterEatProbability === 0) {
    return result("blocked", "This cell-eating effect has a zero removal probability.", 0, "cell");
  }
  if (spell.cellEaterIgnoredMaterial === material.id) {
    return result("blocked", "This spell explicitly excludes this material from its cell-eating effect.", 0, "cell");
  }
  if (spell.cellEaterIgnoredMaterialTag &&
      material.tags?.includes(spell.cellEaterIgnoredMaterialTag)) {
    return result("blocked", `This spell ignores materials tagged ${spell.cellEaterIgnoredMaterialTag}.`, 0, "cell");
  }

  if (material.tags?.includes("[box2d]") && spell.cellEaterEatDynamicPhysicsBodies !== true) {
    return result("unsupported", "The cell-eating settings do not establish whether this object is consumed.", null, "cell");
  }

  if (spell.cellEaterLimitedMaterials) {
    const allowed = spell.cellEaterMaterials;
    if (!Array.isArray(allowed) || !allowed.every((id) => typeof id === "string")) {
      return result("unsupported", "This spell only consumes specific materials, but its material list is unavailable.", null, "cell");
    }
    if (!allowed.includes(material.id)) return result("blocked", "This material is not in the spell's allowed material list.", 0, "cell");
  }
  return result("digs", "The cell-eating effect ignores hardness and durability. This radius describes the effect at one position, not its full moving tunnel.", spell.cellEaterRadius, "cell");
}

function terrainLimitation(material, method) {
  if (material.tags?.includes("[box2d]")) {
    return result("unsupported", "Object breakage depends on the object as well as its material; it is not modeled here.", null, method);
  }
  if (!["Solid", "Powder"].includes(material.type)) {
    return result("unsupported", "This effect is modeled for solid terrain and powders. Its effect on this material type has not been calculated.", null, method);
  }
  return null;
}

// Noita Jan 25 2025: ProjectileSystem contact callback at 0xc08a30, with
// coefficient * mass supplied at 0xc0757a. This models one fresh terrain cell
// at the stated speed, not the projectile's flight or the full tunnel.
export function penetrationContact(spell, material, speed) {
  const contact = penetrationContactVector(spell, material, speed, 0);
  if (!contact) return null;
  return {speed, damage: contact.damage, remaining: contact.remaining,
    impacts: material.hardness === 0 && contact.removed ? 1 : contact.damage > 0 ? Math.ceil(material.hardness / contact.damage) : null,
    speedAfter: contact.vxAfter};
}

export function penetrationContactVector(spell, material, vx, vy) {
  if (!positive(spell.mass) || !positive(spell.groundPenetrationCoeff) ||
      !Number.isFinite(vx) || !Number.isFinite(vy) || !Number.isInteger(material.hardness) || material.hardness < 0) return null;
  const f32 = Math.fround;
  vx = f32(vx);
  vy = f32(vy);
  const speedSquared = f32(f32(vx * vx) + f32(vy * vy));
  if (speedSquared <= 100) {
    return {damage: 0, remaining: material.hardness, removed: false, vxAfter: vx, vyAfter: vy, energy: 0};
  }
  const coefficient = f32(f32(spell.groundPenetrationCoeff) * f32(spell.mass));
  const energy = f32(f32(coefficient * 0.5) * speedSquared);
  // The native helper rounds to a signed 32-bit integer. Do not extrapolate
  // its out-of-range conversion to arbitrary JavaScript numbers.
  if (!positive(energy) || energy >= 2147483647 || material.hardness > 2147483647) return null;
  const damage = Math.min(material.hardness, Math.round(energy));
  const factor = f32(1 - f32(Math.min(f32(material.hardness), energy) / energy));
  return {damage, remaining: material.hardness - damage, removed: material.hardness - damage < 1,
    vxAfter: f32(vx * factor), vyAfter: f32(vy * factor), energy};
}

function evaluatePenetration(spell, material) {
  const unavailable = terrainLimitation(material, "path");
  if (unavailable) return unavailable;
  // Penetration and impact explosions are separate effects. Both lances have
  // a positive explosion radius AND penetrate terrain. The native callback
  // applies the durability cap only when it is positive;
  // it must not be interpreted like the explosion's durability limit.
  const limit = spell.groundPenetrationMaxDura;
  if (!Number.isFinite(limit) || (limit > 0 && !nonnegative(material.durability))) {
    return result("unsupported", "The ground-penetration durability limit is unavailable.", null, "path");
  }
  if (limit <= 0 || material.durability <= limit) {
    if (spell.mass === 0) return result("blocked", "This projectile has zero mass, so its penetration effect is inactive.", 0, "path");
    const speeds = nonnegative(spell.speedMin) && nonnegative(spell.speedMax) && spell.speedMax >= spell.speedMin
      ? [...new Set([spell.speedMin, spell.speedMax])] : [];
    const contacts = speeds.map((speed) => penetrationContact(spell, material, speed));
    const penetration = contacts.length && contacts.every(Boolean)
      ? {contacts} : null;
    if (!penetration) {
      return result("unsupported", "Penetration needs valid mass, launch speeds and cell hardness. These values are missing or outside the supported numeric range.", null, "path");
    }
    if (contacts.every((contact) => contact.damage === 0 && contact.impacts === null)) {
      return {...result("blocked", "Penetration removes no cell hit points at this speed. Other spell effects are checked separately.", 0, "path"), penetration};
    }
    return {...result("path", "At the launch-speed range, penetration damages the first terrain cell. Repeated identical impacts can finish a damaged cell. Impact speed changes during flight.", null, "path"), penetration};
  }
  return result("blocked", `Material durability ${material.durability} exceeds the penetration limit of ${limit}.`, 0, "path");
}

function evaluateLaser(spell, material) {
  const unavailable = terrainLimitation(material, "laser");
  if (unavailable) return unavailable;
  if (!nonnegative(spell.laserMaxDuraToDestroy) || !nonnegative(material.durability)) {
    return result("unsupported", "The beam's durability limit or the material's durability is unavailable.", null, "laser");
  }
  if (material.durability > spell.laserMaxDuraToDestroy) {
    return result("blocked", `Material durability ${material.durability} exceeds the beam's limit of ${spell.laserMaxDuraToDestroy}.`, 0, "laser");
  }
  if (!Number.isInteger(spell.laserCellDamage) || spell.laserCellDamage < 0 ||
      !Number.isInteger(material.hardness) || material.hardness < 0) {
    return result("unsupported", "The beam's cell damage or this material's hardness is unavailable.", null, "laser");
  }
  if (spell.laserCellDamage === 0) return result("blocked", "This beam applies no terrain damage.", 0, "laser");
  // Noita 0xb95ab0 subtracts damage_to_cells from the contacted cell's HP
  // after the durability check. The beam stops at that contact; its width
  // and maximum length do not describe a circular excavation.
  return {...result("digs", "The beam damages cells along its path. The contact count assumes it keeps hitting the same cell; beam movement and the full tunnel are not simulated.", null, "laser"),
    laser: {damage: Math.min(material.hardness, spell.laserCellDamage),
      contacts: Math.max(1, Math.ceil(material.hardness / spell.laserCellDamage))}};
}

function evaluateExplosion(spell, material, preview) {
  if (spell.explosionHoleEnabled === false || spell.explosionDontDamageToCells === true) {
    return result("blocked", "This explosion does not remove terrain.", 0, "explosion");
  }
  const unavailable = terrainLimitation(material, "explosion");
  if (unavailable) return unavailable;
  if (!positive(spell.radius) || !positive(spell.rayEnergy) || !nonnegative(spell.maxDuraToDestroy)) {
    return result("unsupported", "The explosion's digging properties are incomplete.", null, "explosion");
  }
  if (!nonnegative(material.durability) || !nonnegative(material.hardness)) {
    return result("unsupported", "This material is missing hardness or durability data.", null, "explosion");
  }
  if (material.durability > spell.maxDuraToDestroy) {
    return result("blocked", `Material durability ${material.durability} exceeds the spell's limit of ${spell.maxDuraToDestroy}.`, 0, "explosion");
  }

  const explosion = {radius: spell.radius, rayEnergy: spell.rayEnergy, maxDurability: spell.maxDuraToDestroy};
  const footprint = evaluateExplosionFootprint({...explosion, hardness: material.hardness,
    durability: material.durability}, {includeRows: preview});
  if (!footprint) return result("unsupported", "The explosion or material settings are outside the supported numeric range.", null, "explosion");
  const details = {explosion, footprint, radiusRange: [footprint.radiusMin, footprint.radiusMax]};
  if (footprint.radiusMax === 0) return {...result("partial", "This impact damages terrain but does not remove a fresh cell. Repeated hits or already damaged terrain can give a different result.", 0, "explosion"), ...details};
  return {...result("digs", footprint.radiusMax < spell.radius
    ? "Hardness limits the explosion before its maximum radius. The outline follows 360 rays through fresh, uniform terrain."
    : "The explosion can reach its maximum radius in this material. The outline includes differences between ray directions and random variation.", footprint.radiusMax, "explosion"), ...details};
}

export const FIXED_SCALE = 6;

export function getDiggingViewport(radius, width, fit = false) {
  width = positive(width) ? width : 640;
  radius = nonnegative(radius) ? radius : 0;
  const sceneHeight = Math.max(360, Math.min(720, width * 0.6));
  const height = sceneHeight;
  const availableRadius = Math.max(1, Math.min(width / 2 - 24, sceneHeight / 2 - 24));
  const scale = fit && radius > 0 ? Math.min(FIXED_SCALE, availableRadius / radius) : FIXED_SCALE;
  const screenRadius = radius * scale;
  const clipped = !fit && screenRadius > availableRadius;
  // Anchor the right edge inside the view so a huge radius still has a visible
  // boundary. Centering it would leave the whole viewport inside the circle.
  const centerX = clipped ? width * 0.6 - screenRadius : width / 2;
  const centerY = sceneHeight / 2;
  const targetUnits = Math.min(120, width / 3) / scale;
  const magnitude = 10 ** Math.floor(Math.log10(targetUnits));
  const scaleUnits = [1, 2, 5, 10].filter((n) => n * magnitude <= targetUnits).at(-1) * magnitude;
  const mina = {
    width: 8 * scale,
    height: 18 * scale,
    x: Math.max(8, width - 32 - 8 * scale),
    y: Math.max(8, sceneHeight - 12 - 18 * scale),
  };
  return {width, height, sceneHeight, scale, screenRadius, centerX, centerY, clipped, scaleUnits, mina};
}
