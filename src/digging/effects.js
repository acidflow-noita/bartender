import {classifyDiggingMaterial} from "./materials.js";

const nonnegative = (value) => Number.isFinite(value) && value >= 0;
const positive = (value) => Number.isFinite(value) && value > 0;
const result = (status, reason, radius = null, method = "conversion") => ({status, reason, radius, method});
const materialName = (value) => value === 0 || value === "" ? "air" : typeof value === "string" ? value : null;

export function hasTerrainConversion(spell) {
  return (spell?.conversionEffects ?? []).some((effect) => {
    if (!effect || effect.enabled === false || effect.radius === 0 || effect.stepsPerFrame === 0) return false;
    if (Number.isFinite(effect.temperatureReactionTemp) && effect.temperatureReactionTemp !== 0) return true;
    const target = materialName(effect.toMaterial);
    if (target && (effect.fromAnyMaterial === true || typeof effect.fromTag === "string" && effect.fromTag)) return true;
    const source = materialName(effect.fromMaterial);
    if (source && source !== "air" && target && source !== target) return true;
    return Array.isArray(effect.fromArray) && Array.isArray(effect.toArray) && effect.fromArray.length === effect.toArray.length &&
      effect.fromArray.some((id, index) => typeof id === "string" && id !== "air" &&
        typeof effect.toArray[index] === "string" && effect.toArray[index] !== id);
  });
}

function conversionMatch(effect, material) {
  const fromMaterial = materialName(effect.fromMaterial);
  const toMaterial = materialName(effect.toMaterial);
  const directTarget = () => toMaterial
    ? {matches: true, toMaterial}
    : {unknown: "The conversion's replacement material cannot be resolved from the available data."};
  // 0xbaac80 first tests from_material/from_any_material, then the tag,
  // and only then the paired arrays. The selected array supplies its target.
  if (effect.fromAnyMaterial === true || fromMaterial === material.id) return directTarget();
  if (typeof effect.fromTag === "string" && effect.fromTag) {
    if (!Array.isArray(material.tags)) return {unknown: "This material's tags are unavailable."};
    if (material.tags.includes(effect.fromTag)) return directTarget();
  }
  const fromArray = effect.fromArray;
  const toArray = effect.toArray;
  if ((Array.isArray(fromArray) && fromArray.length) || (Array.isArray(toArray) && toArray.length)) {
    if (!Array.isArray(fromArray) || !Array.isArray(toArray) || fromArray.length !== toArray.length ||
        !fromArray.every((id) => typeof id === "string" && id) || !toArray.every((id) => typeof id === "string" && id)) {
      return {unknown: "The conversion's paired material lists are incomplete."};
    }
    const targets = [...new Set(fromArray.flatMap((id, index) => id === material.id ? [toArray[index]] : []))];
    if (targets.length > 1) return {unknown: "The conversion gives this material conflicting replacements."};
    return {matches: targets.length === 1, toMaterial: targets[0] ?? null};
  }
  if (fromMaterial || typeof effect.fromTag === "string" && effect.fromTag) {
    return {matches: false, toMaterial};
  }
  return {unknown: "The conversion's source material cannot be resolved from the available data."};
}

