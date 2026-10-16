import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {deflateSync} from "node:zlib";
import {randomFlaskPool, decodePng, decodePlz, pixelColors, expandTaggedReactions, scanMaterialNames}
  from "../scripts/audit-material-availability.mjs";
import {getUnusedMaterialIds} from "../src/components/materialAvailability.js";

const report = JSON.parse(readFileSync(new URL("../src/data/material-availability.json", import.meta.url)));
const materials = JSON.parse(readFileSync(new URL("../src/data/materials.json", import.meta.url)));

test("the audit covers every runtime material and never filters random-flask materials", () => {
  assert.deepEqual(Object.keys(report.materials).sort(), materials.map((material) => material.id).sort());
  assert.equal(Object.keys(report.materials).length, 466);
  const pool = randomFlaskPool(materials);
  assert.deepEqual(pool.liquids, report.randomFlaskPool.liquids);
  assert.deepEqual(pool.sands, report.randomFlaskPool.sands);
  assert.equal(pool.liquids.length, 98);
  assert.equal(pool.sands.length, 87);
  for (const id of [...pool.liquids, ...pool.sands]) {
    assert.equal(report.materials[id].status, "obtainable", id);
    assert.ok(!report.unusedIds.includes(id), id);
  }
  for (const id of ["creepy_liquid", "monster_powder_test", "steelsmoke_static_molten", "steelmoss_slanted_molten"]) {
    assert.equal(report.materials[id].status, "obtainable", id);
    assert.ok(report.materials[id].randomFlaskPool, id);
  }
  assert.equal(report.materials.air.status, "obtainable");
  assert.equal(report.materials.air.randomFlaskPool, null);
  assert.equal(report.randomFlaskPool.airMembership, "excluded-id-zero");
});

test("flask classification follows engine fields rather than wiki display type or names", () => {
  const base = {cell_type: "liquid", liquid_static: false, is_just_particle_fx: false, liquid_sand: false};
  const pool = randomFlaskPool([
    {...base, id: "unused_sounding", type: "Solid"},
    {...base, id: "powder", liquid_sand: true},
    {...base, id: "static", liquid_static: true},
    {...base, id: "effect", is_just_particle_fx: true},
    {...base, id: "solid", cell_type: "solid"},
    {...base, id: "incomplete", liquid_static: undefined},
  ]);
  assert.deepEqual(pool, {liquids: ["unused_sounding"], sands: ["powder"]});
});

test("only complete build-bound reviews can turn source candidates into exclusions", () => {
  const excluded = getUnusedMaterialIds(report, {includeOverrides: false});
  assert.deepEqual([...excluded].sort(), [...report.unusedIds].sort());
  for (const [id, material] of Object.entries(report.materials)) {
    if (material.verification?.status === "incomplete") assert.ok(!excluded.has(id), id);
    if (material.status === "unused") assert.ok(excluded.has(id), id);
  }
  assert.equal(report.materials.corruption_static.audit.selfReactionCount, 1);
  assert.ok(report.materials.creepy_liquid_emitter.evidence.some((evidence) => evidence.path === "data/biome_impl/templetest.png"));
  assert.ok(report.materials.rock_eroding.evidence.some((evidence) => evidence.path === "data/biome_impl/trailer/logo.png"));
  assert.deepEqual(report.source.imageErrors, [], "every nonempty world source image must be decoded before exclusions are reviewed");
});

test("reviewed gameplay uses replace misleading name-only absence claims", () => {
  for (const id of ["acid_gas_static", "wood_loose", "cactus", "concrete_collapsed", "glass", "gold_static_radioactive", "glowstone_altar_hdr"]) {
    const entry = report.materials[id];
    assert.equal(entry.status, "source-supported", id);
    assert.equal(entry.reviewedCreationRoute, true, id);
    assert.ok(entry.evidence.every((item) => item.path && item.sha256), id);
    assert.ok(!getUnusedMaterialIds(report).has(id), id);
  }
});

