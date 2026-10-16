import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildSpellData} from "../src/data/FULL_SPELLS_FINAL.json.js";
import {evaluateConversions, evaluateLifecycle, hasTerrainConversion} from "../src/digging/effects.js";
import {evaluateDigging} from "../src/digging/model.js";

const spells = buildSpellData();
const materials = JSON.parse(readFileSync(new URL("../src/data/FULL_MATERIALS_FINAL.json", import.meta.url), "utf8"));
const spell = (id) => spells.find((item) => item.id === id);
const material = (id) => materials.find((item) => item.id === id);
const child = (profile, target) => evaluateConversions(profile, target).find((effect) => effect.status === "converts") ?? evaluateDigging(profile, target);

test("Touch Gold's additional entity pass still converts terrain out to configured reach 30", () => {
  const effects = evaluateConversions(spell("TOUCH_GOLD"), material("rock_static"));
  assert.equal(effects.length, 2);
  assert.equal(effects[0].status, "converts");
  assert.equal(effects[0].method, "conversion");
  assert.equal(effects[0].radius, 30);
  assert.equal(effects[0].reachOnly, true);
  assert.equal(effects[0].conversion.toMaterial, "gold");
  assert.equal(effects[0].conversion.shape, "circle");
  assert.equal(effects[0].conversion.maximumProcessedRing, 29);
  assert.equal(effects[0].conversion.entityContext.requiresDamageModel, true);
  assert.equal(evaluateConversions(spell("TOUCH_GOLD"), material("gold"))[0].status, "blocked");
});

test("terrain conversion filters use tags, named materials and paired arrays", () => {
  const clearing = spell("ALL_SPELLS").diggingLifecycle.secondaryProjectiles.find((entry) => entry.stage === 1).profile;
  assert.equal(evaluateConversions(clearing, material("rock_static"))[0].conversion.toMaterial, "air");
  assert.equal(evaluateConversions(clearing, material("water"))[0].status, "blocked");
  const frozen = evaluateConversions(spell("FREEZE_FIELD"), material("water"));
  assert.equal(frozen[0].status, "converts");
  assert.equal(frozen[0].conversion.toMaterial, "ice_static");
  const converter = {...spell("TOUCH_WATER"), conversionEffects: [{...spell("TOUCH_WATER").conversionEffects[0], fromAnyMaterial: false, fromMaterial: "sand"}]};
  assert.equal(evaluateConversions(converter, material("sand"))[0].status, "converts");
  assert.equal(evaluateConversions(converter, material("rock_static"))[0].status, "blocked");
  const incomplete = {...spell("FREEZE_FIELD"), conversionEffects: [{...spell("FREEZE_FIELD").conversionEffects[0], toArray: ["ice_static"]}]};
  assert.equal(evaluateConversions(incomplete, material("water"))[0].status, "unsupported");
});

test("native conversion selector precedence and terrain eligibility do not invent HP or durability limits", () => {
  const freeze = spell("FREEZE_FIELD").conversionEffects[0];
  const any = {conversionEffects: [{...freeze, fromAnyMaterial: true, toMaterial: "gold"}]};
  assert.equal(evaluateConversions(any, material("water"))[0].conversion.toMaterial, "gold",
    "from_any_material matches before the water-to-ice array");
  const tagged = {conversionEffects: [{...freeze, fromTag: "[liquid]", toMaterial: "gold"}]};
  assert.equal(evaluateConversions(tagged, material("water"))[0].conversion.toMaterial, "gold");
  const hard = {...material("rock_static"), hardness: 2147483647, durability: 100, tags: ["[indestructible]"]};
  assert.equal(evaluateConversions(spell("TOUCH_GOLD"), hard)[0].status, "converts");
});

test("all conversion components scan terrain and the largest applicable reach wins", () => {
  const gold = spell("TOUCH_GOLD");
  const extended = {...gold, conversionEffects: [...gold.conversionEffects, {...gold.conversionEffects[0], radius: 18}]};
  assert.deepEqual(evaluateConversions(extended, material("rock_static")).map((entry) => entry.radius), [30, 18, 10]);
  const square = {...gold, conversionEffects: [{...gold.conversionEffects[0], isCircle: false, minRadius: 3}]};
  const effect = evaluateConversions(square, material("rock_static"))[0];
  assert.equal(effect.conversion.shape, "square");
  assert.equal(effect.conversion.minRadius, 3);
});

test("air has no convertible cell, while physics objects and entities require context", () => {
  assert.equal(evaluateConversions(spell("TOUCH_GOLD"), material("air"))[0].status, "blocked");
  const objectEffects = evaluateConversions(spell("TOUCH_GOLD"), material("steel"));
  assert.ok(objectEffects.length > 1);
  assert.ok(objectEffects.every((entry) => entry.status === "conditional" && entry.reachOnly));
  assert.match(objectEffects.find((entry) => entry.conversion.target === "terrain-and-entities").reason, /damage model/);
  const entitiesOnly = {...spell("TOUCH_GOLD"), conversionEffects: [spell("TOUCH_GOLD").conversionEffects[1]]};
  assert.equal(evaluateConversions(entitiesOnly, material("rock_static"))[0].status, "converts");
  assert.equal(evaluateConversions(entitiesOnly, material("rock_static"))[0].conversion.entityContext.excludedEntityTag, "touchmagic_immunity");
});

