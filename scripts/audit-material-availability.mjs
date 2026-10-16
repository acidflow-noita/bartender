import {createHash} from "node:crypto";
import {readFileSync, writeFileSync, readdirSync, statSync, existsSync} from "node:fs";
import {dirname, resolve, extname} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import {inflateSync} from "node:zlib";
import {XMLParser} from "fast-xml-parser";
import {hasVerifiedUnusedEvidence, materialExclusionIndex} from "../src/components/materialAvailability.js";
import {extractMaterialUses, imageMaterialColors, reconstructMaterialEligibility} from "./material-source-analysis.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const parser = new XMLParser({ignoreAttributes: false, attributeNamePrefix: "", parseAttributeValue: false});
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const array = (value) => value == null ? [] : Array.isArray(value) ? value : [value];
const stripComments = (text, extension) => extension === ".xml"
  ? text.replace(/<!--[\s\S]*?-->/g, (comment) => comment.replace(/[^\n]/g, " "))
  : text.replace(/--\[(=*)\[[\s\S]*?\]\1\]/g, (comment) => comment.replace(/[^\n]/g, " "))
    .replace(/--[^\n]*/g, "");

export function randomFlaskPool(materials) {
  // Native enumeration starts at material ID 1; air/ID0 is excluded.
  const eligible = materials.filter((material) => material.id !== "air" && material.cell_type === "liquid"
    && material.liquid_static === false && material.is_just_particle_fx === false);
  return {liquids: eligible.filter((material) => material.liquid_sand === false).map((material) => material.id).sort(),
    sands: eligible.filter((material) => material.liquid_sand === true).map((material) => material.id).sort()};
}

export function scanMaterialNames(binary, materialIds) {
  return Object.fromEntries(materialIds.map((id) => [id, Object.fromEntries(["utf8", "utf16le"].map((encoding) => {
    const needle = Buffer.from(id, encoding), offsets = [];
    for (let from = 0;;) {
      const offset = binary.indexOf(needle, from);
      if (offset < 0) break;
      offsets.push(offset); from = offset + needle.length;
    }
    return [encoding, offsets];
  }))]));
}

// Decode source pixels, never rendered screenshots. All shipped biome PNGs
// use non-interlaced 8-bit RGB/RGBA/indexed data; reject other encodings.
export function decodePng(bytes) {
  if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error("Not PNG");
  let width, height, type, palette, transparency;
  const chunks = [];
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = bytes.readUInt32BE(offset), name = bytes.toString("ascii", offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (name === "IHDR") {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4); type = data[9];
      if (data[8] !== 8 || data[12] !== 0 || ![2, 3, 6].includes(type)) throw new Error("Unsupported PNG encoding");
    } else if (name === "PLTE") palette = data;
    else if (name === "tRNS") transparency = data;
    else if (name === "IDAT") chunks.push(data);
    offset += 12 + length;
  }
  const channels = type === 6 ? 4 : type === 2 ? 3 : 1;
  const stride = width * channels, raw = inflateSync(Buffer.concat(chunks));
  if (raw.length !== height * (stride + 1)) throw new Error("Unexpected PNG scanline size");
  const pixels = Buffer.alloc(width * height * channels);
  const paeth = (a, b, c) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    if (filter > 4) throw new Error("Invalid PNG filter");
    for (let x = 0; x < stride; x++) {
      const index = y * stride + x;
      const left = x >= channels ? pixels[index - channels] : 0;
      const up = y ? pixels[index - stride] : 0;
      const diagonal = y && x >= channels ? pixels[index - stride - channels] : 0;
      pixels[index] = raw[y * (stride + 1) + x + 1]
        + [0, left, up, Math.floor((left + up) / 2), paeth(left, up, diagonal)][filter];
    }
  }
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    if (type === 3) {
      const index = pixels[i];
      if (!palette || index * 3 + 2 >= palette.length) throw new Error("Invalid PNG palette");
      rgba.set(palette.subarray(index * 3, index * 3 + 3), i * 4);
      rgba[i * 4 + 3] = transparency?.[index] ?? 255;
    } else {
      rgba.set(pixels.subarray(i * channels, i * channels + 3), i * 4);
      const transparentRgb = type === 2 && transparency?.length === 6
        && pixels[i * channels] === transparency.readUInt16BE(0)
        && pixels[i * channels + 1] === transparency.readUInt16BE(2)
        && pixels[i * channels + 2] === transparency.readUInt16BE(4);
      rgba[i * 4 + 3] = type === 6 ? pixels[i * channels + 3] : transparentRgb ? 0 : 255;
    }
  }
  return {width, height, rgba};
}

