import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {evaluateDigging, penetrationContact, getBaseRadius, getDiggingViewport, isDiggingSpell, FIXED_SCALE} from "../src/digging/model.js";

const spells = JSON.parse(readFileSync(new URL("../src/data/FULL_SPELLS_FINAL.json", import.meta.url)));
const materials = JSON.parse(readFileSync(new URL("../src/data/FULL_MATERIALS_FINAL.json", import.meta.url)));
const spell = (id) => {
  const value = spells.find((item) => item.id === id);
  assert.ok(value, `Missing spell ${id}`);
  return value;
};
const material = (id) => {
  const value = materials.find((item) => item.id === id);
  assert.ok(value, `Missing material ${id}`);
  return value;
};

test("the digging catalog includes both small spells and nukes", () => {
  for (const id of ["DIGGER", "NUKE", "NUKE_GIGA", "BLACK_HOLE", "LUMINOUS_DRILL"]) {
    assert.ok(isDiggingSpell(spell(id)));
  }
  assert.equal(evaluateDigging(spell("DIGGER"), material("soil")).radius, 6);
});

test("circular explosion estimates respect energy, hardness and the configured radius", () => {
  const small = evaluateDigging(spell("DIGGER"), material("rock_static"));
  assert.equal(small.radius, 1);
  assert.equal(small.footprint.estimated, true);
  assert.equal(evaluateDigging(spell("DIGGER"), material("rock_hard")).radius, 0);
  const nuke = evaluateDigging(spell("NUKE"), material("rock_static"));
  assert.equal(nuke.radius, 67);
  assert.equal(nuke.footprint.radius, 67);
  assert.equal(evaluateDigging(spell("NUKE"), material("soil")).radius, 250);
});

test("durability can block a nuke; the exact durability limit remains diggable", () => {
  const blocked = evaluateDigging(spell("NUKE"), material("templebrick_static"));
  assert.equal(blocked.status, "blocked");
  assert.match(blocked.reason, /durability 14/);
  const giga = evaluateDigging(spell("NUKE_GIGA"), material("templebrick_static"));
  assert.equal(giga.radius, 9);
});

test("Acid Ball corrodes brickwork and steel terrain independently of explosion limits", () => {
  for (const id of ["templebrick_static", "steel_static", "rock_static", "soil", "wood"]) {
    const result = evaluateDigging(spell("ACIDSHOT"), material(id));
    assert.equal(result.status, "digs", id);
    assert.equal(result.method, "acid");
    assert.equal(result.radius, null, "flowing acid must not be assigned the explosion's fixed radius");
    assert.match(result.reason, /dissolves/);
  }
});

test("Dense Rock resists acid, while rigid glass requires object context", () => {
  for (const [id, status] of [["rock_hard", "partial"], ["rock_hard_border", "blocked"]]) {
    const result = evaluateDigging(spell("ACIDSHOT"), material(id));
    assert.equal(result.status, status, id);
    assert.equal(result.radius, 0);
    assert.match(result.effects.find((effect) => effect.method === "acid").reason, /resists acid/);
    assert.doesNotMatch(result.reason, /Physics objects|does not cover/);
  }
  const glass = evaluateDigging(spell("ACIDSHOT"), material("glass"));
  assert.equal(glass.status, "conditional");
  assert.equal(glass.method, "explosion");
  assert.equal(glass.radius, null);
  assert.match(glass.effects.find((effect) => effect.method === "acid").reason, /resists acid/);
  assert.equal(glass.circularEffect, null);
});

test("acid resistance does not turn an unmodeled direct effect into zero digging", () => {
  for (const id of ["rock_box2d_nohit_hard", "alcohol", "smoke", "steam"]) {
    const outcome = evaluateDigging(spell("ACIDSHOT"), material(id));
    assert.equal(outcome.status, "conditional", id);
    assert.equal(outcome.radius, null);
    assert.equal(outcome.effects.find((effect) => effect.method === "acid").status, "blocked");
  }
});