test("disabled and unverified conversions are not promoted to successful terrain conversion", () => {
  const effect = spell("TOUCH_GOLD").conversionEffects[0];
  const evaluate = (patch) => evaluateConversions({conversionEffects: [{...effect, ...patch}]}, material("rock_static"))[0];
  assert.equal(evaluate({enabled: false}).status, "blocked");
  assert.equal(evaluate({conditionUnverified: true}).status, "unsupported");
  assert.equal(evaluate({disabledWhen: {global: "TOUCHING_GRASS", equals: "1"}}).status, "conditional");
  assert.equal(evaluate({fromAnyMaterial: false, fromMaterial: 0}).status, "blocked");
  assert.equal(evaluate({stepsPerFrame: 0}).status, "blocked");
  assert.equal(evaluate({radius: 0}).status, "blocked");
  const grass = evaluateConversions(spell("TOUCH_GRASS"), material("rock_static"))[0];
  assert.equal(grass.status, "converts");
  assert.equal(grass.radius, 40, "the global condition disables the entity component, not terrain conversion");
});

test("equivalent one-of firework variants share their actual impact result", () => {
  const effect = evaluateLifecycle(spell("FIREWORK"), material("rock_static"), child);
  assert.equal(effect.status, "digs");
  assert.equal(effect.method, "explosion");
  assert.equal(effect.radius, 15);
  assert.notEqual(effect.reachOnly, true);
  assert.equal(effect.indirect.children.length, 4);
  assert.ok(effect.indirect.children.every((entry) => entry.result.radius === 15));
  const different = structuredClone(spell("FIREWORK"));
  different.diggingLifecycle.secondaryProjectiles[0].profile.radius = 1;
  const varied = evaluateLifecycle(different, material("rock_static"), child);
  assert.equal(varied.status, "conditional");
  assert.equal(varied.radius, null);
});

test("repeated, staged, delayed and creature effects retain individual calculations without a combined crater", () => {
  for (const id of ["PURPLE_EXPLOSION_FIELD", "METEOR_RAIN", "WORM_RAIN", "EXPLODING_DEER", "PEBBLE", "MEGALASER", "ALL_SPELLS"]) {
    const effect = evaluateLifecycle(spell(id), material("rock_static"), child);
    assert.equal(effect.status, "conditional", id);
    assert.equal(effect.method, "indirect", id);
    assert.equal(effect.radius, null, id);
    assert.ok(effect.indirect.children.length > 0, id);
    assert.ok(effect.indirect.children.every((entry) => entry.result && entry.trigger), id);
  }
  const calculated = [];
  const purple = evaluateLifecycle(spell("PURPLE_EXPLOSION_FIELD"), material("rock_static"), (profile, target) => {
    const effect = child(profile, target);
    calculated.push(effect);
    return effect;
  });
  assert.equal(purple.indirect.children[0].updateEveryFrames, 11);
  assert.equal(purple.indirect.children[0].result, calculated[0], "keep the child calculator's result intact");
  assert.equal(purple.indirect.children[0].result.method, "explosion");
  assert.ok(purple.indirect.children[0].result.radius > 0 && purple.indirect.children[0].result.radius <= 8);
  const worm = evaluateLifecycle(spell("WORM_RAIN"), material("rock_static"), child);
  assert.equal(worm.indirect.children[0].result.radius, 9);
  assert.ok(worm.indirect.children[0].condition);
  const end = evaluateLifecycle(spell("ALL_SPELLS"), material("rock_static"), child);
  assert.equal(end.indirect.children.find((entry) => entry.stage === 1).result.status, "converts");
  assert.ok(end.indirect.conditionalStages.some((stage) => stage.stage === 5));
});

test("growing black holes remove scanned terrain independently of HP while their boundary remains reach", () => {
  for (const id of ["BLACK_HOLE_BIG", "WHITE_HOLE_BIG"]) {
    const effect = evaluateLifecycle(spell(id), material("rock_static"), child);
    assert.equal(effect.status, "digs");
    assert.equal(effect.radius, 64);
    assert.equal(effect.reachOnly, true);
    assert.equal(effect.indirect.blackHole.initialRadius, 1);
    assert.equal(effect.indirect.blackHole.updateEveryFrames, 3);
    assert.equal(effect.indirect.blackHole.damageProbabilityScope, "physics objects and entities");
    assert.equal(evaluateLifecycle(spell(id), material("air"), child).status, "blocked");
    assert.equal(evaluateLifecycle(spell(id), material("steel"), child).status, "conditional");
    assert.equal(evaluateLifecycle(spell(id), {...material("rock_static"), hardness: 2147483647, durability: 100,
      tags: ["[indestructible]"]}, child).status, "digs");
  }
});

