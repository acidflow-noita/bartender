import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildSpellData} from "../src/data/FULL_SPELLS_FINAL.json.js";
import {penetrationContactVector} from "../src/digging/model.js";
import {traceDiggingPath} from "../src/digging/motion.js";

const spells = buildSpellData();
const materials = JSON.parse(readFileSync(new URL("../src/data/FULL_MATERIALS_FINAL.json", import.meta.url), "utf8"));
const spell = (id) => spells.find((entry) => entry.id === id);
const material = (id) => materials.find((entry) => entry.id === id);
const nativeContact = (projectile, target) => (hp, vx, vy) =>
  penetrationContactVector(projectile, {...target, hardness: hp}, vx, vy);
const clearCell = (hp, vx, vy) => ({damage: hp, remaining: 0, removed: true, vxAfter: vx, vyAfter: vy});

function referenceProjectile({speed = 60, lifetime = 2, ...motion} = {}) {
  const source = spell("LUMINOUS_DRILL");
  return {...source, speedMin: speed, speedMax: speed, gravity: 0, airFriction: 0,
    projectileMotion: {...source.projectileMotion, updatesVelocity: false, applyTerminalVelocity: false,
      lifetimeFrames: lifetime, lifetimeRandomness: 0, ...motion}};
}

test("Black Hole uses its accelerated flight, lifetime endpoints and both update orders", () => {
  const source = spell("BLACK_HOLE");
  const footprint = traceDiggingPath(source, material("soil"), {kind: "cell"});
  assert.equal(footprint.width, 24);
  assert.equal(footprint.outlineOnly, false);
  assert.equal(footprint.probabilistic, true);
  assert.equal(footprint.removalProbability, 100 / 101);
  assert.deepEqual(footprint.points[0], [0, 0]);
  assert.ok(footprint.maxPoints.at(-1)[0] > footprint.points.at(-1)[0]);
  assert.ok(footprint.points.every(([, y]) => y === 0));
  assert.equal(footprint.diagnostics.lengthBasis, "travel-plus-diameter");
  assert.equal(footprint.diagnostics.phaseOrderUnverified, true);
  const variants = footprint.diagnostics.variants;
  assert.deepEqual(new Set(variants.map((variant) => variant.frames)), new Set([113, 127]));
  assert.deepEqual(new Set(variants.map((variant) => variant.phaseOrder)),
    new Set(["forces-before-move", "forces-after-move"]));
  for (const variant of variants) {
    // Independent closed form for the discrete geometric acceleration; allow
    // float32 position rounding from the native coordinate origin.
    const multiplier = 1 - source.airFriction / 60;
    const firstStep = source.speedMin / 60 * (variant.phaseOrder === "forces-before-move" ? multiplier : 1);
    const distance = firstStep * (multiplier ** variant.frames - 1) / (multiplier - 1);
    assert.ok(Math.abs(variant.travelLength - distance) < 0.01);
    assert.equal(variant.length, variant.travelLength + 24);
    assert.equal(variant.endReason, "lifetime");
  }
  assert.ok(footprint.lengthMin > 115 && footprint.lengthMax < 130);
  assert.match(footprint.caption, /one cast/);
  assert.ok(footprint.previewLength > footprint.lengthMin && footprint.previewLength < footprint.lengthMax);
  assert.equal(footprint.previewPoints.length, 121, "base lifetime of 120 frames gives one visible cast");
});

test("Luminous Drill produces a one-pixel tunnel, limited by consecutive native contacts", () => {
  for (const id of ["LUMINOUS_DRILL", "LASER_LUMINOUS_DRILL"]) {
    const source = spell(id);
    assert.equal(source.speedMin, 1400);
    assert.equal(source.projectileMotion.terminalVelocity, 1000);
    for (const [materialId, removed] of [["soil", 34], ["rock_static", 17], ["rock_hard", 9], ["templerock_static", 33]]) {
      const target = material(materialId);
      const footprint = traceDiggingPath(source, target, {kind: "path", contact: nativeContact(source, target)});
      assert.equal(footprint.width, 1, `${id}/${materialId}`);
      assert.equal(footprint.lengthMin, removed, `${id}/${materialId}`);
      assert.equal(footprint.lengthMax, removed, `${id}/${materialId}`);
      assert.equal(footprint.points.length, removed, `${id}/${materialId}`);
      assert.deepEqual(footprint.points[0], [1, 0]);
      assert.ok(footprint.diagnostics.variants.every((variant) => variant.frames <= 2));
      assert.equal(footprint.diagnostics.lengthBasis, "removed-centerline-plus-one-pixel");
    }
  }
});

test("movement occurs on the final lifetime frame and terminal speed is clamped before movement", () => {
  const target = {hardness: 100};
  const twoFrames = traceDiggingPath(referenceProjectile(), target, {kind: "path", contact: clearCell});
  assert.deepEqual(twoFrames.points, [[1, 0], [2, 0]]);
  assert.ok(twoFrames.diagnostics.variants.every((variant) => variant.frames === 2));
  const clamped = traceDiggingPath(referenceProjectile({speed: 2000, lifetime: 1,
    applyTerminalVelocity: true, terminalVelocity: 1000}), target, {kind: "path", contact: clearCell});
  assert.equal(clamped.lengthMin, 17);
  assert.ok(clamped.diagnostics.variants.every((variant) => variant.finalVelocity[0] === 1000));
  const zeroLifetime = traceDiggingPath(referenceProjectile({lifetime: 0}), target, {kind: "path", contact: clearCell});
  assert.equal(zeroLifetime.lengthMin, 1, "lifetime is decremented after the first movement");
});