test("penetration and corrosion retain their separate initial explosion estimates", () => {
  const lance = evaluateDigging(spell("LANCE_HOLY"), material("soil"));
  assert.equal(lance.status, "path");
  assert.equal(lance.radius, null, "explosion radius is not penetration depth");
  assert.equal(lance.circularEffect.method, "explosion");
  assert.equal(lance.circularEffect.radius, 30);
  const acid = evaluateDigging(spell("ACIDSHOT"), material("soil"));
  assert.equal(acid.method, "acid");
  assert.equal(acid.radius, null, "corrosion has no fixed radius");
  assert.equal(acid.circularEffect.radius, 9);
});

test("disabled explosions cannot erase terrain or hide a working secondary effect", () => {
  for (const flags of [{explosionHoleEnabled: false}, {explosionDontDamageToCells: true}]) {
    assert.equal(evaluateDigging({...spell("NUKE"), ...flags}, material("soil")).status, "blocked");
    const lance = evaluateDigging({...spell("LANCE"), ...flags}, material("soil"));
    assert.equal(lance.status, "path");
    assert.equal(lance.circularEffect, null);
  }
});

test("beam contact damage remains distinct from explosion radius and unknown depth", () => {
  const beam = {id: "BEAM", laserBeamRadius: 1.5, laserMaxLength: 160, laserCellDamage: 12000, laserMaxDuraToDestroy: 11};
  assert.ok(isDiggingSpell(beam));
  assert.equal(getBaseRadius(beam), null);
  const soil = evaluateDigging(beam, material("soil"));
  assert.equal(soil.method, "laser");
  assert.equal(soil.status, "digs");
  assert.equal(soil.radius, null);
  assert.equal(soil.circularEffect, null);
  assert.deepEqual(soil.laser, {damage: 2000, contacts: 1});
  assert.deepEqual(evaluateDigging(beam, material("rock_hard")).laser, {damage: 12000, contacts: 17});
  assert.equal(evaluateDigging(beam, material("rock_hard")).status, "partial");
  assert.equal(evaluateDigging(beam, material("templebrick_static")).status, "blocked");
  assert.equal(evaluateDigging({...beam, laserCellDamage: null}, material("soil")).status, "unsupported");
  assert.equal(evaluateDigging({...beam, laserCellDamage: 0}, material("soil")).status, "blocked");
});

test("partial explosion damage is not confused with a durability block", () => {
  const partial = evaluateDigging(spell("DIGGER"), material("rock_hard"));
  assert.equal(partial.status, "partial");
  assert.equal(partial.radius, 0);
  assert.match(partial.reason, /damages terrain/);
  assert.equal(evaluateDigging(spell("DIGGER"), material("templebrick_static")).status, "blocked");
});

test("standalone acid emitters use corrosion, but modifiers and unknown data are not guessed", () => {
  for (const id of ["MATERIAL_ACID", "CLOUD_ACID", "CIRCLE_ACID", "SEA_ACID"]) {
    assert.ok(isDiggingSpell(spell(id)));
    assert.equal(evaluateDigging(spell(id), material("templebrick_static")).status, "digs");
    assert.equal(evaluateDigging(spell(id), material("rock_hard")).status, "blocked");
  }
  assert.equal(evaluateDigging(spell("ACID_TRAIL"), material("soil")).status, "conditional");
  const missingTags = evaluateDigging(spell("ACIDSHOT"), {...material("soil"), tags: undefined});
  assert.equal(missingTags.effects.find((effect) => effect.method === "acid").status, "unsupported");
  assert.equal(missingTags.circularEffect.radius, 9, "missing corrosion data does not erase a known initial explosion");
  assert.equal(evaluateDigging(spell("ACIDSHOT"), material("steel")).status, "conditional");
});

