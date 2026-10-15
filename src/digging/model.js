const nonnegative = (value) => Number.isFinite(value) && value >= 0;
const positive = (value) => Number.isFinite(value) && value > 0;
const result = (status, reason, radius = null, method = null) => ({status, reason, radius, method});
// These standalone spells emit acid in raw_data/projectiles/deck/*.xml.
// Acid Trail and conversion modifiers require another projectile/material.
const acidSpells = new Set(["ACIDSHOT", "MATERIAL_ACID", "CLOUD_ACID", "CIRCLE_ACID", "SEA_ACID"]);

export function isDiggingSpell(spell) {
  return acidSpells.has(spell.id) || spell.tags?.includes("digging") || positive(spell.cellEaterRadius) ||
    positive(spell.groundPenetrationCoeff) || positive(spell.laserBeamRadius) ||
    (positive(spell.radius) && positive(spell.rayEnergy));
}

export function getBaseRadius(spell) {
  if (positive(spell?.cellEaterRadius)) return spell.cellEaterRadius;
  return positive(spell?.radius) ? spell.radius : null;
}

export function evaluateDigging(spell, material) {
  if (!spell || !material) return result("empty", "Select a spell and a material to compare them.");
  const effects = [];
  if (acidSpells.has(spell.id)) effects.push(evaluateAcid(spell, material));
  if (positive(spell.cellEaterRadius)) effects.push(evaluateCellEating(spell, material));
  if (positive(spell.groundPenetrationCoeff)) effects.push(evaluatePenetration(spell, material));
  if (positive(spell.laserBeamRadius)) effects.push(evaluateLaser(spell, material));
  if (positive(spell.radius) && spell.rayEnergy !== 0) effects.push(evaluateExplosion(spell, material));
  if (!effects.length) {
    return result("unsupported", "This spell's digging effects are not modeled yet. Modifiers, moving singularities and scripted effects need separate calculations.");
  }
  // Each effect has its own rules. A failed explosion cannot rule out
  // penetration or corrosion, and an unknown effect must not become zero.
  const successful = effects.filter((effect) => effect.status === "digs" || effect.status === "path");
  const primary = successful[0] ?? effects.find((effect) => effect.status === "partial")
    ?? effects.find((effect) => effect.status === "unsupported") ?? effects[0];
  const circularEffect = successful.filter((effect) => positive(effect.radius))
    .sort((a, b) => b.radius - a.radius)[0] ?? null;
  return {...primary, effects, circularEffect};
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
  if (!positive(spell.mass) || !positive(spell.groundPenetrationCoeff) ||
      !nonnegative(speed) || !Number.isInteger(material.hardness) || material.hardness < 0) return null;
  const f32 = Math.fround;
  const velocity = f32(speed);
  const speedSquared = f32(velocity * velocity);
  if (speedSquared <= 100) {
    return {speed, damage: 0, remaining: material.hardness, impacts: null, speedAfter: velocity};
  }
  const coefficient = f32(f32(spell.groundPenetrationCoeff) * f32(spell.mass));
  const energy = f32(f32(coefficient * 0.5) * speedSquared);
  // The native helper rounds to a signed 32-bit integer. Do not extrapolate
  // its out-of-range conversion to arbitrary JavaScript numbers.
  if (!positive(energy) || energy >= 2147483647 || material.hardness > 2147483647) return null;
  const damage = Math.min(material.hardness, Math.round(energy));
  const factor = f32(1 - f32(Math.min(f32(material.hardness), energy) / energy));
  return {speed, damage, remaining: material.hardness - damage,
    impacts: material.hardness === 0 ? 1 : damage > 0 ? Math.ceil(material.hardness / damage) : null,
    speedAfter: f32(velocity * factor)};
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
    return {...result("path", "At default launch speeds, penetration damages the first terrain cell. Repeated identical impacts can finish a damaged cell; flight, acceleration and subsequent cells are not simulated.", null, "path"), penetration};
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

function evaluateExplosion(spell, material) {
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

  // Noita 0x656b10 consumes remaining cell HP from each ray's energy budget.
  // 0x657960 uses 360 directional cutoffs and can randomize large explosions.
  // This circle is a fresh, uniform-terrain estimate, not that exact outline.
  const energyRadius = material.hardness === 0 ? spell.radius : Math.floor(spell.rayEnergy / material.hardness);
  const radius = Math.min(spell.radius, energyRadius);
  if (radius === 0) return result("partial", "This impact damages terrain but does not remove a fresh cell. Repeated hits or already damaged terrain can give a different result.", 0, "explosion");
  return result("digs", radius < spell.radius
    ? "Hardness limits the estimated radius before the explosion reaches its maximum size."
    : "The energy budget reaches the spell's maximum radius in this material.", radius, "explosion");
}

export const FIXED_SCALE = 6;

export function getDiggingViewport(radius, width, fit = false) {
  width = positive(width) ? width : 640;
  radius = nonnegative(radius) ? radius : 0;
  const sceneHeight = width;
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