// PLZ stores width, height, four channels, compressed size and original size,
// followed by a FastLZ stream. Validate every copy and the exact output size.
export function decodePlz(bytes) {
  if (bytes.length < 25 || bytes.readUInt32LE(0) !== 1 || bytes.readUInt32LE(12) !== 4) throw new Error("Unsupported PLZ header");
  // Some shipped empty splice fragments have negative dimensions. Their
  // stored byte count still equals abs(width * height) * four channels.
  const sourceWidth = bytes.readInt32LE(4), sourceHeight = bytes.readInt32LE(8);
  const width = Math.abs(sourceWidth), height = Math.abs(sourceHeight);
  const compressed = bytes.readUInt32LE(16), size = bytes.readUInt32LE(20);
  if (size !== width * height * 4 || bytes.length !== compressed + 24) throw new Error("Invalid PLZ length");
  if (compressed === size) return {width, height, sourceWidth, sourceHeight, rgba: Buffer.from(bytes.subarray(24))};
  const input = bytes.subarray(24), rgba = Buffer.alloc(size), level = (input[0] >> 5) + 1;
  if (![1, 2].includes(level)) throw new Error("Unsupported FastLZ level");
  let position = 1, output = 0, control = input[0] & 31;
  while (true) {
    if (control < 32) {
      const length = control + 1;
      if (position + length > input.length || output + length > size) throw new Error("Invalid FastLZ literal");
      input.copy(rgba, output, position, position + length);
      output += length; position += length;
    } else {
      let length = (control >> 5) - 1;
      const highOffset = (control & 31) << 8;
      if (length === 6) {
        let extra;
        do { extra = input[position++]; if (extra === undefined) throw new Error("Truncated FastLZ length"); length += extra; }
        while (level === 2 && extra === 255);
      }
      const lowOffset = input[position++];
      let reference = output - highOffset - lowOffset - 1;
      if (level === 2 && lowOffset === 255 && highOffset === 31 << 8) {
        const farOffset = (input[position++] << 8) + input[position++];
        reference = output - farOffset - 8192;
      }
      length += 3;
      if (!Number.isInteger(reference) || reference < 0 || reference >= output || output + length > size) throw new Error("Invalid FastLZ backreference");
      for (let i = 0; i < length; i++) rgba[output++] = rgba[reference++];
    }
    if (position >= input.length) break;
    control = input[position++];
  }
  if (output !== size || position !== input.length) throw new Error("Incomplete PLZ output");
  return {width, height, sourceWidth, sourceHeight, rgba};
}

export function pixelColors({rgba}) {
  const colors = new Set();
  for (let i = 0; i < rgba.length; i += 4) {
    colors.add(((rgba[i + 3] * 0x1000000) + (rgba[i] << 16) + (rgba[i + 1] << 8) + rgba[i + 2]).toString(16).padStart(8, "0"));
  }
  return colors;
}

export function expandTaggedReactions(reactions, materials) {
  const fields = ["input_cell1", "input_cell2", "input_cell3", "output_cell1", "output_cell2", "output_cell3"];
  return reactions.flatMap((reaction) => {
    // [meltable]_molten names a variant of the bound input material; a bare
    // [meltable] output in its cooling reaction restores that same material.
    const boundTags = [...new Set(fields.flatMap((field) => reaction[field]?.match(/^(\[[^\]]+\]).+/)?.[1] ?? []))];
    let expanded = [reaction];
    for (const tag of boundTags) {
      expanded = expanded.flatMap((entry) => materials.filter((material) => material.tags.includes(tag)).map((material) =>
        Object.fromEntries(Object.entries(entry).map(([field, value]) => [field,
          fields.includes(field) && typeof value === "string" ? value.replace(tag, material.id) : value]))));
    }
    return expanded;
  });
}

function walk(root) {
  return readdirSync(root, {recursive: true}).filter((path) => statSync(resolve(root, path)).isFile()).sort();
}

// A directory name is a review hint, never proof that the engine cannot load it.
const sourcePathHint = (path) => /^(temp|debug|translations)\//.test(path) || /\/(?:_workdir|trailer|test|tests)\//.test(path);
const roots = ["magic_numbers.xml", "entities/player.xml", "scripts/gun/gun_actions.lua", "scripts/perks/perk_list.lua",
  "scripts/items/chest_random.lua", "scripts/items/chest_random_super.lua", "scripts/magic/fungal_shift.lua", "biome/_pixel_scenes.xml"];