test("acid corrosion agrees with the game's expanded reaction data for every material", () => {
  const reactions = JSON.parse(readFileSync(new URL("../src/data/jsons/reactions.json", import.meta.url)));
  const targets = new Set(reactions.filter((reaction) => reaction.input_cell1 === "acid"
    && reaction.output_cell1 === "acid" && reaction.output_cell2 === "acid_gas")
    .map((reaction) => reaction.input_cell2));
  assert.ok(targets.size > 200, "the comparison must include the full corrosion reaction group");
  for (const entry of materials) {
    assert.equal(evaluateDigging(spell("MATERIAL_ACID"), entry).status === "digs", targets.has(entry.id), entry.id);
  }
});

test("cell-eating uses the component radius for actual black-hole IDs", () => {
  for (const [id, radius] of [["BLACK_HOLE", 12], ["BLACK_HOLE_DEATH_TRIGGER", 12], ["BLACK_HOLE_GIGA", 60], ["WHITE_HOLE", 12]]) {
    const result = evaluateDigging(spell(id), material("templebrick_static"));
    assert.equal(result.radius, radius);
    assert.equal(result.method, "cell");
    assert.equal(getBaseRadius(spell(id)), id === "BLACK_HOLE_GIGA" ? 160 : radius);
  }
  assert.equal(evaluateDigging(spell("BLACK_HOLE"), material("gem_box2d_yellow_sun")).status, "blocked");
});

test("limited cell-eating respects its material list and missing restrictions", () => {
  const limited = {...spell("BLACK_HOLE"), cellEaterLimitedMaterials: true, cellEaterMaterials: ["soil"]};
  assert.equal(evaluateDigging(limited, material("soil")).radius, 12);
  assert.equal(evaluateDigging(limited, material("rock_static")).status, "blocked");
  assert.equal(evaluateDigging({...limited, cellEaterMaterials: null}, material("soil")).status, "unsupported");
});

test("documented cell-eater settings control named exclusions, objects, stains and probability", () => {
  const omegaSun = evaluateDigging(spell("BLACK_HOLE_GIGA"), material("gem_box2d_yellow_sun"));
  assert.equal(omegaSun.status, "conditional", "its separate field requires object context");
  assert.equal(omegaSun.effects.find((effect) => effect.method === "cell").status, "blocked");
  assert.equal(evaluateDigging(spell("BLACK_HOLE"), material("steel")).status, "conditional",
    "enabling dynamic-cell removal does not describe the entire physics object");
  for (const settings of [{cellEaterOnlyStain: true}, {cellEaterEatProbability: 0}]) {
    const outcome = evaluateDigging({...spell("BLACK_HOLE"), ...settings}, material("soil"));
    assert.equal(outcome.status, "blocked");
    assert.equal(outcome.circularEffect, null);
  }
});

test("Black Hole displaces live liquid cells but removes gas and fire cells", () => {
  for (const id of ["water", "acid"]) {
    const outcome = evaluateDigging(spell("BLACK_HOLE"), material(id));
    assert.equal(outcome.status, "displaces", id);
    assert.equal(outcome.reachOnly, true);
    assert.equal(outcome.circularEffect, null);
    assert.equal(outcome.footprint.outlineOnly, true);
    assert.equal(outcome.footprint.removalProbability, 0);
    assert.match(outcome.reason, /return to the grid/);
    assert.doesNotMatch(outcome.reason, /until.*(expires|death)/);
  }
  for (const id of ["smoke", "fire"]) {
    const outcome = evaluateDigging(spell("BLACK_HOLE"), material(id));
    assert.equal(outcome.status, "removes", id);
    assert.equal(outcome.reachOnly, true);
    assert.equal(outcome.footprint.outlineOnly, true);
    assert.equal(outcome.footprint.removalProbability, 0);
  }
  assert.equal(evaluateDigging(spell("BLACK_HOLE"), material("water_static")).status, "conditional");
  assert.equal(evaluateDigging(spell("BLACK_HOLE"), material("spark")).status, "blocked");
});

