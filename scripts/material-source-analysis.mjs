import {XMLParser} from "fast-xml-parser";

const parser = new XMLParser({preserveOrder: true, ignoreAttributes: false, attributeNamePrefix: "",
  parseAttributeValue: false, parseTagValue: false, trimValues: false});
const materialPattern = /^[a-z][a-z0-9_]*$/;
const documentationPath = "noita_bin/tools_modding/component_documentation.txt";
const own = (object, field) => Object.prototype.hasOwnProperty.call(object, field);
const number = (value) => value == null || String(value).trim() === "" ? null
  : Number.isFinite(Number(value)) ? Number(value) : null;
const flag = (value, fallback = null) => value === "1" || value === "true" || value === true ? true
  : value === "0" || value === "false" || value === false ? false : fallback;
const unique = (values) => [...new Set(values)];
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function location(text, offset, path) {
  const before = text.slice(0, offset);
  return {path, line: before.split(/\r\n|\r|\n/).length,
    column: before.length - Math.max(before.lastIndexOf("\n"), before.lastIndexOf("\r"))};
}

function parseNodes(xml, path) {
  // Preserve offsets, including newlines in comments, for evidence locations.
  const source = xml.replace(/<!--[\s\S]*?-->/g, (value) => value.replace(/[^\r\n]/g, " "));
  const starts = [...source.matchAll(/<(?![!?/])([A-Za-z_:][\w:.-]*)\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/g)];
  let cursor = 0;
  const convert = (entries, parentPath = "") => {
    const counts = new Map(), nodes = [];
    for (const entry of entries ?? []) {
      const name = Object.keys(entry).find(key => key !== ":@" && !key.startsWith("#") && !key.startsWith("?"));
      if (!name) continue;
      const occurrence = (counts.get(name) ?? 0) + 1;
      counts.set(name, occurrence);
      const componentPath = `${parentPath}/${name}[${occurrence}]`;
      while (cursor < starts.length && starts[cursor][1] !== name) cursor++;
      const start = starts[cursor++];
      const offset = start?.index ?? 0;
      const origin = {...location(source, offset, path), componentPath};
      const attrs = entry[":@"] ?? {}, origins = {};
      for (const field of Object.keys(attrs)) {
        const match = start?.[0].match(new RegExp(`\\s${escape(field)}\\s*=`));
        origins[field] = {...location(source, offset + (match?.index ?? 0) + (match ? 1 : 0), path), componentPath};
      }
      nodes.push({name, attrs, origins, origin, children: convert(entry[name], componentPath), guards: []});
    }
    return nodes;
  };
  return convert(parser.parse(source));
}

function addGuards(node, guards) {
  return {...node, guards: unique([...node.guards, ...guards]), children: node.children.map(child => addGuards(child, guards))};
}

function mergeOverride(base, override) {
  const children = base.children.slice(), counts = new Map();
  for (const child of override.children) {
    const ordinal = counts.get(child.name) ?? 0;
    counts.set(child.name, ordinal + 1);
    const matches = children.flatMap((item, index) => item.name === child.name ? [index] : []);
    if (matches[ordinal] == null) children.push(addGuards(child, ["inherited-component", "unmatched-base-override"]));
    else children[matches[ordinal]] = mergeOverride(children[matches[ordinal]], child);
  }
  return {...base, attrs: {...base.attrs, ...override.attrs}, origins: {...base.origins, ...override.origins}, children,
    guards: unique([...base.guards, ...override.guards, "inherited-component"])};
}