export function auditMaterialAvailability({gameDataDirectory, executablePath}) {
  const gameRoot = resolve(gameDataDirectory);
  const runtimeBytes = readFileSync(resolve(repo, "src/data/materials.json"));
  const binary = readFileSync(executablePath ?? resolve(gameRoot, "../noita_bin/noita.exe"));
  const evidenceBytes = readFileSync(resolve(repo, "src/data/material-availability/source-evidence.json"));
  for (const source of JSON.parse(evidenceBytes).sources) {
    const path = source.path.startsWith("data/") ? resolve(gameRoot, source.path.slice(5))
      : resolve(gameRoot, "..", source.path);
    if (sha256(readFileSync(path)) !== source.sha256) throw new Error(`Random-flask evidence changed: ${source.path}; review its eligibility rules`);
  }
  const definitions = readFileSync(resolve(gameRoot, "materials.xml"), "utf8").replace(/\r\n/g, "\n");
  const localDefinitions = readFileSync(resolve(repo, "src/data/materials.xml"), "utf8").replace(/\r\n/g, "\n");
  if (definitions !== localDefinitions) throw new Error("Extracted materials.xml differs from the repository source");
  const nativeEvidencePath = resolve(repo, "src/data/material-availability/native-evidence.json");
  const nativeEvidence = JSON.parse(readFileSync(nativeEvidencePath));
  if (nativeEvidence.executable?.sha256 !== sha256(binary)) throw new Error("Native material evidence targets a different executable; review defaults and creation paths");
  const materials = JSON.parse(runtimeBytes), ids = new Set(materials.map((material) => material.id));
  const reconstructed = reconstructMaterialEligibility(definitions, {path: "data/materials.xml"});
  if (reconstructed.materials.length !== materials.length) throw new Error("XML and runtime material registries differ");
  for (const entry of reconstructed.materials) {
    const runtime = materials.find((material) => material.id === entry.id);
    if (!runtime || ["cell_type", "liquid_sand", "liquid_static", "is_just_particle_fx"].some((field) => runtime[field] !== entry[field])) {
      throw new Error(`XML/native-default eligibility differs from runtime data: ${entry.id}`);
    }
  }
  const nativeNames = scanMaterialNames(binary, [...ids]);
  const byId = new Map(materials.map((material) => [material.id, material]));
  const files = walk(gameRoot), textFiles = files.filter((path) => /\.(?:lua|xml|txt|csv|frag|vert)$/.test(path));
  const texts = new Map(), references = new Map(materials.map(({id}) => [id, []]));
  const colors = new Map(), materialColors = new Map(), imageErrors = [], nonImagePlaceholders = [], imageHashes = [], textHashes = [];
  const imageFiles = files.filter((path) => /^(?:biome|biome_impl|wang_tiles)\//.test(path) && /\.(?:png|plz)$/.test(path));
  for (const path of textFiles) {
    const bytes = readFileSync(resolve(gameRoot, path));
    const text = stripComments(bytes.toString("utf8"), extname(path));
    texts.set(path, text); textHashes.push([path, sha256(bytes)]);
    if (path === "materials.xml" || path.startsWith("translations/")) continue;
    for (const [index, line] of text.split(/\r?\n/).entries()) {
      for (const id of new Set(line.match(/[a-z][a-z0-9_]+/g) ?? [])) {
        if (ids.has(id)) references.get(id).push({path: `data/${path}`, line: index + 1, excluded: false, nonGameplayPathHint: sourcePathHint(path), text: line.trim().slice(0, 220)});
      }
    }
  }
  for (const path of imageFiles) {
    const bytes = readFileSync(resolve(gameRoot, path));
    imageHashes.push([path, sha256(bytes)]);
    if (bytes.length < 8 && bytes.toString("utf8").trim() === "") { nonImagePlaceholders.push(`data/${path}`); continue; }
    try {
      const decoded = path.endsWith(".plz") ? decodePlz(bytes) : decodePng(bytes);
      colors.set(path, pixelColors(decoded)); materialColors.set(path, imageMaterialColors(decoded));
    }
    catch (error) { imageErrors.push({path: `data/${path}`, error: error.message}); }
  }
  const reachable = new Set(roots.filter((path) => texts.has(path))), parents = new Map();
  const biomeColors = new Set([...(colors.get("biome_impl/biome_map.png") ?? []), ...(colors.get("biome_impl/biome_map_newgame_plus.png") ?? [])]);
  const biomeMap = parser.parse(texts.get("biome/_biomes_all.xml")).BiomesToLoad;
  for (const biome of array(biomeMap.Biome)) {
    if (biomeColors.has(biome.color.toLowerCase())) reachable.add(biome.biome_filename.replace(/^data\//, ""));
  }
  const queue = [...reachable];
  for (let i = 0; i < queue.length; i++) {
    const path = queue[i], text = texts.get(path);
    if (!text) continue;
    for (const match of text.matchAll(/data\/[\w./-]+\.(?:xml|lua|png|plz)\b/g)) {
      const child = match[0].slice(5);
      if (!reachable.has(child)) { reachable.add(child); parents.set(child, path); queue.push(child); }
    }
  }
  const pool = reconstructed.flaskPool, poolIds = new Set([...pool.liquids, ...pool.sands]);
  const records = Object.fromEntries(materials.map((material) => [material.id, {
    status: "unknown", reason: "Source references alone do not establish a gameplay production route.", evidence: [],
    randomFlaskPool: pool.liquids.includes(material.id) ? "liquid" : pool.sands.includes(material.id) ? "sand" : null,
  }]));
  const mark = (id, reason, evidence, status = "source-supported", occurrenceKind = "unresolved") => {
    if (records[id].status === "unknown" || status === "obtainable" && records[id].status !== "obtainable") {
      records[id] = {...records[id], status, reason, evidence, occurrenceKind};
    }
  };
  for (const id of poolIds) mark(id, "Eligible for a random-material flask from a Great Chest or the rarer ordinary-chest branch.", [
    {path: "data/scripts/items/potion_random_material.lua", lines: [11, 13, 16, 19]},
    {path: "noita_bin/tools_modding/lua_api_documentation.txt", lines: [109, 110]},
    {path: "src/data/material-availability/native-evidence.json", addresses: ["0x78d8d0", "0x4ac7e0", "0x707c20"], finding: "Native enumeration, constructor defaults and XML inheritance independently reconstruct flask membership."},
    {path: "src/data/materials.json", fields: {cell_type: byId.get(id).cell_type, liquid_sand: byId.get(id).liquid_sand,
      liquid_static: byId.get(id).liquid_static, is_just_particle_fx: byId.get(id).is_just_particle_fx}},
  ], "obtainable", "inventory");
  mark("air", "Built-in empty terrain cell; not an unused material.", [{path: "data/materials.xml", material: "air"}], "obtainable", "empty-space");
  const usesByMaterial = new Map(materials.map(({id}) => [id, []]));
  const imageRoles = new Map();
  const addImageRole = (image, role) => {
    if (!imageRoles.has(image)) imageRoles.set(image, []);
    imageRoles.get(image).push(role);
  };
  for (const path of reachable) {
    const text = texts.get(path);
    if (!text || path === "materials.xml") continue;
    if (path.endsWith(".xml")) {
      for (const use of extractMaterialUses(text, {path: `data/${path}`, materialIds: ids,
        resolveBase: (base) => base.startsWith("data/") ? texts.get(base.slice(5)) : null})) {
        usesByMaterial.get(use.id).push(use);
        if (use.productionEligible !== true) continue;
        mark(use.id, "An enabled producer configuration is referenced from gameplay files; execution and its recorded guards remain conditional.", [
          {...use.evidence, component: use.component, occurrenceKind: use.occurrenceKind,
            guards: use.guards, inputs: use.inputs, referencedBy: parents.has(path) ? `data/${parents.get(path)}` : "gameplay entry point"},
        ], "source-supported", use.occurrenceKind);
      }
    }
    for (const match of text.matchAll(/\b(material_filename|material_file|wang_template_file)\s*=\s*["']data\/([^"']+\.(?:png|plz))["']/g)) {
      addImageRole(match[2], {path: `data/${path}`, line: text.slice(0, match.index).split("\n").length, role: match[1]});
    }
    for (const match of text.matchAll(/\bLoadPixelScene\s*\(\s*["']data\/([^"']+\.(?:png|plz))["']/g)) {
      addImageRole(match[1], {path: `data/${path}`, line: text.slice(0, match.index).split("\n").length, role: "LoadPixelScene material argument"});
    }
  }
  const imageReferences = new Map(materials.map(({id}) => [id, []]));
  for (const material of materials) {
    if (!material.wang_color) continue;
    for (const [path, imageColors] of materialColors) {
      if (!imageColors.has(material.wang_color.toLowerCase().slice(-6))) continue;
      const roles = imageRoles.get(path) ?? [];
      const evidence = {path: `data/${path}`, color: material.wang_color.toLowerCase(), match: "RGB candidate across Wang and fixed-bitmap loading modes",
        reachable: reachable.has(path), materialLayerReferences: roles,
        limitation: "Caller remapping, duplicate-color resolution and placement conditions may alter the resulting material."};
      imageReferences.get(material.id).push(evidence);
      if (reachable.has(path) && roles.length) mark(material.id, "The material RGB occurs in a referenced material layer; remapping and placement remain conditional.", [evidence], "source-supported", "grid");
    }
  }
  const sourceReviewPath = resolve(repo, "src/data/material-availability/source-review.json");
  const sourceReview = existsSync(sourceReviewPath) ? JSON.parse(readFileSync(sourceReviewPath)) : null;
  if (sourceReview && sourceReview.supportedBuild?.executableSha256 !== sha256(binary)) throw new Error("Source review targets a different executable");
  if (sourceReview && sourceReview.supportedBuild.runtimeMaterialsSha256 !== sha256(runtimeBytes)) throw new Error("Source review material registry changed");
  if (!sourceReview?.corpusBindings) throw new Error("Source review lacks complete corpus bindings");
  const bindings = sourceReview.corpusBindings;
  const compareCorpus = (name, pairs, pathsOnly = false) => {
    const ordered = [...pairs].sort((a, b) => (pathsOnly ? a : a[0]) < (pathsOnly ? b : b[0]) ? -1 : (pathsOnly ? a : a[0]) > (pathsOnly ? b : b[0]) ? 1 : 0);
    if (ordered.length !== bindings[name]?.fileCount || sha256(JSON.stringify(ordered)) !== bindings[name]?.sha256) {
      throw new Error(`The ${name} corpus changed after source review; reassess creation paths before regenerating exclusions`);
    }
  };
  compareCorpus("dataText", textHashes.map(([path, digest]) => [`data/${path}`, digest]));
  compareCorpus("dataImages", files.filter((path) => /\.(?:png|plz)$/.test(path))
    .map((path) => [`data/${path}`, sha256(readFileSync(resolve(gameRoot, path)))]));
  compareCorpus("dataDirectoryMembership", files.map((path) => `data/${path}`), true);
  const nightmareRoot = resolve(gameRoot, "../noita_bin/mods/nightmare");
  compareCorpus("nightmare", walk(nightmareRoot)
    .map((path) => [`noita_bin/mods/nightmare/${path}`, sha256(readFileSync(resolve(nightmareRoot, path)))]));
  const checkReviewedArtifacts = (value) => {
    if (!value || typeof value !== "object") return;
    if (typeof value.path === "string" && typeof value.sha256 === "string" && /^(?:data|noita_bin)\//.test(value.path)) {
      if (value.path.split("/").includes("..")) throw new Error("Invalid reviewed source path");
      const filename = value.path.startsWith("data/") ? resolve(gameRoot, value.path.slice(5)) : resolve(gameRoot, "..", value.path);
      if (sha256(readFileSync(filename)) !== value.sha256) throw new Error(`Reviewed game artifact changed: ${value.path}`);
    }
    for (const child of Object.values(value)) checkReviewedArtifacts(child);
  };
  checkReviewedArtifacts(sourceReview);
  for (const [id, review] of Object.entries(sourceReview?.materials ?? {})) {
    if (!records[id] || review.sourceConclusion !== "source-supported-use") continue;
    records[id] = {...records[id], status: "source-supported", reason: review.finding,
      occurrenceKind: review.occurrenceKind, evidence: review.reviewedEvidence,
      reviewedCreationRoute: true, remainingConditions: review.missingEvidence};
  }
  const validationPath = resolve(repo, "src/data/material-availability/validation-review.json");
  const validation = existsSync(validationPath) ? JSON.parse(readFileSync(validationPath)) : null;
  for (const [id, review] of Object.entries(validation?.reviewedUses ?? {})) {
    if (records[id]) records[id].reviewedUse = review;
  }
  for (const [id, use] of Object.entries(nativeEvidence.nativeMaterialUses ?? {})) {
    if (!records[id]) continue;
    if (use.status === "unknown") {
      records[id].reason = use.finding;
      records[id].nativeUse = use;
      records[id].remainingConcreteRoute = use.concreteGap;
      continue;
    }
    if (use.status !== "source-supported") continue;
    records[id] = {...records[id], status: "source-supported", reason: use.finding,
      occurrenceKind: use.kind === "used-cosmetic-material" ? "cosmetic" : "native-activated producer",
      reviewedCreationRoute: true, evidence: [{path: "src/data/material-availability/native-evidence.json",
        material: id, finding: use.finding, executableSha256: nativeEvidence.executable.sha256}], nativeUse: use};
  }
  const parsed = parser.parse(definitions).Materials;
  const reactions = expandTaggedReactions([...array(parsed.Reaction).map((reaction) => ({...reaction, kind: "contact"})),
    ...array(parsed.ReqReaction).map((reaction) => ({...reaction, kind: "required-material"}))]
    .filter((reaction) => Number(reaction.probability ?? 100) > 0), materials);
  const transitions = [];
  const transitionFields = ["on_fire_convert_to_material", "on_fire_flame_material", "on_fire_smoke_material", "cold_freezes_to_material_name",
    "warmth_melts_to_material", "solid_on_collision_material", "solid_break_to_type", "convert_to_box2d_material"];
  for (const source of materials) for (const field of transitionFields) {
    const value = source[field];
    const target = Number.isInteger(value) && value > 0 ? materials[value]?.id : value;
    if (typeof target === "string" && ids.has(target) && source.id !== target) transitions.push({source: source.id, target, field});
  }
  const supportedInput = (id) => ["obtainable", "source-supported"].includes(records[id]?.status)
    && records[id]?.occurrenceKind !== "cosmetic";
  const availableInput = (input) => input?.startsWith("[") ? materials.some((material) => supportedInput(material.id) && material.tags.includes(input))
    : supportedInput(input);
  let changed = true;
  while (changed) {
    const before = Object.values(records).filter((record) => record.status !== "unknown").length;
    for (const transition of transitions) {
      if (supportedInput(transition.source)) mark(transition.target, "A supported source names this transformation target; the required trigger remains conditional.", [
        {path: "src/data/materials.json", sourceMaterial: transition.source, field: transition.field},
      ]);
    }
    for (const reaction of reactions) {
      if (reaction.kind !== "contact") continue;
      const inputs = [reaction.input_cell1, reaction.input_cell2, reaction.input_cell3].filter(Boolean);
      if (!inputs.length || !inputs.every(availableInput)) continue;
      for (const output of [reaction.output_cell1, reaction.output_cell2, reaction.output_cell3]) {
        if (ids.has(output)) mark(output, "A positive-probability contact reaction has source-supported inputs; this is a conditional creation route.", [{path: "data/materials.xml", inputs, output, probability: reaction.probability ?? 100}]);
      }
    }
    changed = before !== Object.values(records).filter((record) => record.status !== "unknown").length;
  }
  const candidates = [];
  for (const material of materials) {
    const record = records[material.id];
    const named = references.get(material.id), images = imageReferences.get(material.id);
    const incoming = transitions.filter((transition) => transition.target === material.id);
    const production = reactions.filter((reaction) => [reaction.output_cell1, reaction.output_cell2, reaction.output_cell3].includes(material.id));
    const nonSelfProduction = production.filter((reaction) => ![reaction.input_cell1, reaction.input_cell2, reaction.input_cell3].includes(material.id));
    record.audit = {namedReferenceCount: named.length, gameplayNamedReferenceCount: named.filter((reference) => !reference.excluded).length,
      wangImageCount: images.length, incomingTransformations: incoming, nonSelfReactionCount: nonSelfProduction.length,
      selfReactionCount: production.length - nonSelfProduction.length, nativeNameOffsets: nativeNames[material.id],
      producerObservationCount: usesByMaterial.get(material.id).length};
    record.producerObservations = usesByMaterial.get(material.id).slice(0, 3);
    if (record.status !== "unknown") continue;
    record.evidence = [...named.slice(0, 3), ...images.slice(0, 3)];
    if (!named.some((reference) => !reference.excluded) && images.length === 0 && incoming.length === 0 && nonSelfProduction.length === 0) {
      candidates.push(material.id);
      record.reason = "No gameplay material-name reference, Wang-color pixel, incoming material transformation or independently seeded reaction found. Native/dynamic creation remains unverified.";
    }
  }
  const reviewed = JSON.parse(readFileSync(resolve(repo, "src/data/material-availability/reviewed-unused.json"), "utf8"));
  const exclusionOverrides = JSON.parse(readFileSync(resolve(repo, "src/data/material-availability/filter-overrides.json"), "utf8"));
  for (const [id, override] of Object.entries(exclusionOverrides)) {
    if (!records[id] || records[id].status !== "unknown" || poolIds.has(id) || id === "air"
        || override.decision !== "exclude" || override.basis !== "maintainer-decision"
        || override.classification !== "presumed-unused" || typeof override.reason !== "string" || !override.reason.trim()
        || override.executableSha256 !== sha256(binary) || override.materialsSha256 !== sha256(definitions)) {
      throw new Error(`Invalid or outdated explicit exclusion: ${id}`);
    }
  }
  const verifiedIds = new Set(Object.entries(reviewed.materials)
    .filter(([, review]) => review.verification?.status === "verified").map(([id]) => id));
  const closure = JSON.parse(readFileSync(resolve(repo, "src/data/material-availability/closure-review.json")));
  if (verifiedIds.size) {
    const actualBasis = {executableSha256: sha256(binary), materialsSha256: sha256(definitions),
      reviewDigests: Object.fromEntries(["source-review.json", "native-evidence.json", "closure-review.json", "validation-review.json"]
        .map((name) => [name, sha256(readFileSync(resolve(repo, "src/data/material-availability", name), "utf8").replace(/\r\n/g, "\n"))]))};
    if (JSON.stringify(actualBasis) !== JSON.stringify(reviewed.basis)) throw new Error("Unused certificates no longer match their reviewed evidence/build; reassess before updating them");
    for (const id of verifiedIds) {
      if (!nativeEvidence.normalCreationClosure?.candidateIds?.includes(id)
          || closure.materials?.[id]?.verificationStatus !== "reviewed-source-and-native-closure"
          || closure.materials[id].excludeAsUnused !== true || closure.materials[id].remainingConcreteRoutes.length) {
        throw new Error(`No complete independent source/native closure for ${id}`);
      }
      if ((reviewed.materials[id].verification.dependsOnUnused ?? []).some((source) => !verifiedIds.has(source))) {
        throw new Error(`Unused dependency is not verified: ${id}`);
      }
    }
  }
  const tagMembers = (tag) => materials.filter((material) => tag === "[*]" ? material.id !== "air"
    : tag === "[any_liquid]" ? material.cell_type === "liquid" && !material.liquid_sand
    : tag === "[any_powder]" ? material.cell_type === "liquid" && material.liquid_sand : material.tags.includes(tag)).map((material) => material.id);
  const unavailableInput = (input) => {
    if (verifiedIds.has(input)) return true;
    const members = input?.startsWith("[") ? tagMembers(input) : [];
    return members.length > 0 && members.every((id) => verifiedIds.has(id));
  };
  const unusedIds = [];
  for (const [id, review] of Object.entries(reviewed.materials)) {
    const record = records[id], named = references.get(id), images = imageReferences.get(id);
    const independentTransition = record?.audit.incomingTransformations.some((transition) => !verifiedIds.has(transition.source));
    const independentReaction = reactions.some((reaction) => [reaction.output_cell1, reaction.output_cell2, reaction.output_cell3].includes(id)
      && (reaction.kind !== "contact" || ![reaction.input_cell1, reaction.input_cell2, reaction.input_cell3].some(unavailableInput)));
    if (!record || record.status !== "unknown" || poolIds.has(id)
      || (verifiedIds.has(id) ? independentTransition || independentReaction
        : record.audit.incomingTransformations.length || record.audit.nonSelfReactionCount)
      || imageErrors.length) {
      if (review.verification?.status === "verified") throw new Error(`Reviewed unused evidence no longer holds for ${id}; inspect the new source route`);
      if (record) record.candidateReview = {reason: review.reason, previouslyExcluded: true,
        disposition: "withdrawn pending complete source and native review"};
      continue;
    }
    if (!verifiedIds.has(id) && Object.values(nativeNames[id]).some((offsets) => offsets.length)) {
      record.reason = "A native material-name reference needs review before this material can be excluded.";
      record.evidence.push({path: "noita_bin/noita.exe", offsets: nativeNames[id]});
      continue;
    }
    const proposed = {...record, status: "unused", verification: review.verification};
    const verified = hasVerifiedUnusedEvidence(proposed, {executableSha256: sha256(binary), gameMaterialsSha256: sha256(definitions)});
    records[id] = {...record, status: verified ? "unused" : "unknown",
      confidence: verified ? "verified-creation-routes" : "source-candidate",
      reason: verified ? review.reason : "Previously proposed for exclusion, but native and dynamic creation paths have not been ruled out. Kept visible.",
      ...(verified ? {sourceFinding: review.sourceFinding} : {candidateReview: {reason: review.reason}}),
      evidence: [...record.evidence, ...review.evidence],
      verification: review.verification ?? {status: "incomplete", routes: {}},
      nativeCreation: verified ? "reviewed" : "not exhaustively excluded"};
    if (verified) unusedIds.push(id);
  }
  return {schemaVersion: 2, scope: {ruleset: "unmodded",
    definition: "Original material definitions in normal unmodified gameplay, including rare drops, NG+, official Nightmare, seasonal content and cosmetic use. Developer/mod spawning is excluded. A shifted alias does not establish an occurrence of its original definition."}, source: {
    gameMaterialsSha256: sha256(definitions), runtimeMaterialsSha256: sha256(runtimeBytes),
    materialRegistrySha256: sha256(JSON.stringify(materials)),
    reviewInputs: ["scripts/audit-material-availability.mjs", "scripts/certify-unused-materials.mjs", "src/components/materialAvailability.js",
      "scripts/material-source-analysis.mjs", "src/data/material-availability/source-evidence.json",
      "src/data/material-availability/filter-overrides.json",
      "src/data/material-availability/reviewed-unused.json", "src/data/material-availability/source-review.json",
      "src/data/material-availability/native-evidence.json", "src/data/material-availability/validation-review.json",
      "src/data/material-availability/closure-review.json"]
      .filter((path) => existsSync(resolve(repo, path)))
      .map((path) => ({path, sha256: sha256(readFileSync(resolve(repo, path), "utf8").replace(/\r\n/g, "\n"))})),
    flaskEvidenceSha256: sha256(evidenceBytes),
    executableSha256: sha256(binary), nativeNameScan: "UTF-8 and UTF-16LE literal IDs; absence does not exclude numeric IDs or constructed names",
    scannedTextFiles: textFiles.length, scannedWorldImages: imageFiles.length,
    textManifestSha256: sha256(JSON.stringify(textHashes)), imageManifestSha256: sha256(JSON.stringify(imageHashes)),
    imageErrors, nonImagePlaceholders, gameplayRoots: roots, reachableFileCount: reachable.size,
    limitations: ["Static source reachability is conditional; files and pixels may have additional runtime conditions.",
      "Native and dynamic creation are reviewed through the mechanism families recorded in native-evidence.json; this is not a formal proof over every executable path.",
      "Explicit filter decisions are recorded separately from verified unused classifications; their remaining uncertainty is preserved.",
      "Air is built-in empty space and is excluded by the native enumeration's starting index of 1.",
      "Unused status requires review of every creation-route category; an absent literal name alone never adds a filter entry."],
  }, randomFlaskPool: {...pool, source: "data/scripts/items/potion_random_material.lua", chestSources: [
    "data/scripts/items/chest_random_super.lua:45", "data/scripts/items/chest_random.lua:156"], airMembership: "excluded-id-zero",
    verification: "Native code plus independently resolved XML eligibility; no live-game capture was required or performed."},
    unusedIds: unusedIds.sort(), exclusionOverrides,
    sourceOnlyCandidates: candidates.filter((id) => !unusedIds.includes(id)).sort(), materials: records};
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const [flag, gameDataDirectory] = process.argv.slice(2);
  if (flag !== "--game-data" || !gameDataDirectory) throw new Error("Usage: node scripts/audit-material-availability.mjs --game-data /path/to/noita/data");
  const report = auditMaterialAvailability({gameDataDirectory});
  writeFileSync(resolve(repo, "src/data/material-availability.json"), JSON.stringify(report, null, 2) + "\n");
  writeFileSync(resolve(repo, "src/data/unused-materials.json"), JSON.stringify(materialExclusionIndex(report)) + "\n");
  console.log(JSON.stringify({materials: Object.keys(report.materials).length,
    obtainable: Object.values(report.materials).filter((record) => record.status === "obtainable").length,
    sourceOnlyCandidates: report.sourceOnlyCandidates, imageErrors: report.source.imageErrors}, null, 2));
}
