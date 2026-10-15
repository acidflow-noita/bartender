import {existsSync, readFileSync} from "node:fs";
import {resolve} from "node:path";
import {XMLParser} from "fast-xml-parser";

const {defaults: documentedDefaults} = JSON.parse(readFileSync(new URL("./raw_data/component-defaults.json", import.meta.url), "utf8"));

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
  return function readEntity(projectilePath, ancestors = new Set()) {
    if (cache.has(projectilePath)) return cache.get(projectilePath);
    if (!projectilePath?.startsWith("data/entities/") || ancestors.has(projectilePath)) return {};
    const filename = gameDataDirectory
      ? resolve(gameDataDirectory, projectilePath.slice("data/".length))
      : resolve(rawDirectory, projectilePath.slice("data/entities/".length));
    if (!existsSync(filename)) return {};
    const entity = parser.parse(readFileSync(filename, "utf8")).Entity;
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
  };
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
    return explicit ?? resolved[component]?.[dumpProperty] ?? (present ? documentedDefaults[component]?.[property] : undefined);
  };
  const number = (...args) => optionalNumber(value(...args));
  const boolean = (...args) => optionalBoolean(value(...args));
  const hasData = Object.keys(raw).length > 0 || Object.keys(resolved).length > 0;
  const explosionComponent = raw.LightningComponent || resolved.LightningComponent ? "LightningComponent" : "ProjectileComponent";
  const enriched = {...spell, name_and_id: `${spell.name} (${spell.id})`};
  for (const field of ["projectilePaths", "explosionComponent", "laserBeamRadius", "laserMaxLength", "laserCellDamage",
    "laserMaxDuraToDestroy", "explosionHoleEnabled", "explosionDontDamageToCells", "cellEaterEatDynamicPhysicsBodies",
    "cellEaterIgnoredMaterial", "cellEaterEatProbability", "cellEaterOnlyStain"]) delete enriched[field];
  // These values describe the same cast entity. Missing/ambiguous mappings do
  // not inherit a different projectile's stats or become zero digging.
  Object.assign(enriched, {
    radius: number(explosionComponent, "config_explosion.explosion_radius", "explosion_radius"),
    rayEnergy: number(explosionComponent, "config_explosion.ray_energy", "ray_energy"),
    maxDuraToDestroy: number(explosionComponent, "config_explosion.max_durability_to_destroy", "explosion_max_durability_to_destroy"),
    groundPenetrationCoeff: number("ProjectileComponent", "ground_penetration_coeff"),
    groundPenetrationMaxDura: number("ProjectileComponent", "ground_penetration_max_durability_to_destroy"),
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
  return enriched;
}
