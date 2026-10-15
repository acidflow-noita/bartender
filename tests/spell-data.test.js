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
    assert.equal(spell(id).rayEnergy, 20000);
    assert.equal(spell(id).maxDuraToDestroy, 10);
  }
  const item = enrichSpellWithXMLData({id: "LIGHTNING_TEST", name: "Lightning"}, new Map(),
    new Map([["LIGHTNING_TEST", ["test.xml"]]]), () => ({
      ProjectileComponent: [{config_explosion: {explosion_radius: 99, ray_energy: 9000000, max_durability_to_destroy: 14}}],
      LightningComponent: [{explosion_type: 1, config_explosion: {explosion_radius: 35}}],
    }));
  assert.equal(item.radius, 35);
  assert.equal(item.rayEnergy, 20000);
  assert.equal(item.maxDuraToDestroy, 10);
});

test("explosion scaling opt-outs survive export and stale flags are cleared", () => {
  const seed = {id: "NO_SCALE", name: "No scale", explosionNotScaledByGamefx: false};
  const actions = new Map([[seed.id, ["test.xml"]]]);
  const optedOut = enrichSpellWithXMLData(seed, new Map(), actions, () => ({
    ProjectileComponent: [{on_death_explode: true,
      config_explosion: {explosion_radius: 20, ray_energy: 100000, not_scaled_by_gamefx: true}}],
  }));
  assert.equal(optedOut.explosionNotScaledByGamefx, true);
  const cleared = enrichSpellWithXMLData(optedOut, new Map(), new Map(), () => ({}));
  assert.equal(Object.hasOwn(cleared, "explosionNotScaledByGamefx"), false);
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
    "explosionHoleEnabled", "cellEaterIgnoredMaterial", "projectilePaths", "projectileMotion",
    "conversionEffects", "diggingLifecycle", "explosionEnabled"]) assert.equal(item[field], undefined);
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
  assert.equal(item.rayEnergy, 20000);
  assert.equal(item.maxDuraToDestroy, 10);
});

