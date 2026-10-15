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

test("real digging defaults exist and include both small spells and nukes", () => {
  for (const id of ["DIGGER", "NUKE", "NUKE_GIGA", "BLACK_HOLE", "LUMINOUS_DRILL"]) {
    assert.ok(isDiggingSpell(spell(id)));
  }
  assert.equal(evaluateDigging(spell("DIGGER"), material("soil")).radius, 6);
});

test("hardness consumes ray energy per pixel, with equality allowing one pixel", () => {
  assert.equal(evaluateDigging(spell("DIGGER"), material("rock_static")).radius, 1);
  assert.equal(evaluateDigging(spell("DIGGER"), material("rock_hard")).radius, 0);
  assert.equal(evaluateDigging(spell("NUKE"), material("rock_static")).radius, 67);
  assert.equal(evaluateDigging(spell("NUKE"), material("soil")).radius, 250);
});

test("durability can block a nuke; the exact durability limit remains diggable", () => {
  const blocked = evaluateDigging(spell("NUKE"), material("templebrick_static"));
  assert.equal(blocked.status, "blocked");
  assert.match(blocked.reason, /durability 14/);
  assert.equal(evaluateDigging(spell("NUKE_GIGA"), material("templebrick_static")).radius, 9);
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

test("Dense Rock resists acid, while an initial explosion can still break glass", () => {
  for (const [id, status] of [["rock_hard", "partial"], ["rock_hard_border", "blocked"]]) {
    const result = evaluateDigging(spell("ACIDSHOT"), material(id));
    assert.equal(result.status, status, id);
    assert.equal(result.radius, 0);
    assert.match(result.effects.find((effect) => effect.method === "acid").reason, /resists acid/);
    assert.doesNotMatch(result.reason, /Physics objects|does not cover/);
  }
  const glass = evaluateDigging(spell("ACIDSHOT"), material("glass"));
  assert.equal(glass.status, "digs");
  assert.equal(glass.method, "explosion");
  assert.equal(glass.radius, 9);
  assert.match(glass.effects.find((effect) => effect.method === "acid").reason, /resists acid/);
  assert.equal(glass.circularEffect.method, "explosion");
});

test("acid resistance does not turn an unmodeled direct effect into zero digging", () => {
  for (const id of ["rock_box2d_nohit_hard", "alcohol", "smoke", "steam"]) {
    const outcome = evaluateDigging(spell("ACIDSHOT"), material(id));
    assert.equal(outcome.status, "unsupported", id);
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
  assert.equal(evaluateDigging(spell("ACID_TRAIL"), material("soil")).status, "unsupported");
  const missingTags = evaluateDigging(spell("ACIDSHOT"), {...material("soil"), tags: undefined});
  assert.equal(missingTags.effects.find((effect) => effect.method === "acid").status, "unsupported");
  assert.equal(missingTags.circularEffect.radius, 9, "missing corrosion data does not erase a known initial explosion");
  assert.equal(evaluateDigging(spell("ACIDSHOT"), material("steel")).status, "unsupported");
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
    assert.equal(getBaseRadius(spell(id)), radius);
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
  assert.equal(evaluateDigging(spell("BLACK_HOLE_GIGA"), material("gem_box2d_yellow_sun")).status, "blocked");
  assert.equal(evaluateDigging(spell("BLACK_HOLE"), material("steel")).status, "digs",
    "the component explicitly consumes dynamic physics bodies");
  for (const settings of [{cellEaterOnlyStain: true}, {cellEaterEatProbability: 0}]) {
    const outcome = evaluateDigging({...spell("BLACK_HOLE"), ...settings}, material("soil"));
    assert.equal(outcome.status, "blocked");
    assert.equal(outcome.circularEffect, null);
  }
});

test("known explosion geometry does not fill in missing energy and durability values", () => {
  const outcome = evaluateDigging(spell("LIGHTNING"), material("soil"));
  assert.equal(outcome.method, "explosion");
  assert.equal(outcome.status, "unsupported");
  assert.equal(outcome.radius, null);
  assert.equal(getBaseRadius(spell("LIGHTNING")), 35);
  assert.equal(outcome.circularEffect, null);
});

test("noncircular effects and unknown data are not reported as zero digging", () => {
  assert.equal(evaluateDigging(spell("LUMINOUS_DRILL"), material("rock_hard")).status, "path");
  assert.equal(evaluateDigging(spell("LUMINOUS_DRILL"), {...material("rock_hard"), durability: 15}).status, "blocked");
  for (const id of ["ACID_TRAIL", "MATTER_EATER", "BLACK_HOLE_BIG"]) {
    const result = evaluateDigging(spell(id), material("soil"));
    assert.equal(result.status, "unsupported");
    assert.equal(result.radius, null);
  }
  assert.equal(evaluateDigging(null, material("soil")).status, "empty");
  assert.equal(evaluateDigging(spell("NUKE"), null).status, "empty");
});

test("lances penetrate brickwork and hard terrain even when their impact explosions cannot", () => {
  for (const id of ["LANCE", "LANCE_HOLY"]) {
    const lance = spell(id);
    assert.ok(lance.radius > 0, "the regression requires both effects on the same projectile");
    assert.equal(lance.groundPenetrationMaxDura, 0);
    for (const target of ["templebrick_noedge_static", "templebrick_static", "steel_static", "rock_hard", "rock_hard_border"]) {
      const result = evaluateDigging(lance, material(target));
      assert.equal(result.status, "path", `${id}/${target}`);
      assert.equal(result.method, "path");
      assert.equal(result.radius, null, "the explosion radius must not become an invented penetration depth");
    }
  }
  const renamed = {...spell("LANCE"), id: "ANY_PENETRATING_PROJECTILE"};
  assert.equal(evaluateDigging(renamed, material("templebrick_noedge_static")).status, "path",
    "this is a component rule, not an exception for one spell ID");
  assert.equal(evaluateDigging(spell("LANCE"), material("rock_box2d_nohit_hard")).status, "unsupported",
    "an uncapped terrain effect does not establish physics-object destruction");
});

test("penetration caps, missing caps and a separate digging explosion remain distinct", () => {
  const brick = material("templebrick_noedge_static");
  const lance = spell("LANCE");
  assert.equal(evaluateDigging({...lance, groundPenetrationMaxDura: 14}, brick).status, "path");
  assert.equal(evaluateDigging({...lance, groundPenetrationMaxDura: 13}, brick).status, "blocked");
  for (const limit of [null, undefined, NaN]) {
    assert.equal(evaluateDigging({...lance, groundPenetrationMaxDura: limit}, brick).status, "unsupported");
  }
  const explosive = {...lance, groundPenetrationMaxDura: 10, radius: 20, rayEnergy: 3000000, maxDuraToDestroy: 14};
  const result = evaluateDigging(explosive, brick);
  assert.equal(result.status, "digs");
  assert.equal(result.method, "explosion");
  assert.equal(result.radius, 3);
  assert.equal(evaluateDigging({...lance, groundPenetrationMaxDura: -1}, brick).status, "path");
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
  assert.equal(evaluateDigging(spell("NUKE"), material("steel")).status, "unsupported");
  assert.equal(evaluateDigging(spell("NUKE"), material("water")).status, "unsupported");
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

test("terrain stays square and Mina stays in the bottom right at the same scale as the circle", () => {
  for (const width of [240, 320, 420]) {
    for (const radius of [null, 0, 1, 6, 60, 250, 400]) {
      for (const fit of [false, true]) {
        const view = getDiggingViewport(radius, width, fit);
        assert.equal(view.sceneHeight, width);
        assert.equal(view.mina.width, 8 * view.scale);
        assert.equal(view.mina.height, 18 * view.scale);
        assert.ok(view.mina.x >= 0 && view.mina.x + view.mina.width <= width);
        assert.ok(view.mina.y >= 0 && view.mina.y + view.mina.height <= view.sceneHeight);
        assert.ok(Math.abs(view.mina.x + view.mina.width - (width - 32)) < 1e-9);
        assert.ok(Math.abs(view.mina.y + view.mina.height - (view.sceneHeight - 12)) < 1e-9);
      }
    }
  }
});

test("every catalog combination produces a finite bounded radius or an explicit nonestimate", () => {
  for (const s of spells.filter(isDiggingSpell)) {
    for (const m of materials) {
      const result = evaluateDigging(s, m);
      if (result.radius === null) {
        assert.ok(["path", "unsupported"].includes(result.status) ||
          (result.status === "digs" && (result.method === "laser" ||
            (result.method === "acid" && m.tags.includes("[corrodible]")))), `${s.id}/${m.id}`);
      } else {
        assert.ok(Number.isFinite(result.radius) && result.radius >= 0, `${s.id}/${m.id}`);
        if (result.radius > 0) assert.ok(result.radius <= getBaseRadius(s), `${s.id}/${m.id}`);
      }
    }
  }
});