function resolveNodes(nodes, options, stack) {
  const output = [];
  for (const node of nodes) {
    if (node.name !== "Base") {
      output.push({...node, children: resolveNodes(node.children, options, stack)});
      continue;
    }
    const file = node.attrs.file;
    const overrides = resolveNodes(node.children, options, stack);
    let source;
    if (file && !stack.includes(file) && options.resolveBase) {
      source = options.resolveBase(file, node.origin.path);
      if (source && typeof source.then === "function") throw new TypeError("resolveBase must return XML synchronously");
    }
    const xml = typeof source === "string" ? source : source?.xml;
    if (typeof xml !== "string") {
      const guard = stack.includes(file) ? "inheritance-cycle" : "unresolved-base";
      output.push(...overrides.map(child => addGuards(child, ["inherited-component", guard])));
      continue;
    }
    const basePath = typeof source === "object" && source.path ? source.path : file;
    const parsed = resolveNodes(parseNodes(xml, basePath), options, [...stack, file]);
    const entities = parsed.filter(child => child.name === "Entity");
    const inherited = (entities.length === 1 ? entities[0].children : parsed).map(child => addGuards(child, ["inherited-component"]));
    const counts = new Map();
    for (const override of overrides) {
      const ordinal = counts.get(override.name) ?? 0;
      counts.set(override.name, ordinal + 1);
      const matches = inherited.flatMap((item, index) => item.name === override.name ? [index] : []);
      if (matches[ordinal] == null) inherited.push(addGuards(override, ["inherited-component", "unmatched-base-override"]));
      else inherited[matches[ordinal]] = mergeOverride(inherited[matches[ordinal]], override);
    }
    output.push(...inherited);
  }
  return output;
}

/**
 * Extract configured material uses, not proof that their entity/function runs.
 *
 * `productionEligible` describes local configuration only: true permits the
 * configured occurrence; false disables it; null leaves a required setting
 * unresolved. `conditional` also records event/input/inheritance requirements.
 * Inactive or unbound uses are templates with their intended `potentialKind`.
 * Inherited components remain conditional even when XML overrides are merged.
 *
 * `resolveBase(file, referringPath)` may synchronously return XML or {xml,path}.
 * It reads nothing by itself. `materialIds` optionally restricts recognized IDs.
 */