test("native cosmetic and activation routes cannot be classified unused from source comments or disabled XML alone", () => {
  for (const id of ["fungal_shift_particle_fx", "rainbow_gas"]) {
    const entry = report.materials[id];
    assert.equal(entry.status, "source-supported", id);
    assert.equal(entry.reviewedCreationRoute, true, id);
    assert.ok(entry.nativeUse, id);
    assert.ok(!getUnusedMaterialIds(report).has(id), id);
  }
  assert.equal(report.materials.fungal_shift_particle_fx.occurrenceKind, "cosmetic");
});

test("tag-bound reaction products preserve their material identity during melt and cooling", () => {
  const materials = [{id: "wax", tags: ["[meltable]"]}, {id: "wax_molten", tags: []}, {id: "other", tags: []}];
  const expanded = expandTaggedReactions([
    {input_cell1: "[meltable]_molten", input_cell2: "water", output_cell1: "[meltable]", output_cell2: "steam"},
    {input_cell1: "[fire]", input_cell2: "[meltable]", output_cell1: "smoke", output_cell2: "[meltable]_molten"},
  ], materials);
  assert.deepEqual(expanded, [
    {input_cell1: "wax_molten", input_cell2: "water", output_cell1: "wax", output_cell2: "steam"},
    {input_cell1: "[fire]", input_cell2: "wax", output_cell1: "smoke", output_cell2: "wax_molten"},
  ]);
});

function pngChunk(type, bytes) {
  const header = Buffer.alloc(8); header.writeUInt32BE(bytes.length); header.write(type, 4);
  return Buffer.concat([header, bytes, Buffer.alloc(4)]);
}

test("terrain PNG decoding restores filtered RGBA colors and preserves alpha in Wang keys", () => {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(2); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 6;
  // Sub filter: second pixel stores the differences from the first pixel.
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(Buffer.from([1, 0x41, 0xaf, 0x41, 255, 0x6e, 0x02, 0x05, 0]))), pngChunk("IEND", Buffer.alloc(0))]);
  assert.deepEqual([...pixelColors(decodePng(png))], ["ff41af41", "ffafb146"]);
});

function plz(width, height, data, originalSize = Math.abs(width * height) * 4) {
  const header = Buffer.alloc(24);
  header.writeUInt32LE(1); header.writeInt32LE(width, 4); header.writeInt32LE(height, 8);
  header.writeUInt32LE(4, 12); header.writeUInt32LE(data.length, 16); header.writeUInt32LE(originalSize, 20);
  return Buffer.concat([header, data]);
}

test("PLZ decoding handles literal/raw pixels, repeated FastLZ copies and signed empty-splice dimensions", () => {
  const raw = Buffer.from([0x41, 0xaf, 0x41, 255]);
  assert.deepEqual([...pixelColors(decodePlz(plz(1, 1, raw)))], ["ff41af41"]);
  const repeated = decodePlz(plz(70, 1, Buffer.from([0x23, 1, 2, 3, 255, 0xe0, 255, 12, 3])));
  assert.equal(repeated.rgba.length, 280);
  assert.deepEqual([...pixelColors(repeated)], ["ff010203"]);
  const negative = decodePlz(plz(-2, -1, Buffer.from([0x21, 1, 2, 0x80, 1])));
  assert.equal(negative.sourceWidth, -2);
  assert.deepEqual([...negative.rgba], [1, 2, 1, 2, 1, 2, 1, 2]);
  assert.throws(() => decodePlz(plz(1, 1, Buffer.from([0x20, 1, 0x80, 255, 0]))));
});

test("literal executable scans distinguish native evidence from absence in source files", () => {
  const binary = Buffer.concat([Buffer.from("\0some_native_material\0"), Buffer.from("other_native_material", "utf16le")]);
  const matches = scanMaterialNames(binary, ["some_native_material", "other_native_material", "unused_material"]);
  assert.deepEqual(matches.some_native_material.utf8, [1]);
  assert.equal(matches.other_native_material.utf16le.length, 1);
  assert.deepEqual(matches.unused_material, {utf8: [], utf16le: []});
});
