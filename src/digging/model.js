const nonnegative = (value) => Number.isFinite(value) && value >= 0;
const positive = (value) => Number.isFinite(value) && value > 0;
const result = (status, reason, radius = null, method = null) => ({status, reason, radius, method});
// These standalone spells emit acid in raw_data/projectiles/deck/*.xml.
// Acid Trail and conversion modifiers require another projectile/material.
const acidSpells = new Set(["ACIDSHOT", "MATERIAL_ACID", "CLOUD_ACID", "CIRCLE_ACID", "SEA_ACID"]);

export function isDiggingSpell(spell) {
  return acidSpells.has(spell.id) || spell.tags?.includes("digging") || positive(spell.cellEaterRadius) ||
    positive(spell.groundPenetrationCoeff) || (positive(spell.radius) && positive(spell.rayEnergy));
}

export function getBaseRadius(spell) {
  if (positive(spell?.cellEaterRadius)) return spell.cellEaterRadius;
  return positive(spell?.radius) && positive(spell?.rayEnergy) ? spell.radius : null;
}

export function evaluateDigging(spell, material) {
  if (!spell || !material) return result("empty", "Select a spell and a material to compare them.");
  if (!acidSpells.has(spell.id)) return evaluateDirectDigging(spell, material);

  if (!Array.isArray(material.tags)) {
    return result("unsupported", "Acid reactivity is unavailable for this material.", null, "acid");
  }
  // materials.xml: [acid] + [corrodible] -> [acid] + acid_gas. This
  // reaction ignores explosion hardness/durability and also applies to objects.
  if (material.tags.includes("[corrodible]")) {
    return result("digs", `Acid dissolves ${material.name}. The hole grows as acid flows, so it has no fixed radius.`, null, "acid");
  }

  const direct = evaluateDirectDigging(spell, material);
  if (direct.status === "digs") {
    return {...direct, reason: `${material.name} resists acid, but the initial explosion can break it. The circle shows that initial hole.`};
  }
  if (material.tags.includes("[box2d]") && material.id !== "rock_box2d_nohit_hard" && positive(spell.radius)) {
    return result("unsupported", `${material.name} resists acid. Whether the impact breaks an object made from it depends on the object.`, null, "acid");
  }
  return result("blocked", `${material.name} resists acid.`, 0, "acid");
}

function evaluateDirectDigging(spell, material) {

  if (positive(spell.cellEaterRadius) && spell.cellEaterIgnoredMaterialTag &&
      material.tags?.includes(spell.cellEaterIgnoredMaterialTag)) {
    return result("blocked", `This spell ignores materials tagged ${spell.cellEaterIgnoredMaterialTag}.`, 0, "cell");
  }

  if (material.tags?.includes("[box2d]")) {
    return result("unsupported", "Physics objects have additional destruction rules; this terrain estimate does not cover them.");
  }

  if (positive(spell.cellEaterRadius)) {
    if (spell.cellEaterLimitedMaterials) {
      const allowed = spell.cellEaterMaterials;
      if (!Array.isArray(allowed) || !allowed.every((id) => typeof id === "string")) {
        return result("unsupported", "This spell only consumes specific materials, but its material list is unavailable.");
      }
      if (!allowed.includes(material.id)) return result("blocked", "This material is not in the spell's allowed material list.", 0, "cell");
    }
    return result("digs", "The cell-eating effect ignores hardness and durability. Other effects and movement are not included.", spell.cellEaterRadius, "cell");
  }

  if (!["Solid", "Powder"].includes(material.type)) {
    return result("unsupported", "This estimate covers solid terrain and powders. Other material types need spell-specific destruction rules.");
  }

  // Penetration and impact explosions are separate effects. Both lances have
  // a positive explosion radius AND penetrate terrain. In the resolved game
  // component dump, a penetration durability limit of 0 disables that cap;
  // it must not be interpreted like the explosion's durability limit.
  if (positive(spell.groundPenetrationCoeff)) {
    const limit = spell.groundPenetrationMaxDura;
    if (!nonnegative(limit) || (limit > 0 && !nonnegative(material.durability))) {
      return result("unsupported", "The ground-penetration durability limit is unavailable.", null, "path");
    }
    if (limit === 0 || material.durability <= limit) {
      return result("path", "Ground penetration can dig this material as the projectile moves. Hard terrain may require repeated hits; depth per cast depends on impact speed, projectile mass and terrain hardness and is not quantified.", null, "path");
    }
    if (!positive(spell.radius)) {
      return result("blocked", `Material durability ${material.durability} exceeds the penetration limit of ${limit}.`, 0, "path");
    }
    // A capped penetration effect can fail while its impact explosion digs.
  }

  if (!positive(spell.radius) || !positive(spell.rayEnergy) || !nonnegative(spell.maxDuraToDestroy)) {
    return result("unsupported", "No standalone circular digging estimate is available. This spell may depend on modifiers, reactions, movement, or scripted effects.");
  }
  if (!nonnegative(material.durability) || !nonnegative(material.hardness)) {
    return result("unsupported", "This material is missing hardness or durability data.");
  }
  if (material.durability > spell.maxDuraToDestroy) {
    return result("blocked", `Material durability ${material.durability} exceeds the spell's limit of ${spell.maxDuraToDestroy}.`, 0, "explosion");
  }

  // A uniform-terrain estimate: each pixel consumes hardness from the ray's
  // energy budget. See https://noita.wiki.gg/wiki/Digging. This is not a simulation
  // of the game's individual rays, repeated impacts, or secondary effects.
  const energyRadius = material.hardness === 0 ? spell.radius : Math.floor(spell.rayEnergy / material.hardness);
  const radius = Math.min(spell.radius, energyRadius);
  if (radius === 0) return result("blocked", "Ray energy is below the hardness needed to remove one pixel in a single impact.", 0, "explosion");
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