export function extractMaterialUses(xml, options = {}) {
  if (typeof xml !== "string") throw new TypeError("XML source must be a string");
  const path = options.path ?? "<xml>";
  const materialIds = options.materialIds == null ? null : new Set([...options.materialIds].map(value => typeof value === "string" ? value : value.id));
  const nodes = resolveNodes(parseNodes(xml, path), options, [path]);
  const observations = [];

  function observe(node, field, kind, settings = {}) {
    const raw = settings.material ?? node.attrs[field];
    if (typeof raw !== "string") return;
    const material = raw.trim();
    if (!materialPattern.test(material) || materialIds && !materialIds.has(material)) return;
    const unresolvedBase = node.guards.some(guard => guard === "unresolved-base" || guard === "inheritance-cycle");
    const enabled = own(node.attrs, "_enabled") ? flag(node.attrs._enabled) : unresolvedBase ? null : true;
    let eligible = own(settings, "eligible") ? settings.eligible : true;
    const guards = [...node.guards, ...(settings.guards ?? [])];
    if (enabled === false) {eligible = false; guards.push("component-disabled", "activation-not-established");}
    else if (enabled === null) {if (eligible !== false) eligible = null; guards.push("component-activation-unresolved");}
    if (unresolvedBase && eligible !== false) eligible = null;
    if (settings.defaultSource && unresolvedBase) {eligible = null; guards.push("default-may-be-overridden-by-base");}
    if (node.attrs._tags) guards.push("component-tags-may-control-activation");
    const evidence = {...(node.origins[field] ?? node.origin), attribute: field};
    if (settings.defaultSource) evidence.defaultSource = settings.defaultSource;
    if (settings.arrayIndex != null) evidence.arrayIndex = settings.arrayIndex;
    observations.push({id: material, material, component: settings.component ?? node.name, field,
      occurrenceKind: eligible === true ? kind : "template", potentialKind: kind,
      enabled, productionEligible: eligible,
      conditional: eligible !== true || guards.length > 0,
      guards: unique(guards), evidence,
      ...(settings.inputs ? {inputs: settings.inputs} : {}),
      ...(settings.configuration ? {configuration: settings.configuration} : {})});
  }

  function positiveField(attrs, field, fallback = null) {
    const value = own(attrs, field) ? number(attrs[field]) : fallback;
    return value == null ? null : value > 0;
  }
  const combine = (...values) => values.includes(false) ? false : values.includes(null) ? null : true;

  function visit(node, parents) {
    const attrs = node.attrs;
    switch (node.name) {
      case "PhysicsImageShapeComponent": {
        const image = typeof attrs.image_file === "string" && attrs.image_file.trim();
        observe(node, "material", "physical", {eligible: image || flag(attrs.use_sprite) === true ? true : null,
          guards: ["requires-compatible-physics-body", ...(!image ? ["requires-resolved-sprite-image"] : [])]});
        break;
      }
      case "PixelSpriteComponent":
        observe(node, "material", flag(attrs.create_box2d_bodies, false) ? "physical" : "grid", {
          material: own(attrs, "material") ? attrs.material : "wood_loose",
          eligible: typeof attrs.image_file === "string" && attrs.image_file.trim() ? true : null,
          guards: attrs.image_file ? [] : ["requires-image"],
          ...(!own(attrs, "material") ? {defaultSource: {path: documentationPath, lines: [2107]}} : {})});
        break;
      case "ParticleEmitterComponent": {
        const count = own(attrs, "count_max") ? number(attrs.count_max) : number(attrs.count_min);
        const emitting = flag(attrs.is_emitting, true);
        const chance = positiveField(attrs, "emission_chance", 100);
        const guards = [];
        if (!emitting) guards.push("emission-disabled", "activation-not-established");
        if (count == null) guards.push("emission-count-unresolved");
        else if (count <= 0) guards.push("zero-emission-count");
        if (chance === false) guards.push("zero-emission-chance");
        if (number(attrs.delay_frames) > 0) guards.push("requires-surviving-emission-delay");
        const inventory = flag(attrs.use_material_inventory, false);
        if (inventory) guards.push("emits-inventory-instead-of-configured-material");
        const eligible = combine(emitting, count == null ? null : count > 0, chance, !inventory);
        const modes = [["create_real_particles", "grid"], ["emit_real_particles", "physical"], ["emit_cosmetic_particles", "cosmetic"]]
          .filter(([field]) => flag(attrs[field], false));
        if (!modes.length) observe(node, "emitted_material_name", "template", {eligible: node.guards.includes("unresolved-base") ? null : false,
          guards: [...guards, "no-configured-particle-mode"]});
        for (const [mode, kind] of modes) observe(node, "emitted_material_name", kind, {eligible, guards,
          configuration: {mode, ...(own(attrs, "_tags") ? {tags: attrs._tags} : {})}});
        break;
      }
      case "DamageModelComponent": {
        const blood = positiveField(attrs, "blood_multiplier", 1);
        observe(node, "blood_material", "physical", {eligible: blood, guards: ["requires-damage", ...(blood === false ? ["zero-blood-multiplier"] : [])]});
        observe(node, "blood_spray_material", "physical", {eligible: blood, guards: ["requires-death-blood-spray", ...(blood === false ? ["zero-blood-multiplier"] : [])]});
        const ragdoll = flag(attrs.create_ragdoll, true);
        observe(node, "ragdoll_material", "physical", {eligible: ragdoll,
          guards: ["requires-death-and-ragdoll-source", ...(ragdoll === false ? ["ragdoll-disabled"] : []),
            ...(attrs.ragdoll_fx_forced ? ["forced-ragdoll-effect-needs-review"] : [])]});
        break;
      }
      case "GameEffectComponent":
        observe(node, "ragdoll_material", "physical", {eligible: attrs.effect || attrs.ragdoll_effect ? true : null,
          guards: ["requires-active-effect-on-dying-host", "ragdoll-override-needs-review"]});
        break;
      case "MagicConvertMaterialComponent": {
        const eligible = combine(positiveField(attrs, "steps_per_frame", 10), positiveField(attrs, "radius", 256));
        const guards = ["requires-convertible-input", ...(eligible === false ? ["conversion-work-or-area-zero"] : [])];
        const from = (attrs.from_material_array ?? "").split(",").map(value => value.trim());
        const to = (attrs.to_material_array ?? "").split(",").map(value => value.trim());
        const hasArrays = Boolean(attrs.from_material_array || attrs.to_material_array);
        if (hasArrays) {
          const paired = from.length === to.length && from.every(Boolean) && to.every(Boolean);
          for (let index = 0; index < to.length; index++) observe(node, "to_material_array", "grid", {
            material: to[index], arrayIndex: index, eligible: combine(eligible, paired ? true : null),
            inputs: paired ? [from[index]] : [], guards: [...guards, ...(!paired ? ["unpaired-conversion-arrays"] : [])]});
        }
        if (own(attrs, "to_material")) {
          const hasSource = Boolean(attrs.from_material?.trim() || attrs.from_material_tag?.trim())
            || flag(attrs.from_any_material, false) || flag(attrs.convert_entities, false);
          observe(node, "to_material", "grid", {eligible: hasSource ? eligible : null,
            inputs: [attrs.from_material, attrs.from_material_tag].filter(Boolean), guards: [...guards,
              ...(!hasSource ? ["conversion-input-unresolved"] : []),
              ...(number(attrs.temperature_reaction_temp) ? ["temperature-mode-precedes-direct-conversion"] : []),
              ...(flag(attrs.convert_entities, false) ? ["entity-conversion-requires-suitable-host"] : [])]});
        }
        break;
      }
      case "Material": {
        const container = parents.at(-1), inventory = parents.at(-2);
        if (container?.name !== "count_per_material_type" || inventory?.name !== "MaterialInventoryComponent") break;
        const count = positiveField(attrs, "count");
        const inventoryNode = {...node, attrs: {...attrs, ...(own(inventory.attrs, "_enabled") ? {_enabled: inventory.attrs._enabled} : {})},
          guards: unique([...node.guards, ...inventory.guards])};
        observe(inventoryNode, "material", "physical", {eligible: count, component: "MaterialInventoryComponent",
          guards: ["inventory-content", "cell-access-requires-spill-leak-or-ingestion", ...(count === false ? ["zero-inventory-count"] : count == null ? ["inventory-count-unresolved"] : [])]});
        break;
      }
      case "MaterialSeaSpawnerComponent":
        observe(node, "material", "grid", {eligible: combine(positiveField(attrs, "speed", 10), positiveField(attrs, "size.x"), positiveField(attrs, "size.y")),
          guards: ["requires-nonempty-spawn-area"]});
        break;
      case "LooseGroundComponent": {
        const probability = positiveField(attrs, "chunk_probability", 0), count = number(attrs.chunk_count) ?? -1;
        observe(node, "chunk_material", "physical", {eligible: combine(probability, count !== 0),
          guards: ["requires-loosenable-nearby-terrain", ...(probability === false ? ["chunk-probability-zero"] : []), ...(count === 0 ? ["chunk-count-zero"] : [])]});
        break;
      }
      case "ProjectileComponent":
        observe(node, "shell_casing_material", "physical", {eligible: flag(attrs.create_shell_casing, false),
          guards: ["requires-projectile-shot", ...(!flag(attrs.create_shell_casing, false) ? ["shell-casing-disabled"] : [])]});
        observe(node, "on_death_emit_particle_type", "physical", {
          eligible: combine(flag(attrs.on_death_emit_particle, false), positiveField(attrs, "on_death_emit_particle_count", 1)),
          guards: ["requires-projectile-death", ...(!flag(attrs.on_death_emit_particle, false) ? ["death-emission-disabled"] : []),
            ...(positiveField(attrs, "on_death_emit_particle_count", 1) === false ? ["zero-death-emission-count"] : [])]});
        break;
      case "ArcComponent":
        observe(node, "material", "physical", {eligible: positiveField(attrs, "lifetime", 60),
          guards: ["requires-arc-target-and-type", "arc-cell-behavior-needs-review"]});
        break;
      case "MaterialComponent": {
        const min = number(attrs.material_min), max = number(attrs.material_max);
        observe(node, "material_name", "grid", {eligible: min != null && max != null && max <= min ? false : true,
          guards: ["requires-biome-placement", ...(min != null && max != null && max <= min ? ["empty-material-range"] : [])]});
        break;
      }
      case "VegetationComponent": {
        const visual = flag(attrs.is_visual), probability = positiveField(attrs, "tree_probability");
        const redirected = Boolean(attrs.load_this_xml_instead?.trim());
        observe(node, "tree_material", "grid", {
          eligible: combine(probability, visual == null ? null : !visual, !redirected, typeof attrs.tree_image_file === "string" && Boolean(attrs.tree_image_file.trim())),
          guards: ["requires-biome-placement", ...(visual == null ? ["vegetation-visual-mode-unresolved"] : []),
            ...(visual === true ? ["visual-only-vegetation"] : []),
            ...(redirected ? ["vegetation-loads-entity-instead"] : []), ...(probability === false ? ["vegetation-probability-zero"] : [])]});
        break;
      }
      case "config_explosion":
      case "ExplosionConfig": {
        const owner = parents.at(-1);
        const knownOwner = ["ProjectileComponent", "ExplosionComponent", "ExplodeOnDamageComponent", "LightningComponent", "CellData", "CellDataChild", "Reaction"].includes(owner?.name);
        if (!knownOwner) break;
        const ownerEnabled = flag(owner.attrs._enabled, true);
        const explosionNode = {...node, attrs: {...attrs, ...(!ownerEnabled ? {_enabled: "0"} : {})}, guards: unique([...node.guards, ...owner.guards])};
        observe(explosionNode, "create_cell_material", "grid", {eligible: positiveField(attrs, "create_cell_probability"),
          guards: ["requires-enabled-explosion-trigger", "explosion-cell-creation-conditions-need-review"]});
        observe(explosionNode, "spark_material", "physical", {eligible: combine(flag(attrs.sparks_enabled), positiveField(attrs, "sparks_count_max")),
          guards: ["requires-enabled-explosion-trigger", "explosion-spark-mode-needs-review"]});
        break;
      }
      // MaterialAreaChecker, PhysicsShape audio, food/damage filters, tags,
      // custom-color references and VariableStorage values are not producers.
    }
    for (const child of node.children) visit(child, [...parents, node]);
  }
  for (const node of nodes) visit(node, []);
  return observations;
}