test("cell-eating branches follow engine fields and retain the native probability gate", () => {
  const hole = spell("BLACK_HOLE");
  const soil = {...material("soil"), type: "Liquid"};
  const outcome = evaluateDigging(hole, soil);
  assert.equal(outcome.status, "digs", "wiki presentation type must not override liquid_sand");
  assert.equal(outcome.footprint.removalProbability, 100 / 101);
  assert.equal(outcome.footprint.probabilistic, true);
  assert.equal(outcome.footprint.sampledReach, true);
  assert.equal(outcome.footprint.outlineOnly, false, "verified random removal may be illustrated without a full-clear promise");
  const noDynamic = {...hole, cellEaterEatDynamicPhysicsBodies: false};
  assert.equal(evaluateDigging(noDynamic, soil).status, "blocked");
  assert.equal(evaluateDigging(noDynamic, material("rock_static")).status, "digs");
  assert.equal(evaluateDigging(noDynamic, material("acid")).status, "displaces",
    "liquid detachment runs before the dynamic-cell deletion gate");
  assert.equal(evaluateDigging({...hole, cellEaterOnlyStain: true}, material("acid")).status, "displaces",
    "liquid detachment also precedes the stain-only branch");
  const limited = {...hole, cellEaterLimitedMaterials: true, cellEaterMaterials: ["acid"]};
  assert.equal(evaluateDigging(limited, material("acid")).status, "removes",
    "the limited-material branch deletes matching cells without the live-cell detachment helper");
  assert.equal(evaluateDigging(hole, {...soil, cell_type: "solid", tags: []}).status, "conditional",
    "rigid cells need context even without the wiki's box2d tag");
});

test("air never becomes a successful digging result for any selectable spell", () => {
  for (const entry of spells.filter(isDiggingSpell)) {
    const outcome = evaluateDigging(entry, material("air"));
    assert.equal(outcome.status, "blocked", entry.id);
    assert.equal(outcome.radius, 0, entry.id);
    assert.equal(outcome.footprint, undefined, entry.id);
  }
});

test("beam contacts distinguish partial HP damage, thermal conversion and gas pass-through", () => {
  const beam = {laserBeamRadius: 1, laserCellDamage: 12000, laserMaxDuraToDestroy: 20};
  for (const id of ["smoke", "fire"]) {
    assert.equal(evaluateDigging(beam, material(id)).status, "blocked", id);
  }
  const water = evaluateDigging(beam, material("water"));
  assert.equal(water.status, "converts");
  assert.equal(water.laser.thermal.toMaterial, "steam");
  assert.equal(water.laser.thermal.temperature, 10000);
  assert.equal(water.reachOnly, true);
  assert.equal(evaluateDigging({...beam, laserCellDamage: 50}, material("water")).status, "partial");
  assert.equal(evaluateDigging(beam, {...material("water"), warmth_melts_chance_rev: 9999}).status, "converts");
  assert.equal(evaluateDigging(beam, {...material("water"), warmth_melts_chance_rev: 10000}).status, "conditional",
    "the RNG modulo includes the reverse-chance endpoint");
  assert.equal(evaluateDigging(beam, material("acid")).status, "removes");
  assert.equal(evaluateDigging(beam, {...material("rock_hard"), type: "Gas"}).status, "partial",
    "the engine cell class, not a presentation label, controls beam contacts");
});

test("Lightning uses verified ConfigExplosion defaults without filling unknown inputs", () => {
  const outcome = evaluateDigging(spell("LIGHTNING"), material("soil"));
  assert.equal(outcome.method, "explosion");
  assert.equal(outcome.status, "digs");
  assert.equal(outcome.explosion.rayEnergy, 20000);
  assert.equal(outcome.explosion.maxDurability, 10);
  assert.equal(outcome.radius, 10);
  assert.equal(getBaseRadius(spell("LIGHTNING")), 35);
  for (const setting of [{rayEnergy: null}, {maxDuraToDestroy: null}]) {
    assert.equal(evaluateDigging({...spell("LIGHTNING"), ...setting}, material("soil")).status, "unsupported");
  }
});