test("growing and fixed fields preserve liquid as material particles rather than a permanent crater", () => {
  for (const id of ["BLACK_HOLE_BIG", "WHITE_HOLE_BIG", "BLACK_HOLE_GIGA", "WHITE_HOLE_GIGA"]) {
    for (const materialId of ["water", "acid", "water_static"]) {
      const effect = evaluateLifecycle(spell(id), material(materialId), child);
      assert.equal(effect.status, "displaces", `${id}/${materialId}`);
      assert.equal(effect.reachOnly, true);
      assert.equal(effect.indirect.materialOutcome, "displacement");
      assert.match(effect.reason, /release callback/);
    }
    assert.equal(evaluateLifecycle(spell(id), material("smoke"), child).status, "removes");
  }
});

test("conversion eligibility uses engine classes without requiring a wiki category", () => {
  const terrain = {...material("rock_static"), type: "no type"};
  assert.equal(evaluateConversions(spell("TOUCH_GOLD"), terrain)[0].status, "converts");
  const rigid = {...terrain, cell_type: "solid", tags: []};
  assert.equal(evaluateConversions(spell("TOUCH_GOLD"), rigid)[0].status, "conditional");
});

test("Omega holes expose a fixed 160 reach without combining the 60 trail or 260 loose-ground search", () => {
  for (const id of ["BLACK_HOLE_GIGA", "WHITE_HOLE_GIGA"]) {
    const item = spell(id);
    const effect = evaluateLifecycle(item, material("rock_static"), child);
    assert.equal(effect.status, "digs");
    assert.equal(effect.method, "indirect");
    assert.equal(effect.radius, 160);
    assert.equal(effect.reachOnly, true);
    assert.equal(effect.indirect.kind, "fixed-black-hole");
    assert.equal(effect.indirect.blackHole.damageProbability, 0.55);
    assert.equal(effect.indirect.blackHole.damageProbabilityScope, "physics objects and entities");
    assert.equal(effect.indirect.looseGround.maxDistance, 260);
    assert.equal(item.cellEaterRadius, 60);
    assert.equal(evaluateLifecycle(item, material("air"), child).status, "blocked");
    assert.equal(evaluateLifecycle(item, material("steel"), child).status, "conditional");
    assert.equal(evaluateLifecycle(item, {...material("rock_static"), hardness: 2147483647, durability: 100}, child).status, "digs");
  }
});

test("unverified lifecycle sources fail closed and absent lifecycles add no result", () => {
  let calls = 0;
  const unknown = evaluateLifecycle({diggingLifecycle: {kind: "unverified-script", sourcePaths: ["changed.lua"]}}, material("soil"), () => { calls++; });
  assert.equal(unknown.status, "unsupported");
  assert.equal(unknown.radius, null);
  assert.equal(calls, 0);
  assert.equal(evaluateLifecycle(spell("DIGGER"), material("soil"), child), null);
  assert.deepEqual(evaluateConversions(spell("DIGGER"), material("soil")), []);
});

test("freeze arrays and their fire-support components are known non-matches on Soil", () => {
  for (const id of ["FREEZE_FIELD", "FREEZING_GAZE"]) {
    const effects = evaluateConversions(spell(id), material("soil"));
    assert.equal(effects.length, 2);
    assert.ok(effects.every((effect) => effect.status === "blocked" && effect.radius === 0), id);
    assert.equal(hasTerrainConversion(spell(id)), true);
    const water = evaluateConversions(spell(id), material("water"));
    assert.equal(water[0].status, "converts");
    assert.equal(water[0].conversion.toMaterial, "ice_static");
  }
});

test("Burst of Air reports conditional physics interaction without inventing a digging radius", () => {
  const air = spell("AIR_BULLET");
  assert.equal(hasTerrainConversion(air), false);
  assert.equal(evaluateConversions(air, material("soil"))[0].status, "blocked");
  const physics = evaluateLifecycle(air, material("soil"), child);
  assert.equal(physics.status, "conditional");
  assert.equal(physics.radius, null);
  assert.equal(physics.indirect.physicsImpulseCoeff, 100000);
  assert.match(physics.reason, /objects.*layout/);
});

test("stain and fire support alone are not terrain conversion capabilities", () => {
  const base = {...spell("TOUCH_GOLD").conversionEffects[0], fromAnyMaterial: false,
    fromMaterial: "air", toMaterial: "air"};
  for (const flags of [{cleanStains: true}, {extinguishFire: true}, {fanTheFlames: 10}]) {
    const item = {conversionEffects: [{...base, ...flags}]};
    assert.equal(hasTerrainConversion(item), false);
    assert.equal(evaluateConversions(item, material("soil"))[0].status, "blocked");
  }
});

test("nonzero thermal settings retain named material reactions as conditional context", () => {
  const item = {conversionEffects: [{...spell("FREEZE_FIELD").conversionEffects[1], temperatureReactionTemp: -100}]};
  assert.equal(hasTerrainConversion(item), true);
  const thermal = evaluateConversions(item, material("water"))[0];
  assert.equal(thermal.status, "conditional");
  assert.equal(thermal.reachOnly, true);
  assert.equal(thermal.conversion.thermal.temperature, -100);
  assert.equal(thermal.conversion.thermal.coldTarget, "ice_static");
  assert.equal(thermal.conversion.thermal.warmTarget, "steam");
});
