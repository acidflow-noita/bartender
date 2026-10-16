import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {extractMaterialUses, imageMaterialColors, reconstructMaterialEligibility,
  NATIVE_MATERIAL_ELIGIBILITY_DEFAULTS} from "../scripts/material-source-analysis.mjs";

const extract = (xml, options = {}) => extractMaterialUses(xml, {path: "data/test.xml", ...options});
const byMaterial = (uses, material) => uses.filter(use => use.material === material);

test("material detectors, collision-audio selectors and damage filters cannot seed production", () => {
  // These fields were conflated by the original material= regular expression.
  const uses = extract(`<Entity>
    <MaterialAreaCheckerComponent material="templebrick_noedge_static" material2="templebrick_static" />
    <PhysicsShapeComponent material="rock_box2d_nohit_heavy" is_circle="1" />
    <AnimalAIComponent food_material="meat" />
    <DamageModelComponent materials_that_damage="acid,lava" materials_that_create_messages="meat" />
    <CellEaterComponent ignored_material="corruption_static" />
    <VariableStorageComponent value_string="rock_eroding" />
    <PotionComponent custom_color_material="magic_liquid_hp_regeneration" />
  </Entity>`);
  assert.deepEqual(uses, []);
});

test("body and default pixel-sprite materials retain their output kind and documented provenance", () => {
  const uses = extract(`<Entity>
    <PhysicsImageShapeComponent image_file="data/props_gfx/wheel.png" material="wood_player_b2" />
    <PixelSpriteComponent image_file="data/props_gfx/structure.png" create_box2d_bodies="1" />
    <PixelSpriteComponent image_file="data/vegetation/tree.png" material="wood_tree" />
  </Entity>`);
  assert.equal(uses.length, 3);
  assert.equal(uses[0].occurrenceKind, "physical");
  assert.ok(uses[0].guards.includes("requires-compatible-physics-body"));
  assert.equal(uses[1].material, "wood_loose");
  assert.equal(uses[1].occurrenceKind, "physical");
  assert.deepEqual(uses[1].evidence.defaultSource, {path: "noita_bin/tools_modding/component_documentation.txt", lines: [2107]});
  assert.equal(uses[2].occurrenceKind, "grid");
  assert.equal(uses[2].evidence.defaultSource, undefined);
  assert.equal(uses[2].conditional, false, "no unresolved local condition; this still does not assert an instantiated entity");
});

test("disabled, non-emitting, zero-count and inventory-driven emitters remain templates", () => {
  const uses = extract(`<Entity>
    <ParticleEmitterComponent _enabled="0" emitted_material_name="root_growth" count_max="6" create_real_particles="1" />
    <ParticleEmitterComponent emitted_material_name="rainbow_gas" count_max="7" create_real_particles="1" is_emitting="0" />
    <ParticleEmitterComponent emitted_material_name="zero_count" count_max="0" create_real_particles="1" />
    <ParticleEmitterComponent emitted_material_name="zero_chance" count_max="3" emission_chance="0" create_real_particles="1" />
    <ParticleEmitterComponent emitted_material_name="ignored_material" count_max="3" create_real_particles="1" use_material_inventory="1" />
  </Entity>`);
  assert.equal(uses.length, 5);
  for (const use of uses) {
    assert.equal(use.occurrenceKind, "template", use.material);
    assert.equal(use.potentialKind, "grid");
    assert.equal(use.productionEligible, false, use.material);
    assert.equal(use.conditional, true);
  }
  assert.equal(uses[0].enabled, false);
  assert.ok(uses[0].guards.includes("activation-not-established"));
  assert.ok(uses[1].guards.includes("emission-disabled"));
  assert.ok(uses[4].guards.includes("emits-inventory-instead-of-configured-material"));
});