test("noncircular effects and unknown data are not reported as zero digging", () => {
  assert.equal(evaluateDigging(spell("LUMINOUS_DRILL"), material("rock_hard")).status, "path");
  assert.equal(evaluateDigging(spell("LUMINOUS_DRILL"), {...material("rock_hard"), durability: 15}).status, "blocked");
  for (const id of ["ACID_TRAIL", "MATTER_EATER"]) {
    const result = evaluateDigging(spell(id), material("soil"));
    assert.equal(result.status, "conditional");
    assert.equal(result.radius, null);
  }
  const growing = evaluateDigging(spell("BLACK_HOLE_BIG"), material("soil"));
  assert.equal(growing.status, "digs");
  assert.equal(growing.radius, 64);
  assert.equal(growing.reachOnly, true);
  assert.equal(evaluateDigging(null, material("soil")).status, "empty");
  assert.equal(evaluateDigging(spell("NUKE"), null).status, "empty");
});

test("lances retain penetration damage when the explosion is blocked, without promising one-cast removal", () => {
  for (const id of ["LANCE", "LANCE_HOLY"]) {
    const lance = spell(id);
    assert.ok(lance.radius > 0, "the regression requires both effects on the same projectile");
    assert.equal(lance.groundPenetrationMaxDura, 0);
    for (const target of ["templebrick_noedge_static", "templebrick_static", "steel_static", "rock_hard", "rock_hard_border"]) {
      const result = evaluateDigging(lance, material(target));
      const removesAtEndpoint = result.penetration.contacts.some((contact) => contact.remaining === 0);
      assert.equal(result.status, removesAtEndpoint ? "path" : "partial", `${id}/${target}`);
      assert.equal(result.method, "path");
      assert.equal(result.radius, null, "the explosion radius must not become an invented penetration depth");
    }
  }
  const renamed = {...spell("LANCE"), id: "ANY_PENETRATING_PROJECTILE"};
  assert.equal(evaluateDigging(renamed, material("templebrick_noedge_static")).status, "partial",
    "this is a component rule, not an exception for one spell ID");
  assert.equal(evaluateDigging(spell("LANCE"), material("rock_box2d_nohit_hard")).status, "conditional",
    "an uncapped terrain effect does not establish physics-object destruction");
});

test("penetration caps, missing caps and a separate digging explosion remain distinct", () => {
  const brick = material("templebrick_noedge_static");
  const lance = spell("LANCE");
  assert.equal(evaluateDigging({...lance, groundPenetrationMaxDura: 14}, brick).status, "partial");
  assert.equal(evaluateDigging({...lance, groundPenetrationMaxDura: 13}, brick).status, "blocked");
  for (const limit of [null, undefined, NaN]) {
    assert.equal(evaluateDigging({...lance, groundPenetrationMaxDura: limit}, brick).status, "unsupported");
  }
  const explosive = {...lance, groundPenetrationMaxDura: 10, radius: 20, rayEnergy: 3000000, maxDuraToDestroy: 14};
  const result = evaluateDigging(explosive, brick);
  assert.equal(result.status, "digs");
  assert.equal(result.method, "explosion");
  assert.equal(result.radius, 3);
  assert.equal(evaluateDigging({...lance, groundPenetrationMaxDura: -1}, brick).status, "partial");
});

test("penetration matches the recovered first-cell damage and repeated-contact rule", () => {
  const brick = material("templebrick_noedge_static");
  const lance = spell("LANCE");
  assert.deepEqual(penetrationContact(lance, brick, 300),
    {speed: 300, damage: 175500, remaining: 824500, impacts: 6, speedAfter: 0});
  assert.deepEqual(penetrationContact(lance, brick, 400),
    {speed: 400, damage: 312000, remaining: 688000, impacts: 4, speedAfter: 0});
  const contacts = evaluateDigging(lance, brick).penetration.contacts;
  assert.deepEqual(contacts.map((contact) => contact.speed), [300, 400]);
  assert.deepEqual(contacts.map((contact) => contact.impacts), [6, 4]);
});