function evaluateConversion(effect, material) {
  const materialKind = classifyDiggingMaterial(material);
  const target = effect.convertEntities === true ? "terrain-and-entities" : "terrain";
  const conversion = {...effect, target, shape: effect.isCircle ? "circle" : "square",
    configuredRadius: effect.radius, maximumProcessedRing: positive(effect.radius) ? effect.radius - 1 : null};
  if (effect.convertEntities === true) {
    conversion.entityContext = {requiresDamageModel: true, excludedEntityTag: "touchmagic_immunity"};
  }
  const finish = (status, reason, radius = null) => ({...result(status, reason, radius), reachOnly: true, conversion});
  if (effect.enabled === false) return finish("blocked", "This conversion component is disabled.", 0);
  if (effect.conditionUnverified) return finish("unsupported", "The script controlling this conversion has not been verified.");
  if (!Number.isInteger(effect.radius) || effect.radius < 0 || !Number.isInteger(effect.minRadius) || effect.minRadius < 0 || effect.minRadius > effect.radius ||
      typeof effect.isCircle !== "boolean" || !Number.isInteger(effect.stepsPerFrame) || effect.stepsPerFrame < 0) {
    return finish("unsupported", "The conversion's shape or timing settings are incomplete.");
  }
  // The native cell helper enters only when an existing grid-cell pointer is
  // present. Empty air is not created or replaced by terrain conversion.
  if (material.id === "air") return finish("blocked", "Air has no terrain cell for this conversion to replace.", 0);
  if (Number.isFinite(effect.temperatureReactionTemp) && effect.temperatureReactionTemp !== 0) {
    const cold = material.cold_freezes_to_material_name ?? material.cold_freezes_to_material;
    const warm = material.warmth_melts_to_material_name ?? material.warmth_melts_to_material;
    conversion.thermal = {temperature: effect.temperatureReactionTemp,
      coldTarget: typeof cold === "string" && cold ? cold : null,
      warmTarget: typeof warm === "string" && warm ? warm : null,
      coldTargetId: material.cold_freezes_to_material_id ?? null,
      warmTargetId: typeof warm === "number" ? warm : null};
    return finish("conditional", "Temperature reactions use this material's freezing and melting settings before ordinary conversion. Their activation needs temperature and reaction context.", effect.radius);
  }
  const match = conversionMatch(effect, material);
  if (match.unknown) return finish("unsupported", match.unknown);
  if (!match.matches) {
    if (positive(effect.fanTheFlames) && (material.burnable === true || material.on_fire === true || materialKind === "fire")) {
      return finish("conditional", "This effect advances existing fire. Any material removal depends on burning and reactions, not direct terrain conversion.", effect.radius);
    }
    if (positive(effect.igniteMaterials) && material.burnable === true) {
      return finish("conditional", "This effect can ignite burnable material. Burning and reactions determine whether terrain is removed.", effect.radius);
    }
    if (effect.extinguishFire === true && (material.on_fire === true || materialKind === "fire")) {
      return finish("conditional", "This component extinguishes existing fire; it does not define an empty terrain crater.", effect.radius);
    }
    if (effect.cleanStains === true) return finish("blocked", "This component clears stains but does not replace the selected terrain material.", 0);
    if (effect.extinguishFire === true) return finish("blocked", "This component extinguishes fire but does not replace the selected terrain material.", 0);
    if (positive(effect.fanTheFlames)) return finish("blocked", "This component advances existing fire but does not directly replace the selected terrain material.", 0);
    return finish("blocked", "This material does not match the conversion's source filter.", 0);
  }
  conversion.toMaterial = match.toMaterial;
  if (material.id === match.toMaterial) {
    return finish("blocked", "The replacement is the same material, so this conversion does not remove terrain.", 0);
  }
  if (materialKind === "rigid") {
    return finish("conditional", effect.convertEntities
      ? "Entity conversion requires a nearby, non-immune entity with a damage model. Selecting its material alone does not establish an empty hole."
      : "Converting a physics object requires object and entity context; a terrain conversion radius alone does not establish object removal.", effect.radius);
  }
  if (["particle", "unknown"].includes(materialKind)) {
    return finish("conditional", "The material filter matches, but this material's eligibility as a convertible terrain cell needs additional engine context.", effect.radius);
  }
  if (effect.disabledWhen) {
    return finish("conditional", "An in-game activation condition determines whether this conversion runs. The displayed boundary is its configured reach.", effect.radius);
  }
  if (effect.stepsPerFrame === 0) {
    return finish("blocked", "This component requests no terrain conversion steps per frame.", 0);
  }
  if (effect.radius === 0) return finish("blocked", "The configured radius contains no terrain scan rings.", 0);
  return finish("converts", `Converts ${material.name ?? material.id} to ${match.toMaterial}. The displayed boundary is conversion reach, not an empty crater.`, effect.radius);
}