test("cosmetic particle use is distinct from grid and physical particle creation", () => {
  const uses = extract(`<Entity>
    <ParticleEmitterComponent emitted_material_name="spark" count_min="1" count_max="2" create_real_particles="0" emit_cosmetic_particles="1" is_emitting="1" />
    <ParticleEmitterComponent emitted_material_name="smoke" count_max="4" create_real_particles="1" emit_real_particles="1" emit_cosmetic_particles="1" />
    <ParticleEmitterComponent emitted_material_name="unconfigured" count_max="4" />
  </Entity>`);
  assert.deepEqual(byMaterial(uses, "spark").map(use => use.occurrenceKind), ["cosmetic"]);
  assert.deepEqual(byMaterial(uses, "smoke").map(use => use.occurrenceKind), ["grid", "physical", "cosmetic"]);
  assert.equal(byMaterial(uses, "unconfigured")[0].productionEligible, false);
});

test("zero inventory amounts and zero blood output do not become creation witnesses", () => {
  const uses = extract(`<Entity>
    <Material material="not_an_inventory" count="20" />
    <MaterialInventoryComponent>
      <count_per_material_type>
        <Material material="empty" count="0" />
        <Material material="filled" count="300" />
      </count_per_material_type>
    </MaterialInventoryComponent>
    <MaterialInventoryComponent _enabled="0"><count_per_material_type><Material material="disabled" count="3" /></count_per_material_type></MaterialInventoryComponent>
    <DamageModelComponent blood_material="blood" blood_spray_material="blood_cold" blood_multiplier="0" ragdoll_material="meat" create_ragdoll="0" />
  </Entity>`);
  assert.equal(byMaterial(uses, "not_an_inventory").length, 0);
  assert.equal(byMaterial(uses, "empty")[0].productionEligible, false);
  assert.equal(byMaterial(uses, "filled")[0].component, "MaterialInventoryComponent");
  assert.equal(byMaterial(uses, "filled")[0].productionEligible, true);
  assert.ok(byMaterial(uses, "filled")[0].guards.includes("cell-access-requires-spill-leak-or-ingestion"));
  for (const id of ["disabled", "blood", "blood_cold", "meat"]) assert.equal(byMaterial(uses, id)[0].productionEligible, false, id);
});

test("Base overrides replace material values and merge repeated component slots without proving activation", () => {
  const base = `<Entity>
    <ParticleEmitterComponent emitted_material_name="old_material" count_max="3" create_real_particles="1" />
    <ParticleEmitterComponent emitted_material_name="retained_material" count_max="4" emit_cosmetic_particles="1" />
  </Entity>`;
  const uses = extract(`<Entity>
    <Base file="data/base.xml">
      <ParticleEmitterComponent emitted_material_name="new_material" _enabled="0" />
    </Base>
    <PixelSpriteComponent material="own_material" image_file="data/own.png" />
  </Entity>`, {resolveBase: file => file === "data/base.xml" ? base : undefined});
  assert.equal(byMaterial(uses, "old_material").length, 0, "the overridden base value is not an independent producer");
  const changed = byMaterial(uses, "new_material")[0];
  assert.equal(changed.productionEligible, false);
  assert.equal(changed.evidence.path, "data/test.xml");
  assert.equal(changed.evidence.line, 3);
  const retained = byMaterial(uses, "retained_material")[0];
  assert.equal(retained.occurrenceKind, "cosmetic");
  assert.equal(retained.evidence.path, "data/base.xml");
  assert.ok(retained.guards.includes("inherited-component"));
  assert.equal(retained.conditional, true);
  assert.equal(byMaterial(uses, "own_material")[0].conditional, false);
});

test("inherited settings can disable an override whose material alone looked like a producer", () => {
  const uses = extract(`<Entity><Base file="data/base.xml">
    <ParticleEmitterComponent emitted_material_name="fire_blue" />
  </Base></Entity>`, {resolveBase: () => `<Entity><ParticleEmitterComponent emitted_material_name="fire" count_max="0" create_real_particles="1" /></Entity>`});
  assert.equal(uses.length, 1);
  assert.equal(uses[0].material, "fire_blue");
  assert.equal(uses[0].productionEligible, false);
  assert.ok(uses[0].guards.includes("zero-emission-count"));
});