test("native penetration cutoff, rounding, zero hardness and slowdown stay distinct", () => {
  const projectile = {mass: 1, groundPenetrationCoeff: 0.0075};
  assert.equal(penetrationContact(projectile, {hardness: 2}, 10).damage, 0);
  assert.equal(penetrationContact(projectile, {hardness: 2}, 10.0000001).speedAfter, 10);
  assert.deepEqual(penetrationContact(projectile, {hardness: 2}, 20),
    {speed: 20, damage: 2, remaining: 0, impacts: 1, speedAfter: 0});
  const weak = penetrationContact({...projectile, groundPenetrationCoeff: 0.002499}, {hardness: 2}, 20);
  assert.equal(weak.damage, 0);
  assert.equal(weak.speedAfter, 0, "a rounded zero HP change can still stop the projectile");
  assert.deepEqual(penetrationContact(projectile, {hardness: 0}, 20),
    {speed: 20, damage: 0, remaining: 0, impacts: 1, speedAfter: 20});
  assert.equal(penetrationContact({mass: 1, groundPenetrationCoeff: 1}, {hardness: 100}, 20).speedAfter, 10);
});

test("unavailable penetration inputs do not become a successful digging claim", () => {
  const lance = spell("LANCE");
  const brick = material("templebrick_noedge_static");
  assert.equal(evaluateDigging({...lance, mass: 0}, brick).status, "blocked");
  for (const values of [{mass: null}, {mass: NaN}, {mass: -1}, {speedMin: null}, {speedMax: Infinity}, {speedMin: 1e20, speedMax: 1e20}]) {
    assert.equal(evaluateDigging({...lance, ...values}, brick).status, "unsupported");
  }
  assert.equal(evaluateDigging(lance, {...brick, hardness: null}).status, "unsupported");
});

test("zero hardness is valid; missing stats and physics objects are not guessed", () => {
  assert.equal(evaluateDigging(spell("NUKE"), {...material("soil"), hardness: 0}).radius, 250);
  for (const hardness of [null, undefined, NaN, -1, Infinity]) {
    assert.equal(evaluateDigging(spell("NUKE"), {...material("soil"), hardness}).status, "unsupported");
  }
  assert.equal(evaluateDigging(spell("NUKE"), material("steel")).status, "conditional");
  assert.equal(evaluateDigging(spell("NUKE"), material("water")).status, "conditional");
});

test("fixed scale preserves size comparisons and keeps a huge circle's edge visible", () => {
  for (const width of [240, 320, 768, 1200]) {
    const small = getDiggingViewport(6, width);
    const nuke = getDiggingViewport(250, width);
    assert.equal(small.scale, FIXED_SCALE);
    assert.equal(nuke.scale, small.scale);
    assert.equal(nuke.screenRadius, 1500);
    assert.equal(nuke.clipped, true);
    const edge = nuke.centerX + nuke.screenRadius;
    assert.ok(edge > 0 && edge < width);
    assert.ok(nuke.scaleUnits * nuke.scale < width / 2);
  }
});

test("fit mode contains the entire radius at narrow and wide viewport sizes", () => {
  for (const width of [240, 320, 768, 1200]) {
    for (const radius of [0, 1, 6, 60, 250, 400, 10000]) {
      const view = getDiggingViewport(radius, width, true);
      assert.equal(view.clipped, false);
      assert.ok(view.scale > 0 && view.scale <= FIXED_SCALE);
      assert.ok(view.centerX - view.screenRadius >= 23.999);
      assert.ok(view.centerX + view.screenRadius <= width - 23.999);
      assert.ok(view.centerY - view.screenRadius >= 23.999);
      assert.ok(view.centerY + view.screenRadius <= view.sceneHeight - 23.999);
    }
  }
});

