import {evaluateConversions, evaluateLifecycle, hasTerrainConversion} from "./effects.js";
import {evaluateExplosionFootprint} from "./explosion.js";
import {traceDiggingPath} from "./motion.js";
import {classifyDiggingMaterial, cellEatingProbability} from "./materials.js";

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
  const radii = [spell?.cellEaterRadius, spell?.explosionEnabled !== false && spell?.rayEnergy !== 0 ? spell?.radius : null,
    spell?.diggingLifecycle?.blackHole?.maximumRadius,
    ...(spell?.conversionEffects ?? []).filter((effect) => hasTerrainConversion({conversionEffects: [effect]}))
      .map((effect) => effect.radius),
    ...(spell?.diggingLifecycle?.secondaryProjectiles ?? []).map((entry) => getBaseRadius(entry.profile))].filter(positive);
  return radii.length ? Math.max(...radii) : null;
}

export function evaluateDigging(spell, material, {preview = true} = {}) {
  if (!spell || !material) return result("empty", "Select a spell and a material to compare them.");
  if (classifyDiggingMaterial(material) === "air") {
    return result("blocked", "Air is empty grid space; there is no material cell to dig, damage or displace.", 0);
  }
  if (spell.type === "Projectile modifier") {
    return result("conditional", "This modifier needs a base projectile. Its digging depends on that projectile and the spell combination; it has no standalone cast footprint.");
  }
  const effects = evaluateConversions(spell, material);
  const lifecycle = evaluateLifecycle(spell, material, (child, target) => evaluateDigging(child, target, {preview: false}));
  if (acidSpells.has(spell.id)) effects.push(evaluateAcid(spell, material));
  if (positive(spell.cellEaterRadius)) effects.push(evaluateCellEating(spell, material));
  if (positive(spell.groundPenetrationCoeff)) effects.push(evaluatePenetration(spell, material));
  if (positive(spell.laserBeamRadius)) effects.push(evaluateLaser(spell, material));
  if (spell.explosionEnabled !== false && positive(spell.radius) && spell.rayEnergy !== 0) effects.push(evaluateExplosion(spell, material));
  if (lifecycle) effects.push(lifecycle);
  if (!effects.length) {
    return result("unsupported", "No verified terrain-removal effect is available for this spell.");
  }
  // Each effect has its own rules. A failed explosion cannot rule out
  // penetration or corrosion, and an unknown effect must not become zero.
  const successful = effects.filter((effect) => ["digs", "path", "converts", "displaces", "removes"].includes(effect.status));
  const primary = successful[0] ?? effects.find((effect) => effect.status === "partial")
    ?? effects.find((effect) => effect.status === "conditional") ?? effects.find((effect) => effect.status === "unsupported") ?? effects[0];
  const circularEffect = successful.filter((effect) => positive(effect.radius) && !effect.reachOnly)
    .sort((a, b) => b.radius - a.radius)[0] ?? null;
  const outcome = {...primary, effects, circularEffect};
  const sourceEffect = primary.footprint ? primary : !primary.reachOnly ? circularEffect : null;
  if (sourceEffect?.footprint) {
    outcome.footprint = sourceEffect.footprint;
  }
  if (preview && ["cell", "path"].includes(primary.method) && ["digs", "path", "partial", "displaces", "removes"].includes(primary.status)
      && !["air", "rigid", "particle", "unknown", "static-liquid"].includes(classifyDiggingMaterial(material))) {
    const footprint = traceDiggingPath(spell, material, {kind: primary.method,
      contact: (hardness, vx, vy) => penetrationContactVector(spell, {...material, hardness}, vx, vy)});
    if (footprint) {
      outcome.footprint = footprint;
      if (primary.method === "path" && !footprint.partial) {
        outcome.status = "path";
        outcome.reason = "The reference cast removes stationary terrain cells and loses speed at each contact. Moving material and external forces can change the result.";
      }
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
  const kind = classifyDiggingMaterial(material);
  const probability = cellEatingProbability(spell.cellEaterEatProbability);
  const cellEating = {probabilitySetting: spell.cellEaterEatProbability, probabilityModulus: 101,
    nominalProbabilityPerVisit: probability, sampling: "integer cell offsets strictly inside the component radius"};
  const finish = (status, reason, radius = spell.cellEaterRadius, reachOnly = false) =>
    ({...result(status, reason, radius, "cell"), cellEating, ...(reachOnly ? {reachOnly: true} : {})});
  if (kind === "air") return finish("blocked", "Air has no cell for the effect to consume.", 0);
  if (probability === null) return finish("unsupported", "The cell-eating probability is unavailable.", null);
  if (probability === 0) {
    return result("blocked", "This cell-eating effect has a zero removal probability.", 0, "cell");
  }
  // CellEaterSystem also excludes the engine's spark material unconditionally.
  if (material.id === "spark" || spell.cellEaterIgnoredMaterial === material.id) {
    return result("blocked", "This spell explicitly excludes this material from its cell-eating effect.", 0, "cell");
  }
  if (spell.cellEaterIgnoredMaterialTag &&
      material.tags?.includes(spell.cellEaterIgnoredMaterialTag)) {
    return result("blocked", `This spell ignores materials tagged ${spell.cellEaterIgnoredMaterialTag}.`, 0, "cell");
  }
  if (spell.cellEaterIgnoredMaterialTag && !Array.isArray(material.tags)) {
    return finish("unsupported", "The material's tags are needed to check the spell's exclusion.", null);
  }

  if (spell.cellEaterLimitedMaterials) {
    const allowed = spell.cellEaterMaterials;
    if (!Array.isArray(allowed) || !allowed.every((id) => typeof id === "string")) {
      return result("unsupported", "This spell only consumes specific materials, but its material list is unavailable.", null, "cell");
    }
    if (!allowed.includes(material.id)) return result("blocked", "This material is not in the spell's allowed material list.", 0, "cell");
  }
  if (["particle", "unknown"].includes(kind)) {
    return finish("conditional", "This material needs context establishing an occupied grid cell; particle appearance alone does not establish terrain removal.", spell.cellEaterRadius, true);
  }
  if (kind === "rigid") {
    return finish("conditional", "Rigid-cell removal depends on the object's cells and state. The radius is effect reach, not a prediction that an entire physics object disappears.", spell.cellEaterRadius, true);
  }
  // The unlimited branch detaches a live, non-static, non-sand LiquidCell
  // before either only_stain or eat_dynamic_physics_bodies is examined.
  if (!spell.cellEaterLimitedMaterials && kind === "liquid") {
    return finish("displaces", "The effect moves liquid cells into particles instead of destroying the liquid. They can return to the grid; the path shows displacement reach, not a permanent empty tunnel.", spell.cellEaterRadius, true);
  }
  if (!spell.cellEaterLimitedMaterials && spell.cellEaterOnlyStain === true) {
    return finish("blocked", "This effect changes stains without deleting these cells.", 0);
  }
  if (!spell.cellEaterLimitedMaterials && material.solid_static_type === 0) {
    if (spell.cellEaterEatDynamicPhysicsBodies === false) {
      return finish("blocked", "This component's dynamic-cell setting excludes removal of these cells.", 0);
    }
    if (spell.cellEaterEatDynamicPhysicsBodies !== true) {
      return finish("unsupported", "The component's dynamic-cell removal setting is unavailable.", null);
    }
  }
  if (kind === "static-liquid") {
    return finish("conditional", "Static liquid cells can be removed while fixed; loosened liquid can instead become displaced particles. The material alone does not establish the current cell state.", spell.cellEaterRadius, true);
  }
  if (["gas", "fire", "liquid"].includes(kind)) {
    return finish("removes", "The effect deletes selected grid cells. Flow, surrounding material and reactions determine what fills the space afterward; no lasting crater is predicted.", spell.cellEaterRadius, true);
  }
  return finish("digs", "The effect deletes selected terrain cells without a hardness or durability check. Each visit is randomized; the path illustrates reach, not a guaranteed fully cleared tunnel.");
}

function terrainLimitation(material, method) {
  const kind = classifyDiggingMaterial(material);
  if (kind === "unknown") return result("unsupported", "The engine material class is unavailable.", null, method);
  if (kind === "rigid") {
    return {...result("conditional", "Rigid-cell and physics-object breakage depends on the object and its state; material settings alone do not establish a crater.", null, method), reachOnly: true};
  }
  if (kind !== "terrain") {
    if (method === "path" && ["liquid", "static-liquid", "gas", "fire"].includes(kind)) {
      return result("blocked", "The penetration callback passes through this engine cell class without applying terrain damage.", 0, method);
    }
    return {...result("conditional", "This engine material class needs fluid, particle or world context; the stationary terrain calculation does not establish an empty crater.", null, method), reachOnly: true};
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
    const partial = contacts.every((contact) => contact.remaining > 0);
    return {...result(partial ? "partial" : "path", partial
      ? "A first contact at these launch speeds damages the cell but does not remove it. Contact counts assume separate identical impacts, not a guaranteed tunnel from one cast."
      : "At least one launch-speed endpoint removes the first stationary cell. Later contacts lose speed; moving material and collision state can change the path.", null, "path"), penetration};
  }
  return result("blocked", `Material durability ${material.durability} exceeds the penetration limit of ${limit}.`, 0, "path");
}

function evaluateLaser(spell, material) {
  const kind = classifyDiggingMaterial(material);
  if (["gas", "fire"].includes(kind)) {
    return result("blocked", "The beam's terrain-damage callback passes through gas and fire cells without damaging them.", 0, "laser");
  }
  const unavailable = ["liquid", "static-liquid"].includes(kind) ? null : terrainLimitation(material, "laser");
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
  const partial = spell.laserCellDamage < material.hardness;
  const fluid = ["liquid", "static-liquid"].includes(kind);
  const target = material.warmth_melts_to_material_name ?? material.warmth_melts_to_material;
  const hasThermalTarget = typeof target === "string" && target !== "" && target !== "air" || positive(target);
  const laser = {damage: Math.min(material.hardness, spell.laserCellDamage),
    contacts: Math.max(1, Math.ceil(material.hardness / spell.laserCellDamage))};
  // After exhausting HP, the native laser callback requests heat 10000.
  // A successful heat replacement returns null and bypasses cell deletion.
  if (!partial && hasThermalTarget) {
    const chance = material.warmth_melts_chance_rev;
    const guaranteed = Number.isInteger(chance) && chance >= 0 && chance < 10000;
    laser.thermal = {temperature: 10000, toMaterial: typeof target === "string" ? target : null,
      toMaterialId: Number.isInteger(target) ? target : null, chanceReverse: chance ?? null};
    const targetName = typeof target === "string" ? target : `material ID ${target}`;
    return {...result(guaranteed ? "converts" : "conditional", guaranteed
      ? `After exhausting this cell's hit points, the beam's heat converts it to ${targetName}. It does not leave an empty cell.`
      : "After exhausting cell hit points, the beam can trigger a heat conversion. Its thermal settings do not establish guaranteed conversion or an empty cell.", null, "laser"), reachOnly: true, laser};
  }
  return {...result(partial ? "partial" : fluid ? "removes" : "digs", partial
    ? "One beam contact damages the cell but leaves it in place. More contacts are required; the beam's duration and movement do not guarantee that they hit the same cell."
    : fluid ? "A beam contact can remove a liquid cell. Thermal reactions and liquid flow are not a prediction of a permanent empty crater."
    : "One beam contact can remove the cell. The beam stops at that contact; its full moving tunnel is not simulated.", null, "laser"),
    ...(fluid ? {reachOnly: true} : {}),
    laser};
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

  const explosion = {radius: spell.radius, rayEnergy: spell.rayEnergy, maxDurability: spell.maxDuraToDestroy};
  const footprint = evaluateExplosionFootprint({...explosion, hardness: material.hardness,
    durability: material.durability});
  if (!footprint) return result("unsupported", "The explosion or material settings are outside the supported numeric range.", null, "explosion");
  const details = {explosion, footprint};
  if (footprint.radius === 0) return {...result("partial", "This impact damages terrain but does not remove a fresh cell. Repeated hits or already damaged terrain can give a different result.", 0, "explosion"), ...details};
  return {...result("digs", footprint.radius < spell.radius
    ? "This material's hardness reduces the estimated explosion size."
    : "The explosion has enough energy to reach its maximum radius in this material.", footprint.radius, "explosion"), ...details};
}

export const FIXED_SCALE = 6;

export function getDiggingViewport(radius, width, fit = false, sharedScale) {
  width = positive(width) ? width : 640;
  radius = nonnegative(radius) ? radius : 0;
  const sceneHeight = Math.max(200, Math.min(280, width * 0.3));
  const height = sceneHeight;
  const availableRadius = Math.max(1, Math.min(width / 2 - 24, sceneHeight / 2 - 24));
  const scale = positive(sharedScale) ? Math.min(FIXED_SCALE, sharedScale)
    : fit && radius > 0 ? Math.min(FIXED_SCALE, availableRadius / radius) : FIXED_SCALE;
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
    x: 36,
    y: (sceneHeight - 18 * scale) / 2,
  };
  return {width, height, sceneHeight, scale, screenRadius, centerX, centerY, clipped, scaleUnits, mina};
}