test("the native squared cutoff uses unit samples rather than a continuous distance estimate", () => {
  const footprint = traceDiggingPath(referenceProjectile({speed: 96, lifetime: 1}), {hardness: 100},
    {kind: "path", contact: clearCell});
  assert.deepEqual(footprint.points, [[1, 0], [2, 0]]);
  assert.equal(footprint.lengthMin, 2);
  assert.ok(footprint.diagnostics.variants.every((variant) => Math.abs(variant.travelLength - 1.6) < 0.001));
});

test("partially damaged cell HP survives retries and collision death stops further contacts", () => {
  const calls = [];
  const contact = (hp, vx, vy) => {
    calls.push(hp);
    const damage = Math.min(hp, 60);
    return {damage, remaining: hp - damage, removed: damage === hp, vxAfter: vx, vyAfter: vy};
  };
  const target = {hardness: 100};
  const retry = traceDiggingPath(referenceProjectile({speed: 120, onCollisionDie: false}), target, {kind: "path", contact});
  assert.deepEqual(calls, [100, 40, 100, 100, 40, 100]);
  assert.deepEqual(retry.points, [[1, 0]]);
  assert.ok(retry.diagnostics.variants.every((variant) => variant.removedCells === 1 && variant.damagedCells === 1));
  calls.length = 0;
  const dies = traceDiggingPath(referenceProjectile({speed: 120}), target, {kind: "path", contact});
  assert.deepEqual(calls, [100, 100]);
  assert.equal(dies.lengthMax, 0);
  assert.equal(dies.partial, true);
  assert.equal(dies.outlineOnly, true);
  assert.ok(dies.diagnostics.variants.every((variant) => variant.frames === 1 && variant.endReason === "collision"));
});

test("cleared cells and the initial air cell do not charge hardness on later frames", () => {
  const footprint = traceDiggingPath(referenceProjectile({lifetime: 3}), {hardness: 100}, {
    kind: "path", contact: (hp, vx, vy) => ({damage: hp, remaining: 0, removed: true, vxAfter: -60, vyAfter: vy}),
  });
  assert.deepEqual(footprint.points, [[1, 0], [-1, 0]]);
  assert.ok(footprint.diagnostics.variants.every((variant) => variant.contacts === 2 && variant.removedCells === 2));
});

test("the low-velocity death check uses post-contact velocity", () => {
  const footprint = traceDiggingPath(referenceProjectile({lifetime: 10, dieOnLowVelocity: true,
    dieOnLowVelocityLimit: 10}), {hardness: 100}, {
    kind: "path", contact: (hp, vx, vy) => ({damage: hp, remaining: 0, removed: true, vxAfter: 5, vyAfter: vy}),
  });
  assert.equal(footprint.lengthMin, 1);
  assert.ok(footprint.diagnostics.variants.every((variant) => variant.frames === 1 && variant.endReason === "low-velocity"));
});

test("partial cell eating stays identified and proven penetration survives an unresolved bounce", () => {
  const disc = traceDiggingPath(spell("DISC_BULLET_BIG"), material("soil"), {kind: "cell"});
  assert.equal(disc.probabilistic, true);
  assert.equal(disc.conditional, true);
  assert.equal(disc.outlineOnly, true);
  const lance = spell("LANCE_HOLY"), target = material("soil");
  const bounce = traceDiggingPath(lance, target, {kind: "path", contact: nativeContact(lance, target)});
  assert.equal(bounce.conditional, true);
  assert.equal(bounce.outlineOnly, false, "the cells removed before the bounce must remain cut out");
  assert.ok(bounce.previewLength > 0);
  assert.ok(bounce.diagnostics.variants.every((variant) => variant.endReason === "collision-context"));
});

test("liquid displacement and gas removal reach never become a permanent swept cutout", () => {
  for (const id of ["water", "acid", "smoke", "fire"]) {
    const footprint = traceDiggingPath(spell("BLACK_HOLE"), material(id), {kind: "cell"});
    assert.equal(footprint.outlineOnly, true, id);
    assert.equal(footprint.removalProbability, 0, id);
    assert.equal(footprint.nominalProbabilityPerVisit, 100 / 101, id);
    assert.equal(footprint.sampledReach, true, id);
    assert.equal(footprint.width, 24, "configured reach is still available");
  }
  assert.equal(traceDiggingPath(spell("BLACK_HOLE"), material("water"), {kind: "cell"}).materialOutcome, "displacement");
  const omega = traceDiggingPath(spell("BLACK_HOLE_GIGA"), material("soil"), {kind: "cell"});
  assert.equal(omega.removalProbability, 80 / 101);
  assert.equal(omega.probabilityScope, "one visited cell; repeated exposure and RNG sequence not simulated");
});

test("unavailable, infinite or unsafe durations and invalid contacts do not invent a path", () => {
  const source = referenceProjectile(), target = {hardness: 100};
  const options = {kind: "path", contact: clearCell};
  for (const lifetimeFrames of [-1, Infinity, NaN, null, 1.5, 1000000]) {
    assert.equal(traceDiggingPath({...source, projectileMotion: {...source.projectileMotion, lifetimeFrames}}, target, options), null);
  }
  for (const patch of [{projectileMotion: null}, {speedMin: null}, {speedMax: Infinity}]) {
    assert.equal(traceDiggingPath({...source, ...patch}, target, options), null);
  }
  assert.equal(traceDiggingPath(source, target, {kind: "path", contact: () => null}), null);
  assert.equal(traceDiggingPath(source, target, {kind: "explosion", contact: clearCell}), null);
  assert.equal(traceDiggingPath(referenceProjectile({speed: 0}), target, options), null, "no contact in a stationary air cell");
});