/**
 * Candidate RGB keys for a caller-selected image-loading path.
 * Wang decoding (0x8704c0) rejects alpha-zero, black RGB and opaque-white.
 * Fixed-bitmap topology 1 (0x87d0e0) uses RGB without that alpha/white gate.
 * Conservative mode is their union so an unknown role does not lose possible
 * material colors. It does not prove assignment: marker dispatch, spawn
 * callbacks and caller remapping still need the image's loading context.
 */
export function imageMaterialColors({rgba}, {mode = "conservative"} = {}) {
  if (!rgba || rgba.length % 4 !== 0) throw new TypeError("Expected complete RGBA pixels");
  if (!["wang", "fixed-bitmap", "conservative"].includes(mode)) throw new TypeError("Unknown material image mode");
  const colors = new Set();
  for (let offset = 0; offset < rgba.length; offset += 4) {
    const alpha = rgba[offset + 3];
    const rgb = (rgba[offset] << 16) | (rgba[offset + 1] << 8) | rgba[offset + 2];
    if (rgb === 0 || mode === "wang" && (alpha === 0 || alpha === 255 && rgb === 0xffffff)) continue;
    colors.add(rgb.toString(16).padStart(6, "0"));
  }
  return colors;
}

// Noita executable SHA256 a0d9f9ca513e27a598c61dd9a19211c7a11d1477c9a2b93d909757d91d17d914.
// Constructor 0x4ac7e0 initializes these fields; CellDataChild copies the parent
// before 0x91e310/0x6fa4e0 overlays only attributes that are actually present.
// These values are native evidence, not inferred from the historical JSON dump.
export const NATIVE_MATERIAL_ELIGIBILITY_DEFAULTS = Object.freeze({
  cell_type: "liquid", liquid_sand: false, liquid_static: false, is_just_particle_fx: false,
});