export function evaluateConversions(spell, material) {
  if (!spell || !material || !Array.isArray(spell.conversionEffects)) return [];
  const entries = spell.conversionEffects.filter((effect) => effect && typeof effect === "object");
  // convert_entities adds a separate entity pass; all these components still
  // scan terrain. Preserve them all and prefer the largest applicable reach.
  const effects = entries.map((effect) => evaluateConversion(effect, material));
  const rank = (effect) => effect.status === "converts" ? 0 : effect.status === "conditional" ? 1
    : effect.status === "unsupported" ? 2 : 3;
  return effects.sort((a, b) => rank(a) - rank(b) || (b.radius ?? -1) - (a.radius ?? -1));
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

function profileSignature(profile) {
  const {id, name, name_and_id, projectilePath, xmlDataSource, ...settings} = profile;
  return JSON.stringify(canonical(settings));
}

export function evaluateLifecycle(spell, material, evaluateChild) {
  const lifecycle = spell?.diggingLifecycle;
  if (!lifecycle || !material) return null;
  const {secondaryProjectiles = [], ...metadata} = lifecycle;
  const indirect = {...metadata, children: []};
  const finish = (status, reason, radius = null) => ({...result(status, reason, radius, "indirect"), reachOnly: true, indirect});
  if (lifecycle.kind === "unverified-script") {
    return finish("unsupported", "This scripted effect's source does not match the verified lifecycle data.");
  }
  indirect.children = secondaryProjectiles.map((child) => ({...child,
    result: child.profile && typeof evaluateChild === "function"
      ? evaluateChild(child.profile, material) ?? result("unsupported", "This secondary effect has no available terrain calculation.", null, "indirect")
      : result("unsupported", "This secondary effect has no available terrain calculation.", null, "indirect"),
  }));
  if (lifecycle.kind === "physics-impulse") {
    const coefficient = spell.physicsImpulseCoeff ?? lifecycle.physicsImpulseCoeff;
    if (!positive(coefficient)) return finish("blocked", "This projectile applies no physics impulse.", 0);
    indirect.physicsImpulseCoeff = coefficient;
    return finish("conditional", lifecycle.context ?? "This projectile pushes physics objects. Any opening depends on the objects and layout; there is no fixed terrain-removal radius.");
  }
  if (lifecycle.kind === "growing-black-hole" || lifecycle.kind === "fixed-black-hole") {
    const field = lifecycle.blackHole;
    const growing = lifecycle.kind === "growing-black-hole";
    const radius = growing ? field?.maximumRadius : field?.radius;
    if (!positive(radius) || (growing && (!nonnegative(field.initialRadius) || radius < field.initialRadius ||
        !positive(field.radiusIncrement) || !positive(field.updateEveryFrames))) ||
        (!growing && field.maximumRadius != null && field.maximumRadius !== radius)) {
      return finish("unsupported", "The black-hole field's radius settings are incomplete.");
    }
    indirect.blackHole = {...field, terrainScan: "first occupied cell along each sampled ray",
      damageProbabilityScope: "physics objects and entities"};
    if (material.id === "air") return finish("blocked", "Air has no terrain cell for the black-hole scan to remove.", 0);
    const materialKind = classifyDiggingMaterial(material);
    if (materialKind === "rigid") {
      return finish("conditional", "Physics-object damage depends on the object and repeated field interactions. The boundary shows field reach, not guaranteed object removal.", radius);
    }
    if (["particle", "unknown"].includes(materialKind)) {
      return finish("conditional", "This material needs context establishing an occupied terrain cell. The boundary shows the black-hole field's maximum reach.", radius);
    }
    if (["liquid", "static-liquid"].includes(materialKind)) {
      indirect.materialOutcome = "displacement";
      return finish("displaces", "The field turns sampled liquid cells into orbiting material particles. Its release callback recreates liquid cells; field reach is not a permanent empty crater.", radius);
    }
    indirect.materialOutcome = "cell-removal";
    return finish(["gas", "fire"].includes(materialKind) ? "removes" : "digs", `The ${growing ? "growing " : ""}field removes occupied cells reached by radial scans, without a hardness or durability check. The boundary shows its ${growing ? "maximum " : ""}reach of ${radius} game pixels, not a fully excavated circle or a prediction of later material flow.`, radius);
  }
  if (lifecycle.kind === "random-projectile") {
    const children = indirect.children;
    if (lifecycle.selection === "one-of" && lifecycle.countPerCast === 1 && children.length &&
        children.every((child) => child.profile && !child.condition && child.trigger === "cast") &&
        children.every((child) => profileSignature(child.profile) === profileSignature(children[0].profile)) &&
        children.every((child) => JSON.stringify(canonical(child.result)) === JSON.stringify(canonical(children[0].result)))) {
      // Exactly one of these equivalent projectiles is cast. Its individual
      // impact result is also the spell result; no group radii are added.
      return {...children[0].result, indirect};
    }
    return finish("conditional", lifecycle.context ?? "The randomly selected projectile determines the impact result. Each variant is calculated separately.");
  }
  if (["repeated-projectiles", "delayed-projectiles", "spawned-creature", "creature-explosions", "staged-event"].includes(lifecycle.kind)) {
    return finish("conditional", lifecycle.context ?? "Position, timing and activation determine these secondary effects. Their individual calculations do not describe one combined crater.");
  }
  return finish("unsupported", "This lifecycle has no verified terrain calculation.");
}