test("native explosion defaults require a real object and an enabled trigger before supplying a radius", () => {
  const seed = {id: "DEFAULT", name: "Defaults"};
  const actions = new Map([["DEFAULT", ["test.xml"]]]);
  const get = (component) => enrichSpellWithXMLData(seed, new Map(), actions,
    () => component ? {ProjectileComponent: [component]} : {});
  const active = get({on_death_explode: 1});
  assert.equal(active.radius, 20);
  assert.equal(active.rayEnergy, 20000);
  assert.equal(active.maxDuraToDestroy, 10);
  assert.equal(active.explosionEnabled, true);
  const inactive = get({on_death_explode: 0, on_lifetime_out_explode: 0});
  assert.equal(inactive.radius, null);
  assert.equal(inactive.explosionEnabled, false);
  assert.equal(get({_enabled: 0, on_death_explode: 1}).radius, null);
  assert.equal(get(null).rayEnergy, null);
  assert.equal(get(null).radius, null);
  for (const id of ["LASER_EMITTER", "LASER_EMITTER_FOUR", "LASER_EMITTER_CUTTER", "LUMINOUS_DRILL"]) {
    assert.equal(spell(id).radius, null, id);
    assert.equal(spell(id).explosionEnabled, false, id);
  }
  for (const id of ["MEGALASER", "EXPLODING_DEER", "PEBBLE"]) {
    for (const entry of spell(id).diggingLifecycle.secondaryProjectiles) {
      assert.equal(entry.profile.maxDuraToDestroy, 10, id);
      assert.equal(entry.profile.explosionEnabled, true, id);
    }
  }
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

test("conversion components preserve both terrain scans, additional entity passes and conditional activation", () => {
  const gold = spell("TOUCH_GOLD").conversionEffects;
  assert.equal(gold.length, 2);
  assert.deepEqual(gold.map((effect) => [effect.target, effect.radius, effect.toMaterial]), [
    ["terrain", 10, "gold"], ["terrain-and-entities", 30, "gold"],
  ]);
  assert.equal(gold[0].fromAnyMaterial, true);
  assert.equal(gold[0].minRadius, 0);
  assert.equal(gold[0].killWhenFinished, true);
  const grass = spell("TOUCH_GRASS").conversionEffects;
  assert.deepEqual(grass[0].disabledWhen, {global: "TOUCHING_GRASS", equals: "1"});
  assert.equal(grass[1].target, "terrain");
  assert.equal(grass[1].radius, 40);
  assert.equal(grass[1].disabledWhen, undefined);
  const item = enrichSpellWithXMLData({id: "ARRAY", name: "Array converter"}, new Map(),
    new Map([["ARRAY", ["test.xml"]]]), () => ({MagicConvertMaterialComponent: [{
      _enabled: 0, radius: 25, min_radius: 3, from_material_array: "rock_static,sand", to_material_array: "air,water",
    }]}));
  assert.equal(item.conversionEffects[0].enabled, false);
  assert.equal(item.conversionEffects[0].minRadius, 3);
  assert.deepEqual(item.conversionEffects[0].fromArray, ["rock_static", "sand"]);
  assert.deepEqual(item.conversionEffects[0].toArray, ["air", "water"]);
});

test("random fireworks and delayed beams retain separate child impact profiles", () => {
  const fireworks = spell("FIREWORK");
  assert.equal(fireworks.radius, null);
  assert.equal(fireworks.diggingLifecycle.kind, "random-projectile");
  assert.equal(fireworks.diggingLifecycle.countPerCast, 1);
  assert.equal(fireworks.diggingLifecycle.secondaryProjectiles.length, 4);
  for (const child of fireworks.diggingLifecycle.secondaryProjectiles) {
    assert.equal(child.profile.radius, 15);
    assert.equal(child.profile.rayEnergy, 2000000);
    assert.equal(child.profile.maxDuraToDestroy, 10);
  }
  const beam = spell("MEGALASER").diggingLifecycle.secondaryProjectiles[0];
  assert.equal(beam.afterFrames, 30);
  assert.equal(beam.countMax, 5);
  assert.equal(beam.profile.radius, 3);
  assert.equal(beam.profile.rayEnergy, 100000);
  assert.equal(spell("MEGALASER").radius, null);
});

test("growing singularities and recurring emitters do not acquire a whole-cast radius", () => {
  for (const id of ["BLACK_HOLE_BIG", "WHITE_HOLE_BIG"]) {
    const item = spell(id);
    assert.equal(item.cellEaterRadius, null);
    assert.deepEqual(item.diggingLifecycle.blackHole,
      {initialRadius: 1, radiusIncrement: 1, updateEveryFrames: 3, maximumRadius: 64, damageProbability: 0.25});
    assert.equal(item.diggingLifecycle.looseGround.maxDistance, 80);
  }
  const purple = spell("PURPLE_EXPLOSION_FIELD").diggingLifecycle.secondaryProjectiles[0];
  assert.equal(purple.updateEveryFrames, 11);
  assert.equal(purple.profile.radius, 8);
  assert.equal(purple.profile.rayEnergy, 200000);
  const meteor = spell("METEOR_RAIN").diggingLifecycle.secondaryProjectiles[0];
  assert.deepEqual([meteor.updateEveryFrames, meteor.countMin, meteor.countMax], [30, 1, 3]);
  assert.equal(meteor.launchSpeed, 900);
  assert.equal(meteor.profile.radius, 45);
  assert.equal(meteor.profile.rayEnergy, 7500000);
});

test("Omega holes preserve their fixed 160 field separately from cell eating and loose ground", () => {
  for (const id of ["BLACK_HOLE_GIGA", "WHITE_HOLE_GIGA"]) {
    const item = spell(id);
    assert.equal(item.cellEaterRadius, 60);
    assert.equal(item.blackHoleRadius, 160);
    assert.equal(item.diggingLifecycle.kind, "fixed-black-hole");
    assert.deepEqual(item.diggingLifecycle.blackHole, {radius: 160, maximumRadius: 160, damageProbability: 0.55});
    assert.deepEqual(item.diggingLifecycle.looseGround,
      {sourceChildEntityIndex: 0, maxDistance: 260, probability: 0.5, chunkProbability: 0.09});
    assert.equal(item.rayEnergy, 0, "the field is not an impact explosion");
  }
});

test("creature digging retains spawn/death/timer conditions and the correct component", () => {
  const worm = spell("WORM_RAIN").diggingLifecycle.secondaryProjectiles[0];
  assert.equal(worm.updateEveryFrames, 40);
  assert.equal(worm.profile.cellEaterRadius, 9);
  assert.ok(worm.condition);
  const deer = spell("EXPLODING_DEER").diggingLifecycle.secondaryProjectiles[0];
  assert.equal(deer.trigger, "entity-death");
  assert.equal(deer.profile.explosionComponent, "ExplosionComponent");
  assert.equal(deer.profile.radius, 30);
  assert.equal(deer.profile.rayEnergy, 170000);
  const pebble = spell("PEBBLE").diggingLifecycle.secondaryProjectiles;
  assert.deepEqual(pebble.map((child) => child.trigger), ["entity-death", "timer"]);
  assert.equal(pebble[1].afterFrames, 400);
  for (const child of pebble) {
    assert.equal(child.profile.explosionComponent, "ExplosionComponent");
    assert.equal(child.profile.radius, 14);
    assert.equal(child.profile.rayEnergy, 200000);
  }
});

test("End of Everything preserves staged clearing and later conditional effects", () => {
  const item = spell("ALL_SPELLS");
  assert.equal(item.radius, null);
  const lifecycle = item.diggingLifecycle;
  assert.equal(lifecycle.kind, "staged-event");
  assert.equal(lifecycle.stageEveryFrames, 300);
  const clearing = lifecycle.secondaryProjectiles.find((child) => child.stage === 1).profile.conversionEffects[0];
  assert.equal(clearing.radius, 256);
  assert.equal(clearing.fromTag, "[solid]");
  assert.equal(clearing.toMaterial, "air");
  assert.equal(lifecycle.secondaryProjectiles.find((child) => child.stage === 13).profile.radius, 250);
  assert.ok(lifecycle.conditionalStages.some((stage) => stage.stage === 5));
});

test("script-derived lifecycle timing is rejected when its source snapshots differ", () => {
  const read = createEntityReader({rawDirectory: fileURLToPath(new URL("../src/data/raw_data", import.meta.url))});
  for (const item of spells.filter((spell) => spell.diggingLifecycle)) {
    assert.notEqual(item.diggingLifecycle.kind, "unverified-script", item.id);
    for (const path of item.diggingLifecycle.sourcePaths) assert.equal(read.sourceMatches(path), true, path);
  }
  const alteredReader = (path) => read(path);
  alteredReader.sourceMatches = () => false;
  const item = enrichSpellWithXMLData({id: "BLACK_HOLE_BIG", name: "Changed source"}, new Map(),
    new Map([["BLACK_HOLE_BIG", ["data/entities/projectiles/deck/black_hole_big.xml"]]]), alteredReader);
  assert.equal(item.diggingLifecycle.kind, "unverified-script");
  assert.equal(item.diggingLifecycle.blackHole, undefined);
});

test("traveling diggers use game motion/lifetime fields and physics bombs retain their distinct movement flag", () => {
  for (const id of ["BLACK_HOLE", "BLACK_HOLE_DEATH_TRIGGER", "WHITE_HOLE"]) {
    const item = spell(id);
    assert.equal(item.lifetime, 120);
    assert.equal(item.lifetimeRandom, 7);
    assert.equal(item.gravity, 0);
    assert.equal(item.airFriction, -0.2);
    assert.equal(item.projectileMotion.collideWithWorld, false);
    assert.equal(item.projectileMotion.onCollisionDie, false);
  }
  const drill = spell("LUMINOUS_DRILL");
  assert.equal(drill.lifetime, 2);
  assert.equal(drill.lifetimeRandom, 0);
  assert.equal(drill.gravity, 400);
  assert.equal(drill.airFriction, 0.55);
  assert.equal(drill.projectileMotion.projectileFriction, 0);
  assert.equal(drill.projectileMotion.terminalVelocity, 1000);
  assert.equal(drill.projectileMotion.applyTerminalVelocity, true);
  assert.equal(spell("BOMB").hasPhysicsBody, true);
  assert.equal(spell("BOMB").projectileMotion.doMoveToUpdate, false);
});

test("fire support is distinguished from material replacement in the three former unknown spells", () => {
  const air = spell("AIR_BULLET");
  assert.equal(air.physicsImpulseCoeff, 100000);
  assert.equal(air.diggingLifecycle.kind, "physics-impulse");
  assert.equal(air.conversionEffects[0].fanTheFlames, 10);
  assert.equal(air.conversionEffects[0].fromMaterial, "air");
  assert.equal(air.conversionEffects[0].toMaterial, "air");
  for (const id of ["FREEZE_FIELD", "FREEZING_GAZE"]) {
    const effects = spell(id).conversionEffects;
    assert.equal(effects[1].extinguishFire, true);
    assert.equal(effects[1].fromMaterial, "air");
    assert.equal(effects[1].toMaterial, "air");
    assert.ok(effects.every((effect) => effect.temperatureReactionTemp === 0));
  }
});

test("checked-in spell data matches the reproducible offline export", () => {
  const checkedIn = JSON.parse(readFileSync(new URL("../src/data/FULL_SPELLS_FINAL.json", import.meta.url), "utf8"));
  assert.deepEqual(checkedIn, spells);
});