/**
 * Reconstruct only the four flask eligibility fields from XML plus a verified
 * native baseline. Duplicate-definition precedence is deliberately not guessed:
 * every alternative must agree for these fields, or the reconstruction fails.
 * The result establishes registry eligibility, never natural material presence.
 */
export function reconstructMaterialEligibility(xml, {path = "<xml>", defaults = NATIVE_MATERIAL_ELIGIBILITY_DEFAULTS} = {}) {
  const fields = Object.keys(NATIVE_MATERIAL_ELIGIBILITY_DEFAULTS);
  const normalize = (field, value) => {
    if (field === "cell_type" && ["liquid", "solid", "gas", "fire"].includes(value)) return value;
    if (field !== "cell_type" && flag(value) !== null) return flag(value);
    throw new Error(`Invalid material eligibility value for ${field}: ${String(value)}`);
  };
  const baseline = Object.fromEntries(fields.map(field => [field, normalize(field, defaults[field])]));
  const definitions = [];
  const collect = (nodes) => {
    for (const node of nodes) {
      if (node.name === "CellData" || node.name === "CellDataChild") definitions.push(node);
      else collect(node.children);
    }
  };
  collect(parseNodes(xml, path));
  const groups = new Map();
  for (const definition of definitions) {
    const id = definition.attrs.name;
    if (typeof id !== "string" || !materialPattern.test(id)) throw new Error("Material definition has no valid name");
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(definition);
  }
  const memo = new Map();
  function resolveField(id, field, stack = []) {
    if (stack.includes(id)) throw new Error(`Material inheritance cycle: ${[...stack, id].join(" -> ")}`);
    const key = `${id}:${field}`;
    if (memo.has(key)) return memo.get(key);
    const choices = groups.get(id);
    if (!choices) throw new Error(`Missing material parent: ${id}`);
    const variants = choices.map(definition => {
      if (own(definition.attrs, field)) {
        return {value: normalize(field, definition.attrs[field]), origins: [{kind: "attribute", material: id,
          ...(definition.origins[field] ?? definition.origin), inheritance: [id]}]};
      }
      if (definition.name === "CellDataChild") {
        const parent = definition.attrs._parent;
        if (typeof parent !== "string" || !parent) throw new Error(`Material child ${id} has no parent`);
        const inherited = resolveField(parent, field, [...stack, id]);
        return {value: inherited.value, origins: inherited.origins.map(origin => ({...origin, inheritance: [id, ...origin.inheritance]}))};
      }
      return {value: baseline[field], origins: [{kind: "native-default", material: id, field, inheritance: [id]}]};
    });
    if (variants.some(variant => variant.value !== variants[0].value)) {
      throw new Error(`Duplicate material definitions disagree for ${id}.${field}; review loader precedence`);
    }
    const origins = [...new Map(variants.flatMap(variant => variant.origins).map(origin => [JSON.stringify(origin), origin])).values()];
    const resolved = {value: variants[0].value, origins};
    memo.set(key, resolved);
    return resolved;
  }
  const materialSources = {};
  const materials = [...groups.keys()].sort().map(id => {
    const resolved = Object.fromEntries(fields.map(field => [field, resolveField(id, field)]));
    materialSources[id] = Object.fromEntries(fields.map(field => [field, resolved[field].origins]));
    return {id, ...Object.fromEntries(fields.map(field => [field, resolved[field].value]))};
  });
  const flaskMaterials = materials.filter(material => material.id !== "air" && material.cell_type === "liquid"
    && !material.liquid_static && !material.is_just_particle_fx);
  return {materials, materialSources, definitionCount: definitions.length,
    duplicateDefinitions: [...groups].filter(([, entries]) => entries.length > 1).map(([id, entries]) => ({id,
      definitions: entries.map(entry => ({kind: entry.name, ...(entry.attrs._parent ? {parent: entry.attrs._parent} : {}), ...entry.origin}))})),
    nativeDefaults: baseline,
    flaskPool: {liquids: flaskMaterials.filter(material => !material.liquid_sand).map(material => material.id),
      sands: flaskMaterials.filter(material => material.liquid_sand).map(material => material.id)}};
}
