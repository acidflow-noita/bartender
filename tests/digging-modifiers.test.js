import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {applyDiggingModifiers, normalizeDiggingModifiers} from "../src/digging/modifiers.js";
import {evaluateLifecycle} from "../src/digging/effects.js";

const spells = JSON.parse(readFileSync(new URL("../src/data/FULL_SPELLS_FINAL.json", import.meta.url), "utf8"));
const spell = (id) => spells.find((item) => item.id === id);

test("modifier options normalize to the supported exclusive perk count and independent status", () => {
  assert.deepEqual(normalizeDiggingModifiers(), {glassCannon: 0, berserkium: false});
  assert.deepEqual(normalizeDiggingModifiers({glassCannon: "2", berserkium: "1"}), {glassCannon: 2, berserkium: true});
  assert.deepEqual(normalizeDiggingModifiers({glassCannon: 3, berserkium: "false"}), {glassCannon: 0, berserkium: false});
  assert.deepEqual(normalizeDiggingModifiers(null), {glassCannon: 0, berserkium: false});
});

test("six perk/status cases follow the native two-slot callback including integer energy scaling", () => {
  for (const [glassCannon, berserkium, radiusFactor, energyFactor] of [
    [0, false, 1, 1], [1, false, 5, 5], [2, false, 25, 25],
    [0, true, 2, 2], [1, true, 7.5, 5], [2, true, 25, 25],
  ]) {
    const effective = applyDiggingModifiers(spell("NUKE"), {glassCannon, berserkium});
    assert.equal(effective.radius, 250 * radiusFactor);
    assert.equal(effective.rayEnergy, 6700000 * energyFactor);
    assert.equal(effective.maxDuraToDestroy, 12);
  }
});

test("native radius operations use float32 and second-slot Berserk truncates before integer multiplication", () => {
  const effective = applyDiggingModifiers({radius: 0.11, rayEnergy: 12345}, {glassCannon: 1, berserkium: true});
  assert.equal(effective.radius, 0.8250000476837158);
  assert.equal(effective.rayEnergy, 61725);
  assert.ok(effective.diggingModifierNotes.some((note) => /acquisition order/.test(note)));
});

test("native gates retain disabled, opt-out and non-ProjectileComponent explosion configurations", () => {
  for (const patch of [
    {explosionHoleEnabled: false}, {explosionNotScaledByGamefx: true},
    {not_scaled_by_gamefx: true}, {projectileMotion: {componentEnabled: false}},
    {explosionComponent: "LightningComponent"}, {explosionComponent: "ExplosionComponent"},
  ]) {
    const effective = applyDiggingModifiers({radius: 20, rayEnergy: 20000, ...patch}, {glassCannon: 2});
    assert.equal(effective.radius, 20);
    assert.equal(effective.rayEnergy, 20000);
  }
  assert.equal(applyDiggingModifiers({radius: 0, rayEnergy: 20000}, {glassCannon: 2}).rayEnergy, 20000);
  assert.equal(applyDiggingModifiers({radius: 20, rayEnergy: null}, {glassCannon: 2}).rayEnergy, null);
});

test("boosted source radius can exceed the ray limit without being clamped in the effective spell", () => {
  const effective = applyDiggingModifiers(spell("NUKE_GIGA"), {glassCannon: 2, berserkium: true});
  assert.equal(effective.radius, 10000);
  assert.equal(effective.rayEnergy, 242500000);
  assert.equal(effective.maxDuraToDestroy, 14);
});

test("penetration, cell eating, black-hole fields, plasma digging and conversions keep their own settings", () => {
  const fields = ["mass", "speedMin", "speedMax", "lifetime", "lifetimeRandom", "groundPenetrationCoeff",
    "groundPenetrationMaxDura", "cellEaterRadius", "blackHoleRadius", "laserBeamRadius", "laserMaxLength",
    "laserCellDamage", "laserMaxDuraToDestroy", "conversionEffects"];
  for (const id of ["LANCE", "LUMINOUS_DRILL", "BLACK_HOLE", "BLACK_HOLE_GIGA", "LASER_EMITTER_CUTTER", "TOUCH_GOLD"]) {
    const source = spell(id);
    const effective = applyDiggingModifiers(source, {glassCannon: 2, berserkium: true});
    for (const field of fields) assert.deepEqual(effective[field], source[field], `${id}/${field}`);
  }
});

test("input data remains immutable and reapplying or disabling options starts from source values", () => {
  const source = structuredClone(spell("NUKE"));
  const before = structuredClone(source);
  Object.freeze(source);
  const first = applyDiggingModifiers(source, {glassCannon: 1});
  const second = applyDiggingModifiers(first, {glassCannon: 2});
  const reset = applyDiggingModifiers(second);
  assert.notEqual(first, source);
  assert.deepEqual(source, before);
  assert.equal(first.radius, 1250);
  assert.equal(second.radius, 6250);
  assert.deepEqual(reset, before);
});

test("Firework alternatives are each scaled once and stay equivalent for lifecycle selection", () => {
  const source = spell("FIREWORK");
  const effective = applyDiggingModifiers(source, {glassCannon: 1});
  for (const child of effective.diggingLifecycle.secondaryProjectiles) {
    assert.equal(child.profile.radius, 75);
    assert.equal(child.profile.rayEnergy, 10000000);
    assert.equal(child.profile.diggingModifierNotes, undefined);
  }
  const effect = evaluateLifecycle(effective, {id: "soil"}, (profile) => ({
    status: "digs", reason: "Identical impact", radius: profile.radius, method: "explosion",
  }));
  assert.equal(effect.status, "digs");
  assert.equal(effect.radius, 75);
  assert.equal(source.diggingLifecycle.secondaryProjectiles[0].profile.radius, 15);
});

test("Purple Field children receive a fresh original-caster boost rather than compounding their parent", () => {
  const effective = applyDiggingModifiers(spell("PURPLE_EXPLOSION_FIELD"), {glassCannon: 1, berserkium: true});
  const child = effective.diggingLifecycle.secondaryProjectiles[0].profile;
  assert.equal(child.radius, 60);
  assert.equal(child.rayEnergy, 1000000);
  assert.equal(child.maxDuraToDestroy, 10);
  const again = applyDiggingModifiers(effective, {glassCannon: 1, berserkium: true});
  assert.equal(again.diggingLifecycle.secondaryProjectiles[0].profile.radius, 60);
  assert.ok(effective.diggingModifierNotes.some((note) => /original caster/.test(note)));
});

test("disabled beams, separate creature explosions, loader shots and uncertain emitters retain source child profiles", () => {
  for (const id of ["MEGALASER", "EXPLODING_DEER", "PEBBLE", "WORM_RAIN", "ALL_SPELLS", "METEOR_RAIN"]) {
    const source = spell(id);
    const effective = applyDiggingModifiers(source, {glassCannon: 2, berserkium: true});
    assert.deepEqual(effective.diggingLifecycle.secondaryProjectiles, source.diggingLifecycle.secondaryProjectiles, id);
    assert.ok(effective.diggingModifierNotes.length > 0, id);
  }
});