test("the compact preview keeps Mina near the left edge at mid-height and at the effect scale", () => {
  for (const width of [240, 320, 420, 1200, 1800]) {
    for (const radius of [null, 0, 1, 6, 60, 250, 400]) {
      for (const fit of [false, true]) {
        const view = getDiggingViewport(radius, width, fit);
        assert.equal(view.sceneHeight, Math.max(200, Math.min(280, width * 0.3)));
        assert.equal(view.mina.width, 8 * view.scale);
        assert.equal(view.mina.height, 18 * view.scale);
        assert.ok(view.mina.x >= 0 && view.mina.x + view.mina.width <= width);
        assert.ok(view.mina.y >= 0 && view.mina.y + view.mina.height <= view.sceneHeight);
        assert.equal(view.mina.x, 36);
        assert.ok(Math.abs(view.mina.y + view.mina.height / 2 - view.sceneHeight / 2) < 1e-9);
      }
    }
  }
});

test("every catalog combination produces a finite bounded radius or an explicit nonestimate", () => {
  for (const s of spells.filter(isDiggingSpell)) {
    for (const m of materials) {
      const result = evaluateDigging(s, m, {preview: false});
      if (result.radius === null) {
        assert.ok(["path", "partial", "unsupported", "conditional"].includes(result.status) ||
          (["removes", "converts"].includes(result.status) && result.method === "laser") ||
          (result.status === "digs" && (result.method === "laser" ||
            (result.method === "acid" && m.tags.includes("[corrodible]")))), `${s.id}/${m.id}`);
      } else {
        assert.ok(Number.isFinite(result.radius) && result.radius >= 0, `${s.id}/${m.id}`);
        // Auxiliary fire effects have conditional reach even when they do
        // not qualify as a terrain-conversion capability in getBaseRadius.
        const sourceBound = Math.max(getBaseRadius(s) ?? 0,
          ...(s.conversionEffects ?? []).map((effect) => effect.radius ?? 0));
        if (result.radius > 0) assert.ok(result.radius <= sourceBound, `${s.id}/${m.id}`);
      }
    }
  }
});

test("Luminous Drill draws removed cells as a one-pixel path that depends on hardness", () => {
  const soil = evaluateDigging(spell("LUMINOUS_DRILL"), material("soil"));
  const brick = evaluateDigging(spell("LUMINOUS_DRILL"), material("templebrick_static"));
  assert.equal(soil.footprint.kind, "path");
  assert.equal(soil.footprint.width, 1);
  assert.equal(soil.footprint.lengthMin, 34);
  assert.equal(soil.footprint.lengthMax, 34);
  assert.equal(soil.footprint.outlineOnly, false);
  assert.equal(brick.footprint.width, 1);
  assert.equal(brick.footprint.lengthMax, 2);
  assert.doesNotMatch(soil.reason, /subsequent cells are not simulated/);
});

test("Black Hole sweeps its diameter along accelerated travel while bombs retain impact footprints", () => {
  const hole = evaluateDigging(spell("BLACK_HOLE"), material("soil"));
  assert.equal(hole.footprint.kind, "path");
  assert.equal(hole.footprint.width, 24);
  assert.ok(hole.footprint.lengthMin > 115 && hole.footprint.lengthMin < 116);
  assert.ok(hole.footprint.lengthMax > 129 && hole.footprint.lengthMax < 130);
  assert.ok(hole.footprint.maxPoints.length > hole.footprint.points.length);
  assert.equal(hole.footprint.outlineOnly, false);
  for (const id of ["BOMB", "NUKE", "FIREWORK"]) {
    const impact = evaluateDigging(spell(id), material("soil"));
    assert.equal(impact.footprint.kind, "explosion", id);
    assert.ok(impact.footprint.radius > 0, id);
    assert.equal(impact.footprint.estimated, true, id);
  }
});

test("all selectable standalone spells have a known outcome for ordinary terrain", () => {
  for (const entry of spells.filter(isDiggingSpell)) {
    const outcome = evaluateDigging(entry, material("soil"), {preview: false});
    assert.notEqual(outcome.status, "unsupported", `${entry.id}: ${outcome.reason}`);
  }
});