test("unresolved and cyclic Base fragments do not silently receive proven production status", () => {
  const unresolved = extract(`<Entity><Base file="data/missing.xml">
    <ParticleEmitterComponent emitted_material_name="maybe_grid" count_max="3" create_real_particles="1" />
    <PixelSpriteComponent image_file="data/possible.png" />
  </Base></Entity>`);
  assert.equal(unresolved.length, 2);
  for (const use of unresolved) {
    assert.equal(use.productionEligible, null);
    assert.equal(use.occurrenceKind, "template");
    assert.ok(use.guards.includes("unresolved-base"));
  }
  const cyclic = extract(`<Entity><Base file="data/loop.xml"><PixelSpriteComponent material="loop_material" image_file="data/loop.png" /></Base></Entity>`, {
    resolveBase: () => `<Entity><Base file="data/loop.xml"><PixelSpriteComponent material="inner_material" image_file="data/inner.png" /></Base></Entity>`});
  assert.equal(cyclic.length, 1);
  assert.equal(cyclic[0].material, "loop_material");
  assert.equal(cyclic[0].productionEligible, null);
  assert.ok(cyclic[0].guards.includes("inheritance-cycle"));
});

test("converters preserve paired inputs and never seed targets without required context", () => {
  const uses = extract(`<Entity>
    <MagicConvertMaterialComponent from_material_array="water,acid" to_material_array="ice_static,ice_acid_static" steps_per_frame="20" radius="20" />
    <MagicConvertMaterialComponent to_material="unbound" />
    <MagicConvertMaterialComponent from_material_array="water,acid" to_material_array="unpaired" steps_per_frame="0" />
    <MagicConvertMaterialComponent from_material="glowstone_altar" to_material="templebrick_noedge_static" radius="128" />
  </Entity>`);
  assert.deepEqual(byMaterial(uses, "ice_static")[0].inputs, ["water"]);
  assert.deepEqual(byMaterial(uses, "ice_acid_static")[0].inputs, ["acid"]);
  assert.equal(byMaterial(uses, "ice_acid_static")[0].evidence.arrayIndex, 1);
  assert.equal(byMaterial(uses, "unbound")[0].productionEligible, null);
  assert.equal(byMaterial(uses, "unpaired")[0].productionEligible, false, "zero work remains decisive even with unresolved arrays");
  const collapse = byMaterial(uses, "templebrick_noedge_static")[0];
  assert.equal(collapse.productionEligible, true);
  assert.equal(collapse.conditional, true);
  assert.deepEqual(collapse.inputs, ["glowstone_altar"]);
});

test("projectile and chunk output switches and zero amounts are honored", () => {
  const uses = extract(`<Entity>
    <ProjectileComponent shell_casing_material="plastic_red" create_shell_casing="0" on_death_emit_particle_type="death_material" on_death_emit_particle="1" on_death_emit_particle_count="0" />
    <LooseGroundComponent chunk_material="no_chunks" chunk_probability="0" />
    <LooseGroundComponent chunk_material="exhausted" chunk_probability="0.15" chunk_count="0" />
    <LooseGroundComponent chunk_material="rock_box2d" chunk_probability="0.15" chunk_count="-1" />
  </Entity>`);
  for (const id of ["plastic_red", "death_material", "no_chunks", "exhausted"]) assert.equal(byMaterial(uses, id)[0].productionEligible, false, id);
  assert.equal(byMaterial(uses, "rock_box2d")[0].productionEligible, true);
  assert.equal(byMaterial(uses, "rock_box2d")[0].conditional, true);
});

test("visual vegetation, zero placement ranges and explosion-owner activation remain distinct", () => {
  const uses = extract(`<Entity>
    <VegetationComponent tree_material="background_material" tree_probability="1" is_visual="1" tree_image_file="data/tree.png" />
    <VegetationComponent tree_material="wood_loose" tree_probability="0.3" is_visual="0" tree_image_file="data/tree.png" />
    <MaterialComponent material_name="never_placed" material_min="1" material_max="1" />
    <ProjectileComponent _enabled="0"><config_explosion create_cell_material="disabled_explosion" create_cell_probability="100" /></ProjectileComponent>
    <VariableStorageComponent><config_explosion create_cell_material="not_an_explosion" create_cell_probability="100" /></VariableStorageComponent>
  </Entity>`);
  assert.equal(byMaterial(uses, "background_material")[0].productionEligible, false);
  assert.equal(byMaterial(uses, "wood_loose")[0].productionEligible, true);
  assert.equal(byMaterial(uses, "never_placed")[0].productionEligible, false);
  assert.equal(byMaterial(uses, "disabled_explosion")[0].enabled, false);
  assert.equal(byMaterial(uses, "not_an_explosion").length, 0);
});

