import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {buildSpellData} from "../src/data/FULL_SPELLS_FINAL.json.js";
import {parseSpell} from "../src/data/spells.json.js";
import {createEntityReader, enrichSpellWithXMLData, parseComponentDump, parseLuaActions} from "../src/data/spell-data.js";

const spells = buildSpellData();
const spell = (id) => spells.find((item) => item.id === id);

test("wiki physical values preserve fractions, zero and missing values", () => {
  const parsed = parseSpell({mass: "0.65", airFriction: "-0.4", gravity: "0.5", speedMin: "300.5", speedMax: "400.75", speedDie: "0", rayEnergy: "0.25"});
  assert.equal(parsed.mass, 0.65);
  assert.equal(parsed.airFriction, -0.4);
  assert.equal(parsed.gravity, 0.5);
  assert.equal(parsed.speedMin, 300.5);
  assert.equal(parsed.speedMax, 400.75);
  assert.equal(parsed.speedDie, 0);
  assert.equal(parsed.rayEnergy, 0.25);
  for (const value of ["", "  ", undefined, null, "unknown"]) assert.equal(parseSpell({mass: value}).mass, null);
});

test("action mapping cannot steal the next spell's projectile or trust stale related metadata", () => {
  const actions = parseLuaActions(`
    { id = "NO_PROJECTILE", action = function() draw_actions(1) end },
    { id = "CROSS", related_projectiles = {"data/entities/projectiles/deck/orb_laseremitter.xml"},
      action = function() add_projectile("data/entities/projectiles/deck/orb_laseremitter_four.xml") end },
    -- { id = "COMMENTED", action = function() add_projectile("wrong.xml") end },
    --[[
    { id = "DISABLED", action = function() add_projectile("wrong.xml") end },
    ]]
    { id = "TRIGGER", action = function() add_projectile_trigger_hit_world("right.xml", 1) end },
    { id = "DYNAMIC", action = function() add_projectile("data/entities/projectiles/" .. name) end },
  `.replace(/^(    \{) id/gm, "$1\n id"));
  assert.deepEqual(actions.get("NO_PROJECTILE"), []);
  assert.deepEqual(actions.get("CROSS"), ["data/entities/projectiles/deck/orb_laseremitter_four.xml"]);
  assert.equal(actions.has("COMMENTED"), false);
  assert.equal(actions.has("DISABLED"), false);
  assert.deepEqual(actions.get("TRIGGER"), ["right.xml"]);
  assert.deepEqual(actions.get("DYNAMIC"), []);
  assert.equal(spell("BURST_2").rayEnergy, null);
  assert.equal(spell("ELECTRIC_CHARGE").projectilePath, null);
});

test("component dumps retain full projectile paths when basenames collide", () => {
  const dump = parseComponentDump(`=== lightning.xml ===
ProjectileComponent:
  ray_energy: 50000
=== deck/lightning.xml ===
ProjectileComponent:
  ray_energy: 20000
`);
  assert.equal(dump.get("data/entities/projectiles/lightning.xml").ProjectileComponent.ray_energy, 50000);
  assert.equal(dump.get("data/entities/projectiles/deck/lightning.xml").ProjectileComponent.ray_energy, 20000);
});

test("projectile XML restores physical values lost by the old integer parser", () => {
  for (const [id, mass] of [["LANCE", 0.65], ["LANCE_HOLY", 0.15], ["LUMINOUS_DRILL", 1.65], ["NUKE", 0.2]]) {
    assert.equal(spell(id).mass, mass, id);
  }
  assert.equal(spell("LANCE").airFriction, -0.4);
  assert.equal(spell("LANCE").speedMin, 300);
  assert.equal(spell("LANCE").speedMax, 400);
  const read = createEntityReader({rawDirectory: fileURLToPath(new URL("../src/data/raw_data", import.meta.url))});
  assert.equal(read("data/entities/projectiles/deck/digger.xml").VelocityComponent[0].mass, 0.05,
    "the shared base projectile supplies Digging Bolt's mass");
});

test("plasma geometry and cell damage remain distinct from explosion parameters", () => {
  for (const [id, radius, length, damage, durability] of [
    ["LASER_EMITTER", 1.5, 160, 12000, 11],
    ["LASER_EMITTER_FOUR", 3.5, 112, 12000, 11],
    ["LASER_EMITTER_CUTTER", 2.5, 64, 100000, 14],
  ]) {
    const item = spell(id);
    assert.equal(item.laserBeamRadius, radius);
    assert.equal(item.laserMaxLength, length);
    assert.equal(item.laserCellDamage, damage);
    assert.equal(item.laserMaxDuraToDestroy, durability);
    assert.equal(item.radius, null, "beam width is not an explosion radius");
    assert.equal(item.rayEnergy, 20000, "the resolved projectile default is not laser cell damage");
  }
  assert.match(spell("LASER_EMITTER_FOUR").projectilePath, /orb_laseremitter_four\.xml$/);
});

test("multiple cast entities do not become one arbitrary projectile's digging estimate", () => {
  const item = spell("MEGALASER");
  assert.equal(item.projectilePath, null);
  assert.equal(item.projectilePaths.length, 2);
  assert.equal(item.radius, null);
  assert.equal(item.rayEnergy, null);
  assert.equal(item.groundPenetrationCoeff, null);
});

test("lightning explosion settings do not borrow unrelated projectile defaults", () => {
  for (const [id, radius] of [["LIGHTNING", 35], ["BALL_LIGHTNING", 15]]) {
    assert.equal(spell(id).radius, radius);
    assert.equal(spell(id).explosionComponent, "LightningComponent");
    assert.equal(spell(id).explosionHoleEnabled, true);
    assert.equal(spell(id).rayEnergy, null);
    assert.equal(spell(id).maxDuraToDestroy, null);
  }
});

test("conflicting repeated components cannot fall back to the dump's first component", () => {
  const path = "test.xml";
  const dump = new Map([[path, {LaserEmitterComponent: {beam_radius: 1.5, max_length: 160, damage_to_cells: 12000}}]]);
  const item = enrichSpellWithXMLData({id: "MIXED", name: "Mixed"}, dump, new Map([["MIXED", [path]]]), () => ({
    LaserEmitterComponent: [{laser: {beam_radius: 1.5, max_length: 160}}, {laser: {beam_radius: 2.5, max_length: 160}}],
  }));
  assert.equal(item.laserBeamRadius, null);
  assert.equal(item.laserMaxLength, 160);
  assert.equal(item.laserCellDamage, 12000);
});

test("a missing mapping clears stale component fields from a reused seed", () => {
  const item = enrichSpellWithXMLData({...spell("LASER_EMITTER"), id: "MISSING", explosionHoleEnabled: true,
    cellEaterIgnoredMaterial: "soil", projectilePaths: ["stale.xml"]}, new Map(), new Map(), () => ({}));
  assert.equal(item.projectilePath, null);
  assert.equal(item.rayEnergy, null);
  for (const field of ["laserBeamRadius", "laserMaxLength", "laserCellDamage", "laserMaxDuraToDestroy",
    "explosionHoleEnabled", "cellEaterIgnoredMaterial", "projectilePaths"]) assert.equal(item[field], undefined);
});

test("cell-eater exclusions and explicit explosion disabling survive export", () => {
  assert.equal(spell("BLACK_HOLE_GIGA").cellEaterIgnoredMaterial, "gem_box2d_yellow_sun");
  assert.equal(spell("BLACK_HOLE_GIGA").cellEaterEatProbability, 80);
  assert.equal(spell("BLACK_HOLE").cellEaterEatDynamicPhysicsBodies, true);
  assert.equal(spell("BLACK_HOLE").cellEaterIgnoredMaterialTag, "[indestructible]");
  assert.equal(spell("BLACK_HOLE").cellEaterMaterials, null, "a material count is not a list of IDs");
  const item = enrichSpellWithXMLData({id: "DISABLED", name: "Disabled"}, new Map(), new Map([["DISABLED", ["test.xml"]]]), () => ({
    ProjectileComponent: [{explosion_dont_damage_to_cells: 1, config_explosion: {explosion_radius: 8, hole_enabled: 0}}],
  }));
  assert.equal(item.explosionHoleEnabled, false);
  assert.equal(item.explosionDontDamageToCells, true);
  assert.equal(item.rayEnergy, null);
});

test("documented cell-eater defaults apply only to an existing, unambiguous component", () => {
  const actions = new Map([["CELL", ["test.xml"]]]);
  const seed = {id: "CELL", name: "Cell eater"};
  const defaults = enrichSpellWithXMLData(seed, new Map(), actions, () => ({CellEaterComponent: [{}]}));
  assert.equal(defaults.cellEaterRadius, 10);
  assert.equal(defaults.cellEaterEatProbability, 100);
  assert.equal(defaults.cellEaterOnlyStain, false);
  assert.equal(defaults.cellEaterEatDynamicPhysicsBodies, true);
  assert.equal(defaults.cellEaterLimitedMaterials, false);
  assert.equal(defaults.cellEaterIgnoredMaterialTag, "");
  assert.equal(defaults.cellEaterIgnoredMaterial, 0);
  const missing = enrichSpellWithXMLData(seed, new Map(), actions, () => ({}));
  assert.equal(missing.cellEaterRadius, null);
  assert.equal(missing.cellEaterOnlyStain, undefined);
  assert.equal(missing.cellEaterEatDynamicPhysicsBodies, undefined);
  const explicit = enrichSpellWithXMLData(seed, new Map(), actions, () => ({
    CellEaterComponent: [{radius: 3, only_stain: 1, eat_probability: 0, eat_dynamic_physics_bodies: 0}],
  }));
  assert.equal(explicit.cellEaterRadius, 3);
  assert.equal(explicit.cellEaterOnlyStain, true);
  assert.equal(explicit.cellEaterEatProbability, 0);
  assert.equal(explicit.cellEaterEatDynamicPhysicsBodies, false);
  const conflict = enrichSpellWithXMLData(seed, new Map(), actions, () => ({
    CellEaterComponent: [{radius: 3, only_stain: 0}, {radius: 4, only_stain: 1}],
  }));
  assert.equal(conflict.cellEaterRadius, null);
  assert.equal(conflict.cellEaterOnlyStain, undefined);
  assert.equal(spell("BLACK_HOLE_GIGA").cellEaterEatDynamicPhysicsBodies, true);
  assert.equal(spell("BLACK_HOLE_GIGA").cellEaterOnlyStain, false);
});

test("checked-in spell data matches the reproducible offline export", () => {
  const checkedIn = JSON.parse(readFileSync(new URL("../src/data/FULL_SPELLS_FINAL.json", import.meta.url), "utf8"));
  assert.deepEqual(checkedIn, spells);
});
