import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {evaluateDigging, getBaseRadius, getDiggingViewport, isDiggingSpell, FIXED_SCALE} from "../src/digging/model.js";

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

test("Dense Rock variants resist acid, while an initial explosion can still break glass", () => {
  for (const id of ["rock_hard", "rock_hard_border", "rock_box2d_nohit_hard"]) {
    const result = evaluateDigging(spell("ACIDSHOT"), material(id));
    assert.equal(result.status, "blocked", id);
    assert.equal(result.radius, 0);
    assert.match(result.reason, /resists acid/);
    assert.doesNotMatch(result.reason, /Physics objects|does not cover/);
  }
  const glass = evaluateDigging(spell("ACIDSHOT"), material("glass"));
  assert.equal(glass.status, "digs");
  assert.equal(glass.method, "explosion");
  assert.equal(glass.radius, 9);
  assert.match(glass.reason, /initial explosion/);
});

test("standalone acid emitters use corrosion, but modifiers and unknown data are not guessed", () => {
  for (const id of ["MATERIAL_ACID", "CLOUD_ACID", "CIRCLE_ACID", "SEA_ACID"]) {
    assert.ok(isDiggingSpell(spell(id)));
    assert.equal(evaluateDigging(spell(id), material("templebrick_static")).status, "digs");
    assert.equal(evaluateDigging(spell(id), material("rock_hard")).status, "blocked");
  }
  assert.equal(evaluateDigging(spell("ACID_TRAIL"), material("soil")).status, "unsupported");
  assert.equal(evaluateDigging(spell("ACIDSHOT"), {...material("soil"), tags: undefined}).status, "unsupported");
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
  for (const limit of [null, undefined, -1, NaN]) {
    assert.equal(evaluateDigging({...lance, groundPenetrationMaxDura: limit}, brick).status, "unsupported");
  }
  const explosive = {...lance, groundPenetrationMaxDura: 10, radius: 20, rayEnergy: 3000000, maxDuraToDestroy: 14};
  const result = evaluateDigging(explosive, brick);
  assert.equal(result.status, "digs");
  assert.equal(result.method, "explosion");
  assert.equal(result.radius, 3);
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
          (result.status === "digs" && result.method === "acid" && m.tags.includes("[corrodible]")), `${s.id}/${m.id}`);
      } else {
        assert.ok(Number.isFinite(result.radius) && result.radius >= 0, `${s.id}/${m.id}`);
        if (result.radius > 0) assert.ok(result.radius <= getBaseRadius(s), `${s.id}/${m.id}`);
      }
    }
  }
});