test("evidence points to the material attribute, ignores commented elements and filters known IDs", () => {
  const uses = extract(`<Entity>
  <!-- <PixelSpriteComponent material="comment_only" image_file="x" /> -->
  <PixelSpriteComponent
    image_file="data/image.png"
    note="greater > than"
    material="wood_tree" />
  <PixelSpriteComponent image_file="data/image.png" material="not_in_registry" />
</Entity>`, {materialIds: new Set(["wood_tree"])});
  assert.equal(uses.length, 1);
  assert.deepEqual(uses[0].evidence, {path: "data/test.xml", line: 6, column: 5,
    componentPath: "/Entity[1]/PixelSpriteComponent[1]", attribute: "material"});
});

test("native Wang gates reject transparent pixels, black RGB and raw opaque-white before RGB lookup", () => {
  const rgba = Uint8Array.from([
    0x00, 0x00, 0x00, 0,
    0x12, 0x34, 0x56, 0,
    0x00, 0x00, 0x00, 1,
    0x00, 0x00, 0x00, 255,
    0xff, 0xff, 0xff, 255,
    0xab, 0xcd, 0xef, 1,
    0xab, 0xcd, 0xef, 128,
    0xab, 0xcd, 0xef, 255,
    0x00, 0x00, 0x01, 255,
  ]);
  assert.deepEqual([...imageMaterialColors({rgba}, {mode: "wang"})], ["abcdef", "000001"]);
  assert.throws(() => imageMaterialColors({rgba: Uint8Array.of(1, 2, 3)}), /RGBA/);
});

test("nonopaque white and alpha-FE marker colors remain candidates requiring caller context", () => {
  // Native rejects raw 0xffffffff, not every RGB-white value. Alpha-FE has
  // marker dispatch before material lookup; this helper cannot resolve it.
  const rgba = Uint8Array.from([
    0xff, 0xff, 0xff, 128,
    0x12, 0x34, 0x56, 254,
    0xff, 0xff, 0xff, 255,
  ]);
  assert.deepEqual([...imageMaterialColors({rgba}, {mode: "wang"})], ["ffffff", "123456"]);
});

test("fixed-bitmap and conservative modes retain RGB colors rejected by Wang alpha and white gates", () => {
  const rgba = Uint8Array.from([
    0x00, 0x00, 0x00, 255,
    0x12, 0x34, 0x56, 0,
    0xff, 0xff, 0xff, 255,
    0xab, 0xcd, 0xef, 255,
  ]);
  const expected = ["123456", "ffffff", "abcdef"];
  assert.deepEqual([...imageMaterialColors({rgba}, {mode: "fixed-bitmap"})], expected);
  assert.deepEqual([...imageMaterialColors({rgba})], expected, "unknown image roles must not silently apply Wang-only gates");
  assert.deepEqual([...imageMaterialColors({rgba}, {mode: "conservative"})], expected);
  assert.deepEqual([...imageMaterialColors({rgba}, {mode: "wang"})], ["abcdef"]);
  assert.throws(() => imageMaterialColors({rgba}, {mode: "unknown"}), /mode/);
});

test("an asynchronous Base resolver cannot be mistaken for an empty resolved source", () => {
  assert.throws(() => extract(`<Entity><Base file="data/base.xml" /></Entity>`, {resolveBase: async () => "<Entity/>"}), /synchronously/);
});

