const originals = new WeakMap();
const positive = (value) => Number.isFinite(value) && value > 0;

export function normalizeDiggingModifiers(options = {}) {
  const value = options?.glassCannon;
  return {
    glassCannon: value === 2 || value === "2" ? 2 : value === 1 || value === "1" ? 1 : 0,
    berserkium: options?.berserkium === true || options?.berserkium === 1 || options?.berserkium === "1",
  };
}

// Noita 0xb06870: Glass Cannon and Berserk share two shot-effect slots.
// Berserk's slot factors are 2 and 1.5; the ray-energy instruction converts
// that factor to an integer before multiplication. Perks are applied first
// in this comparison; a different acquisition/dispatch order can differ.
function factors({glassCannon, berserkium}) {
  const values = Array(glassCannon).fill(5);
  if (berserkium && values.length < 2) values.push(values.length === 0 ? 2 : 1.5);
  return values;
}

export function applyDiggingModifiers(spell, options = {}) {
  if (!spell || typeof spell !== "object") return spell;
  const source = originals.get(spell) ?? spell;
  const effective = structuredClone(source);
  originals.set(effective, source);
  const settings = normalizeDiggingModifiers(options);
  const multipliers = factors(settings);
  if (!multipliers.length) return effective;

  const notes = new Set(effective.diggingModifierNotes ?? []);
  let changedDigging = false;
  const scaleProjectileExplosion = (profile) => {
    if (!profile || (profile.explosionComponent && profile.explosionComponent !== "ProjectileComponent") ||
        profile.projectileMotion?.componentEnabled === false || profile.explosionHoleEnabled === false ||
        profile.explosionNotScaledByGamefx === true || profile.not_scaled_by_gamefx === true ||
        !positive(profile.radius)) return;
    const changesModeledEffect = positive(profile.rayEnergy) && profile.explosionEnabled !== false;
    for (const multiplier of multipliers) {
      profile.radius = Math.fround(Math.fround(profile.radius) * multiplier);
      // Native IMUL wraps to signed int32. Do not silently coerce missing or
      // out-of-range source energy to zero.
      if (Number.isInteger(profile.rayEnergy) && profile.rayEnergy >= -2147483648 && profile.rayEnergy <= 2147483647) {
        profile.rayEnergy = Math.imul(profile.rayEnergy, Math.trunc(multiplier));
      }
    }
    changedDigging ||= changesModeledEffect;
  };

  scaleProjectileExplosion(effective);
  const lifecycle = effective.diggingLifecycle;
  if (lifecycle?.secondaryProjectiles?.length) {
    if (lifecycle.kind === "random-projectile" && lifecycle.selection === "one-of") {
      // Fireworks use ordinary add_projectile calls. Keep equivalent variants
      // equivalent: no child-specific modifier metadata is attached.
      for (const child of lifecycle.secondaryProjectiles) {
        if (child.trigger === "cast") scaleProjectileExplosion(child.profile);
      }
    } else if (source.id === "PURPLE_EXPLOSION_FIELD") {
      // The helper calls GameShootProjectile with the original player's ID,
      // sending a fresh Message_Shot; it does not compound the parent's values.
      for (const child of lifecycle.secondaryProjectiles) scaleProjectileExplosion(child.profile);
      notes.add("Secondary explosions assume these effects remain active on their original caster when emitted.");
    } else if (lifecycle.kind === "delayed-projectiles") {
      // MEGALASER's beams start with disabled ProjectileComponents. The
      // verified shot-effect getter skips disabled components; later enabling
      // them does not resend the shot message.
      notes.add("Delayed beams start disabled, so this shot-effect boost does not scale their digging explosions.");
    } else if (source.id === "METEOR_RAIN") {
      // The additional effect entity has a different, unresolved shooter
      // context. One shared child profile cannot represent both emitter paths.
      notes.add("Meteorisade has multiple emitter contexts; secondary impacts keep their source settings where modifier inheritance is unverified.");
    } else {
      notes.add("Separately loaded creatures and scripted effects keep their own digging settings; player shot modifiers are not copied to them.");
    }
  }
  if (settings.glassCannon && settings.berserkium) {
    notes.add("The comparison applies Glass Cannon before Berserkium; a different effect acquisition order can change mixed boosts.");
    if (settings.glassCannon === 2) notes.add("Two Glass Cannon stacks fill both boost slots, so Berserkium adds no further boost in this order.");
  }
  if (positive(source.groundPenetrationCoeff)) {
    notes.add("Projectile penetration is unchanged; only an eligible impact explosion is scaled.");
  }
  if (!changedDigging && (positive(source.cellEaterRadius) || positive(source.blackHoleRadius))) {
    notes.add("Cell-eating and black-hole field sizes are unchanged by these shot modifiers.");
  }
  if (positive(source.laserBeamRadius)) notes.add("Beam width and terrain damage are unchanged by these shot modifiers.");
  if (source.explosionComponent === "LightningComponent") {
    notes.add("This separate lightning explosion is outside the verified ProjectileComponent boost; its source digging settings are retained.");
  }
  if (notes.size) effective.diggingModifierNotes = [...notes];
  return effective;
}
