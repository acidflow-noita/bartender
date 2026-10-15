import {existsSync, readFileSync} from "node:fs";
import {resolve} from "node:path";
import {XMLParser} from "fast-xml-parser";
import {createHash} from "node:crypto";

const {defaults: documentedDefaults} = JSON.parse(readFileSync(new URL("./raw_data/component-defaults.json", import.meta.url), "utf8"));
const {spells: lifecycleDefinitions} = JSON.parse(readFileSync(new URL("./raw_data/digging-lifecycles.json", import.meta.url), "utf8"));
const {sha256: sourceHashes} = JSON.parse(readFileSync(new URL("./raw_data/digging-source-hashes.json", import.meta.url), "utf8"));

export function optionalNumber(value) {
  if (!["number", "string"].includes(typeof value) || (typeof value === "string" && value.trim() === "")) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

const optionalBoolean = (value) => value === true || value === 1 || value === "1" || value === "true" ? true
  : value === false || value === 0 || value === "0" || value === "false" ? false : null;
const array = (value) => value == null ? [] : Array.isArray(value) ? value : [value];

// Keep the directory: deck/lightning.xml and lightning.xml are different entities.
export function parseComponentDump(content) {
  const entries = new Map();
  const sections = content.split(/=== (.+\.xml) ===/);
  for (let i = 1; i < sections.length; i += 2) {
    const components = {};
    let component;
    for (const line of sections[i + 1].split(/\r?\n/)) {
      const header = line.match(/^(\w+Component):\s*$/);
      if (header) {
        component = components[header[1]] = {};
        continue;
      }
      const property = line.match(/^\s+([^:]+):\s*(.*?)\s*$/);
      if (!property || !component) continue;
      const [, key, value] = property;
      component[key] = value === "" ? null : value === "true" ? true : value === "false" ? false
        : optionalNumber(value) ?? value;
    }
    entries.set(`data/entities/projectiles/${sections[i]}`, components);
  }
  return entries;
}

export function parseLuaActions(content) {
  // Commented-out actions must not become live entries, and an absent projectile
  // must never let a match continue into the next action's related_projectiles.
  const lua = content.replace(/--\[(=*)\[[\s\S]*?\]\1\]/g, "").replace(/--[^\r\n]*/g, "");
  const ids = [...lua.matchAll(/^\s*id\s*=\s*"([^"]+)"/gm)];
  return new Map(ids.map((match, index) => {
    const body = lua.slice(match.index, ids[index + 1]?.index);
    const paths = [...new Set([...body.matchAll(/\badd_projectile(?:_trigger_\w+)?\s*\(\s*"([^"]+\.xml)"\s*[,)]/g)]
      .map((projectile) => projectile[1]))];
    // The action body is authoritative: Plasma Cross's related_projectiles
    // metadata names the single beam even though the action casts the cross.
    return [match[1], paths];
  }));
}

const parser = new XMLParser({ignoreAttributes: false, attributeNamePrefix: "", parseAttributeValue: true});

function merge(base, override) {
  const result = {...base};
  for (const [key, value] of Object.entries(override)) {
    result[key] = value && typeof value === "object" && !Array.isArray(value)
      ? merge(result[key], value) : value;
  }
  return result;
}

export function createEntityReader({rawDirectory, gameDataDirectory} = {}) {
  const cache = new Map();
  const sourceCache = new Map();
  const readSource = (sourcePath) => {
    if (sourceCache.has(sourcePath)) return sourceCache.get(sourcePath);
    if (!sourcePath?.startsWith("data/")) return null;
    const relative = sourcePath === "data/scripts/gun/gun_actions.lua"
      ? "../spells_xml_parser_for_CE/gun_actions.lua"
      : sourcePath.replace(/^data\/entities\//, "").replace(/^data\//, "");
    const filename = gameDataDirectory
      ? resolve(gameDataDirectory, sourcePath.slice("data/".length)) : resolve(rawDirectory, relative);
    const text = existsSync(filename) ? readFileSync(filename, "utf8") : null;
    sourceCache.set(sourcePath, text);
    return text;
  };
  function readEntity(projectilePath, ancestors = new Set()) {
    if (cache.has(projectilePath)) return cache.get(projectilePath);
    if (!projectilePath?.startsWith("data/entities/") || ancestors.has(projectilePath)) return {};
    const text = readSource(projectilePath);
    if (text === null) return {};
    const entity = parser.parse(text).Entity;
    if (!entity) return {};
    const components = {};
    const nextAncestors = new Set([...ancestors, projectilePath]);
    for (const base of array(entity.Base)) {
      Object.assign(components, readEntity(base.file, nextAncestors));
      for (const [name, overrides] of Object.entries(base)) {
        if (!name.endsWith("Component")) continue;
        const inherited = array(components[name]);
        components[name] = array(overrides).map((override, index) => merge(inherited[index], override));
      }
    }
    for (const [name, value] of Object.entries(entity)) {
      if (name.endsWith("Component")) components[name] = [...array(components[name]), ...array(value)];
    }
    cache.set(projectilePath, components);
    return components;
  }
  readEntity.readSource = readSource;
  readEntity.sourceMatches = (sourcePath) => {
    const text = readSource(sourcePath);
    return text !== null && sourceHashes[sourcePath] === createHash("sha256").update(text.replace(/\r\n/g, "\n")).digest("hex");
  };
  return readEntity;
}

const conflictingProperty = Symbol("conflicting component values");

function commonProperty(components, property) {
  const values = array(components).map((component) => property.split(".").reduce((value, key) => value?.[key], component));
  if (!values.length) return undefined;
  return values.every((value) => value === values[0]) ? values[0] : conflictingProperty;
}

export function enrichSpellWithXMLData(spell, dump, actions, readEntity) {
  const paths = actions.get(spell.id) ?? [];
  const projectilePath = paths.length === 1 ? paths[0] : null;
  const resolved = dump.get(projectilePath) ?? {};
  const raw = projectilePath ? readEntity(projectilePath) : {};
  const value = (component, property, dumpProperty = property) => {
    const explicit = commonProperty(raw[component], property);
    // The historical dump retained only the first component. It cannot resolve
    // conflicting values on multiple emitters or other repeated components.
    if (explicit === conflictingProperty) return undefined;
    const present = array(raw[component]).length > 0 || Object.hasOwn(resolved, component);
    const objectProperty = property.startsWith("config_explosion.") ? property.slice("config_explosion.".length) : null;
    const actualExplosionObject = array(raw[component]).length > 0 &&
      (["ProjectileComponent", "LightningComponent"].includes(component) || array(raw[component]).every((entry) => entry.config_explosion !== undefined));
    return explicit ?? resolved[component]?.[dumpProperty] ??
      (objectProperty && actualExplosionObject ? documentedDefaults.ConfigExplosion[objectProperty] : undefined) ??
      (present ? documentedDefaults[component]?.[property] : undefined);
  };
  const number = (...args) => optionalNumber(value(...args));
  const boolean = (...args) => optionalBoolean(value(...args));
  const hasData = Object.keys(raw).length > 0 || Object.keys(resolved).length > 0;
  const explosionComponent = raw.LightningComponent || resolved.LightningComponent ? "LightningComponent" : "ProjectileComponent";
  const deathExplosion = boolean("ProjectileComponent", "on_death_explode");
  const lifetimeExplosion = boolean("ProjectileComponent", "on_lifetime_out_explode");
  const explosionEnabled = boolean(explosionComponent, "_enabled") === false ? false
    : explosionComponent === "LightningComponent" ? number("LightningComponent", "explosion_type") === 1 ? true : null
    : deathExplosion === true || lifetimeExplosion === true ? true
    : deathExplosion === false && lifetimeExplosion === false ? false : null;
  const explicitExplosionRadius = commonProperty(raw[explosionComponent], "config_explosion.explosion_radius");
  const radiusWasSpecified = explicitExplosionRadius !== undefined && explicitExplosionRadius !== conflictingProperty ||
    resolved[explosionComponent]?.explosion_radius != null;
  const enriched = {...spell, name_and_id: `${spell.name} (${spell.id})`};
  for (const field of ["projectilePaths", "explosionComponent", "laserBeamRadius", "laserMaxLength", "laserCellDamage",
    "laserMaxDuraToDestroy", "explosionHoleEnabled", "explosionDontDamageToCells", "cellEaterEatDynamicPhysicsBodies",
    "cellEaterIgnoredMaterial", "cellEaterEatProbability", "cellEaterOnlyStain", "conversionEffects", "diggingLifecycle", "projectileMotion", "explosionEnabled"]) delete enriched[field];
  // These values describe the same cast entity. Missing/ambiguous mappings do
  // not inherit a different projectile's stats or become zero digging.
  Object.assign(enriched, {
    radius: radiusWasSpecified || explosionEnabled ? number(explosionComponent, "config_explosion.explosion_radius", "explosion_radius") : null,
    rayEnergy: number(explosionComponent, "config_explosion.ray_energy", "ray_energy"),
    maxDuraToDestroy: number(explosionComponent, "config_explosion.max_durability_to_destroy", "explosion_max_durability_to_destroy"),
    groundPenetrationCoeff: number("ProjectileComponent", "ground_penetration_coeff"),
    groundPenetrationMaxDura: number("ProjectileComponent", "ground_penetration_max_durability_to_destroy"),
    physicsImpulseCoeff: number("ProjectileComponent", "physics_impulse_coeff"),
    spawnEntity: value("ProjectileComponent", "spawn_entity") ?? null,
    spawnEntityIsProjectile: boolean("ProjectileComponent", "spawn_entity_is_projectile"),
    cellEaterRadius: number("CellEaterComponent", "radius"),
    cellEaterLimitedMaterials: boolean("CellEaterComponent", "limited_materials"),
    cellEaterIgnoredMaterialTag: value("CellEaterComponent", "ignored_material_tag") ?? null,
    // The old dump records only a count, never the material IDs themselves.
    cellEaterMaterials: null,
    blackHoleRadius: number("BlackHoleComponent", "radius"),
    magicConvertRadius: number("MagicConvertMaterialComponent", "radius"),
    magicConvertIsCircle: boolean("MagicConvertMaterialComponent", "is_circle"),
    magicConvertFromAnyMaterial: boolean("MagicConvertMaterialComponent", "from_any_material"),
    hasPhysicsBody: raw.PhysicsBodyComponent || resolved.PhysicsBodyComponent ? true : null,
    xmlDataSource: hasData ? "parsed" : null,
    projectilePath,
  });
  if (raw[explosionComponent] || resolved[explosionComponent]) enriched.explosionEnabled = explosionEnabled;
  if (explosionComponent !== "ProjectileComponent") enriched.explosionComponent = explosionComponent;
  if (paths.length > 1) enriched.projectilePaths = paths;
  if (hasData) {
    for (const [field, component, property] of [
      ["mass", "VelocityComponent", "mass"],
      ["airFriction", "VelocityComponent", "air_friction"],
      ["gravity", "VelocityComponent", "gravity_y"],
      ["speedMin", "ProjectileComponent", "speed_min"],
      ["speedMax", "ProjectileComponent", "speed_max"],
    ]) enriched[field] = number(component, property);
  }
  if (raw.ProjectileComponent || resolved.ProjectileComponent) {
    enriched.lifetime = number("ProjectileComponent", "lifetime");
    enriched.lifetimeRandom = number("ProjectileComponent", "lifetime_randomness");
    enriched.projectileMotion = {
      componentEnabled: boolean("ProjectileComponent", "_enabled"),
      lifetimeFrames: enriched.lifetime,
      lifetimeRandomness: enriched.lifetimeRandom,
      entityLifetimeFrames: number("LifetimeComponent", "lifetime"),
      gravityX: number("VelocityComponent", "gravity_x"),
      terminalVelocity: number("VelocityComponent", "terminal_velocity"),
      applyTerminalVelocity: boolean("VelocityComponent", "apply_terminal_velocity"),
      updatesVelocity: boolean("VelocityComponent", "updates_velocity"),
      limitToMaxVelocity: boolean("VelocityComponent", "limit_to_max_velocity"),
      liquidDrag: number("VelocityComponent", "liquid_drag"),
      projectileFriction: number("ProjectileComponent", "friction"),
      collideWithWorld: boolean("ProjectileComponent", "collide_with_world"),
      onCollisionDie: boolean("ProjectileComponent", "on_collision_die"),
      onCollisionRemoveProjectile: boolean("ProjectileComponent", "on_collision_remove_projectile"),
      penetrateWorld: boolean("ProjectileComponent", "penetrate_world"),
      penetrateWorldVelocityCoeff: number("ProjectileComponent", "penetrate_world_velocity_coeff"),
      bouncesLeft: number("ProjectileComponent", "bounces_left"),
      bounceEnergy: number("ProjectileComponent", "bounce_energy"),
      dieOnLowVelocity: boolean("ProjectileComponent", "die_on_low_velocity"),
      dieOnLowVelocityLimit: number("ProjectileComponent", "die_on_low_velocity_limit"),
      dieOnLiquidCollision: boolean("ProjectileComponent", "die_on_liquid_collision"),
      doMoveToUpdate: boolean("ProjectileComponent", "do_moveto_update"),
      onDeathExplode: boolean("ProjectileComponent", "on_death_explode"),
      onLifetimeOutExplode: boolean("ProjectileComponent", "on_lifetime_out_explode"),
    };
  }
  if (raw.LaserEmitterComponent || resolved.LaserEmitterComponent) {
    enriched.laserBeamRadius = number("LaserEmitterComponent", "laser.beam_radius", "beam_radius");
    enriched.laserMaxLength = number("LaserEmitterComponent", "laser.max_length", "max_length");
    enriched.laserCellDamage = number("LaserEmitterComponent", "laser.damage_to_cells", "damage_to_cells");
    enriched.laserMaxDuraToDestroy = number("LaserEmitterComponent", "laser.max_cell_durability_to_destroy", "max_cell_durability_to_destroy");
  }
  for (const [field, component, property, dumpProperty] of [
    ["explosionHoleEnabled", explosionComponent, "config_explosion.hole_enabled", "hole_enabled"],
    ["explosionDontDamageToCells", "ProjectileComponent", "explosion_dont_damage_to_cells"],
    ["cellEaterEatDynamicPhysicsBodies", "CellEaterComponent", "eat_dynamic_physics_bodies"],
    ["cellEaterOnlyStain", "CellEaterComponent", "only_stain"],
  ]) {
    const flag = boolean(component, property, dumpProperty);
    if (flag !== null) enriched[field] = flag;
  }
  const ignored = value("CellEaterComponent", "ignored_material");
  if (ignored != null) enriched.cellEaterIgnoredMaterial = ignored;
  const probability = number("CellEaterComponent", "eat_probability");
  if (probability !== null) enriched.cellEaterEatProbability = probability;
  const materials = value("CellEaterComponent", "materials");
  if (typeof materials === "string") enriched.cellEaterMaterials = materials.split(",").map((id) => id.trim()).filter(Boolean);
  const conversionEffects = conversionProfiles(raw, projectilePath, readEntity);
  if (conversionEffects.length) enriched.conversionEffects = conversionEffects;
  const lifecycle = lifecycleDefinitions[spell.id];
  if (lifecycle) enriched.diggingLifecycle = lifecycleProfile(lifecycle, dump, readEntity);
  return enriched;
}

function conversionProfiles(raw, sourcePath, readEntity) {
  const defaults = documentedDefaults.MagicConvertMaterialComponent;
  const list = (value) => typeof value === "string" ? value.split(",").map((id) => id.trim()).filter(Boolean) : null;
  const materialName = (value) => value === 0 || value === "" ? "air" : value ?? null;
  return array(raw.MagicConvertMaterialComponent).map((component, componentIndex) => {
    const property = (name) => component[name] ?? defaults[name];
    const effect = {
      sourcePath, componentIndex,
      enabled: optionalBoolean(component._enabled) ?? true,
      radius: optionalNumber(property("radius")),
      minRadius: optionalNumber(property("min_radius")),
      isCircle: optionalBoolean(property("is_circle")),
      stepsPerFrame: optionalNumber(property("steps_per_frame")),
      fromAnyMaterial: optionalBoolean(property("from_any_material")),
      fromMaterial: materialName(property("from_material")),
      fromTag: property("from_material_tag") ?? null,
      fromArray: list(property("from_material_array")),
      toMaterial: materialName(property("to_material")),
      toArray: list(property("to_material_array")),
      convertEntities: optionalBoolean(property("convert_entities")),
      loop: optionalBoolean(property("loop")),
      killWhenFinished: optionalBoolean(property("kill_when_finished")),
      convertSameMaterial: optionalBoolean(property("convert_same_material")),
      cleanStains: optionalBoolean(property("clean_stains")),
      extinguishFire: optionalBoolean(property("extinguish_fire")),
      fanTheFlames: optionalNumber(property("fan_the_flames")),
      temperatureReactionTemp: optionalNumber(property("temperature_reaction_temp")),
      igniteMaterials: optionalNumber(property("ignite_materials")),
    };
    // The native core always scans terrain. convert_entities adds an entity
    // pass afterward; it does not turn off this component's terrain scan.
    effect.target = effect.convertEntities ? "terrain-and-entities" : "terrain";
    const grassScript = "data/scripts/projectiles/touch_grass.lua";
    if (componentIndex === 0 && array(raw.LuaComponent).some((script) => script.script_source_file === grassScript)) {
      effect.conditionSource = grassScript;
      if (readEntity.sourceMatches?.(grassScript)) {
        effect.disabledWhen = {global: "TOUCHING_GRASS", equals: "1"};
      } else {
        effect.conditionUnverified = true;
      }
    }
    return effect;
  });
}

function lifecycleProfile(definition, dump, readEntity) {
  const sourcePaths = [...new Set([...definition.sourcePaths,
    ...(definition.secondaryProjectiles ?? []).map((child) => child.projectilePath)])];
  const unverifiedSourcePaths = sourcePaths.filter((path) => !readEntity.sourceMatches?.(path));
  // Script-derived counts and timing are curated for the recorded build.
  // An alternate source tree must match before those values are reused.
  if (unverifiedSourcePaths.length) return {kind: "unverified-script", sourcePaths, unverifiedSourcePaths};
  const lifecycle = structuredClone(definition);
  if (lifecycle.secondaryProjectiles) lifecycle.secondaryProjectiles = lifecycle.secondaryProjectiles.map((child) => {
    const id = `source:${child.projectilePath}:${child.sourceComponent ?? "ProjectileComponent"}:${child.componentIndex ?? 0}`;
    const profile = enrichSpellWithXMLData({id, name: child.name}, dump, new Map([[id, [child.projectilePath]]]), readEntity);
    if (child.sourceComponent === "ExplosionComponent") {
      // A creature's death/timer explosion is not its ProjectileComponent's
      // disabled impact explosion. Retain the actual selected component.
      const component = array(readEntity(child.projectilePath).ExplosionComponent)[child.componentIndex ?? 0];
      const explosion = component?.config_explosion ?? {};
      const objectExists = component?.config_explosion !== undefined;
      const objectValue = (property) => explosion[property] ?? (objectExists ? documentedDefaults.ConfigExplosion[property] : undefined);
      profile.explosionEnabled = optionalBoolean(component?._enabled) !== false && ["ON_DEATH", "ON_TIMER"].includes(component?.trigger);
      profile.radius = optionalNumber(explosion.explosion_radius ?? (profile.explosionEnabled ? objectValue("explosion_radius") : undefined));
      profile.rayEnergy = optionalNumber(objectValue("ray_energy"));
      profile.maxDuraToDestroy = optionalNumber(objectValue("max_durability_to_destroy"));
      profile.explosionHoleEnabled = optionalBoolean(explosion.hole_enabled);
      profile.explosionComponent = "ExplosionComponent";
      profile.explosionComponentIndex = child.componentIndex ?? 0;
    }
    if (child.trigger === "delayed-activation" && profile.projectileMotion) {
      // megalaser_launch.lua enables every component on the retained beams.
      // This profile is conditional on that activation, not their disabled
      // state at the instant they were created.
      profile.projectileMotion.componentEnabled = true;
      profile.explosionEnabled = profile.projectileMotion.onDeathExplode === true || profile.projectileMotion.onLifetimeOutExplode === true;
    }
    delete profile.name_and_id;
    return {...child, profile};
  });
  return lifecycle;
}