test("flask reconstruction uses native defaults and inherited XML flags, including forward parents", () => {
  const result = reconstructMaterialEligibility(`<Materials>
    <CellData name="air" />
    <CellDataChild name="inherited_static" _parent="terrain" />
    <CellDataChild name="flowing_powder" _parent="terrain" liquid_static="0" />
    <CellData name="terrain" cell_type="liquid" liquid_sand="1" liquid_static="1" />
    <CellData name="base_liquid" />
    <CellDataChild name="effect" _parent="base_liquid" is_just_particle_fx="1" />
    <CellDataChild name="physical" _parent="base_liquid" cell_type="solid" />
  </Materials>`, {path: "data/materials.xml"});
  assert.deepEqual(result.flaskPool, {liquids: ["base_liquid"], sands: ["flowing_powder"]});
  assert.deepEqual(result.materials.find(material => material.id === "base_liquid"), {id: "base_liquid", ...NATIVE_MATERIAL_ELIGIBILITY_DEFAULTS});
  assert.equal(result.materials.find(material => material.id === "inherited_static").liquid_static, true);
  assert.deepEqual(result.materialSources.inherited_static.liquid_static[0].inheritance, ["inherited_static", "terrain"]);
  assert.equal(result.materialSources.inherited_static.liquid_static[0].kind, "attribute");
  assert.equal(result.materialSources.base_liquid.is_just_particle_fx[0].kind, "native-default");
});

test("duplicate material definitions are safe only when every eligibility field agrees", () => {
  const same = reconstructMaterialEligibility(`<Materials>
    <CellData name="body" cell_type="solid" />
    <CellDataChild name="duplicate" _parent="body" />
    <CellData name="duplicate" cell_type="solid" />
  </Materials>`);
  assert.equal(same.materials.length, 2);
  assert.equal(same.duplicateDefinitions[0].id, "duplicate");
  assert.deepEqual(same.flaskPool, {liquids: [], sands: []});
  assert.throws(() => reconstructMaterialEligibility(`<Materials>
    <CellData name="disagreement" liquid_static="1" />
    <CellData name="disagreement" liquid_static="0" />
  </Materials>`), /Duplicate.*liquid_static/);
});

test("missing parents, cycles and invalid eligibility flags cannot silently become default liquids", () => {
  assert.throws(() => reconstructMaterialEligibility(`<Materials><CellDataChild name="child" _parent="absent" /></Materials>`), /Missing material parent/);
  assert.throws(() => reconstructMaterialEligibility(`<Materials><CellDataChild name="a" _parent="b" /><CellDataChild name="b" _parent="a" /></Materials>`), /inheritance cycle/);
  assert.throws(() => reconstructMaterialEligibility(`<Materials><CellData name="bad_flag" liquid_sand="perhaps" /></Materials>`), /Invalid.*liquid_sand/);
  assert.throws(() => reconstructMaterialEligibility(`<Materials><CellData name="bad_kind" cell_type="powder" /></Materials>`), /Invalid.*cell_type/);
});

test("current source XML plus verified native defaults independently reproduces all four runtime eligibility fields", () => {
  const xml = readFileSync(new URL("../src/data/materials.xml", import.meta.url), "utf8");
  const runtime = JSON.parse(readFileSync(new URL("../src/data/materials.json", import.meta.url)));
  const reconstructed = reconstructMaterialEligibility(xml, {path: "src/data/materials.xml"});
  const expected = runtime.map(material => ({id: material.id, ...Object.fromEntries(Object.keys(NATIVE_MATERIAL_ELIGIBILITY_DEFAULTS)
    .map(field => [field, material[field]]))})).sort((a, b) => a.id.localeCompare(b.id));
  assert.deepEqual(reconstructed.materials, expected);
  assert.equal(reconstructed.definitionCount, 468);
  assert.deepEqual(reconstructed.duplicateDefinitions.map(entry => entry.id).sort(), ["meat_pumpkin", "rock_box2d"]);
  assert.equal(reconstructed.flaskPool.liquids.length, 98);
  assert.equal(reconstructed.flaskPool.sands.length, 87);
  assert.ok(reconstructed.flaskPool.liquids.includes("creepy_liquid"));
  assert.ok(reconstructed.flaskPool.sands.includes("monster_powder_test"));
  assert.ok(!reconstructed.flaskPool.liquids.includes("water_static"));
  assert.ok(!reconstructed.flaskPool.liquids.includes("fungal_shift_particle_fx"));
});
