import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {parseFragment} from "parse5";
import {evaluateDigging, getBaseRadius, getDiggingViewport} from "../src/digging/model.js";
import {getPathGeometry, getExplosionGeometry} from "../src/digging/geometry.js";
import {evaluateExplosionFootprint} from "../src/digging/explosion.js";
import {evaluateComparison, getComparisonScale, getComparisonLayout} from "../src/digging/comparison.js";

// Serialize the view's templates for HTML parsing in Node; no browser or DOM.
class Markup {
  constructor(value) { this.value = value; }
  toString() { return this.value; }
}
const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[c]);
const renderValue = (value) => value == null ? "" : Array.isArray(value)
  ? value.map(renderValue).join("") : value instanceof Markup ? value.toString() : escape(value);
const markup = (strings, ...values) => new Markup(strings.reduce((result, part, i) =>
  result + part + renderValue(values[i]), ""));
const source = readFileSync(new URL("../src/digging/view.js", import.meta.url), "utf8")
  .replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "");
const {renderDiggingPlot: render, renderDiggingResult, renderDiggingComparison} = runInNewContext(`${source}\n({renderDiggingPlot, renderDiggingResult, renderDiggingComparison});`, {
  html: markup, svg: markup, getBaseRadius, getDiggingViewport, getPathGeometry, getExplosionGeometry, getComparisonLayout,
});

test("every compared spell appears in one shared plot with one terrain block, Mina and scale", () => {
  const entries = [6, 250].map((radius, index) => ({
    spell: {id: ["DIGGER", "NUKE"][index], name: ["Digging Bolt", "Nuke"][index], radius},
    result: {status: "digs", method: "explosion", radius}, color: ["#45b7d1", "#ff6b6b"][index],
  }));
  const output = String(renderDiggingComparison(entries, {name: "Soil"}, 1100, true));
  const elements = [...nodes(parseFragment(output))];
  assert.equal(elements.filter((node) => node.tagName === "svg").length, 1);
  for (const className of ["digging-terrain", "digging-mina", "digging-scale", "digging-plot-border"]) {
    assert.equal(elements.filter((node) => attrs(node).class === className).length, 1, className);
  }
  const areas = elements.filter((node) => attrs(node).class === "digging-spell-area");
  assert.equal(areas.length, 2);
  const radii = [];
  for (const [index, area] of areas.entries()) {
    const children = [...nodes(area)];
    assert.equal(attrs(area)["data-spell-id"], entries[index].spell.id);
    assert.equal(attrs(area)["aria-label"], `${entries[index].spell.name}: Digs`);
    const outline = children.find((node) => node.tagName === "circle" && attrs(node).stroke);
    assert.equal(attrs(outline).stroke, entries[index].color);
    assert.equal(attrs(elements.filter((node) => attrs(node).class === "digging-area-color")[index]).fill, entries[index].color);
    radii.push(Number(attrs(outline).r));
  }
  assert.ok(Math.abs(radii[1] / radii[0] - 250 / 6) < 1e-8, "Fit must preserve relative spell sizes");
  assert.equal(elements.filter((node) => attrs(node).class === "digging-spell-label").length, 2);
  const narrow = [...nodes(parseFragment(String(renderDiggingComparison(entries, {name: "Soil"}, 420, true))))];
  assert.equal(narrow.filter((node) => node.tagName === "svg").length, 1, "narrow screens retain the same shared plot");
});

test("shared terrain removes each eligible spell's area and never overlaps neighboring casts", () => {
  const spells = JSON.parse(readFileSync(new URL("../src/data/FULL_SPELLS_FINAL.json", import.meta.url)));
  const soil = JSON.parse(readFileSync(new URL("../src/data/FULL_MATERIALS_FINAL.json", import.meta.url))).find((material) => material.id === "soil");
  const entries = evaluateComparison(["BLACK_HOLE", "LUMINOUS_DRILL", "NUKE", "BLACK_HOLE_GIGA"]
    .map((id) => spells.find((spell) => spell.id === id)), soil);
  for (const width of [240, 600, 1200]) for (const fit of [false, true]) {
    const view = getComparisonLayout(entries, width, fit);
    assert.ok(view.height >= 200 && view.height <= 280);
    assert.equal(view.mina.y + view.mina.height / 2, view.height / 2);
    for (const [index, lane] of view.lanes.entries()) {
      assert.equal(lane.removes, true);
      assert.ok(lane.clip.x >= view.mina.x + view.mina.width);
      if (index) assert.ok(view.lanes[index - 1].clip.y + view.lanes[index - 1].clip.height <= lane.clip.y);
      if (fit) {
        assert.equal(lane.clipped, false);
        assert.ok(lane.bounds.left >= lane.clip.x - 1e-8 && lane.bounds.right <= lane.clip.x + lane.clip.width + 1e-8);
        assert.ok(lane.bounds.top >= lane.clip.y - 1e-8 && lane.bounds.bottom <= lane.clip.y + lane.clip.height + 1e-8);
      }
    }
  }
  const elements = [...nodes(parseFragment(String(renderDiggingComparison(entries, soil, 1000, true))))];
  const mask = elements.find((node) => node.tagName === "mask" && attrs(node).id.endsWith("-terrain-mask"));
  const cutouts = [...nodes(mask)].filter((node) => /^(digging-path-cutout|digging-area-cutout)$/.test(attrs(node).class ?? ""));
  assert.equal(cutouts.length, entries.length);
  const patterned = cutouts.filter((node) => attrs(node).stroke?.includes("-removal-"));
  assert.equal(patterned.length, 1, "partial cell eating retains its speckled cutout");
});

test("shared zoom fits both moving and explosive spells without changing their relative scale", () => {
  const spells = JSON.parse(readFileSync(new URL("../src/data/FULL_SPELLS_FINAL.json", import.meta.url)));
  const soil = JSON.parse(readFileSync(new URL("../src/data/FULL_MATERIALS_FINAL.json", import.meta.url))).find((material) => material.id === "soil");
  const entries = evaluateComparison(["BLACK_HOLE", "LUMINOUS_DRILL", "NUKE_GIGA"].map((id) => spells.find((spell) => spell.id === id)), soil);
  for (const width of [220, 600]) {
    const scale = getComparisonScale(entries, width, true);
    for (const {result} of entries) {
      const view = getPathGeometry(result.footprint, width, true, scale) ?? getExplosionGeometry(result.footprint, width, true, scale);
      assert.equal(view.scale, scale);
      assert.equal(view.mina.width, 8 * scale);
      assert.equal(view.clipped, false);
      if (view.bounds) {
        assert.ok(view.bounds.left >= 0 && view.bounds.right <= width);
        assert.ok(view.bounds.top >= 0 && view.bounds.bottom <= view.sceneHeight);
      }
    }
  }
});
const attrs = (node) => Object.fromEntries((node.attrs ?? []).map(({name, value}) => [name, value]));
function* nodes(node) {
  yield node;
  for (const child of node.childNodes ?? []) yield* nodes(child);
}

test("digging SVG keeps the hosted Mina image and terrain clip at valid dimensions", () => {
  for (const [radius, fit] of [[6, false], [250, false], [250, true], [0, false], [null, false]]) {
    const status = radius > 0 ? "digs" : radius === 0 ? "blocked" : "unsupported";
    const output = render({name: "Digging bolt"}, {name: "Soil", image_local: "Material_soil.png"}, {radius, status}, 420, fit);
    const elements = [...nodes(parseFragment(String(output)))];
    const mina = elements.find((node) => attrs(node).class === "digging-mina");
    assert.ok(mina, "the sprite must exist for every result");
    const sprite = attrs(mina);
    const view = getDiggingViewport(radius, 420, fit);
    assert.equal(sprite.href, "https://noita-bartender-images.acidflow.stream/images/mina/mina.png");
    for (const key of ["x", "y", "width", "height"]) {
      assert.equal(Number(sprite[key]), view.mina[key], `Minä ${key} must be a valid SVG number`);
    }
    assert.equal(sprite.transform, `translate(${2 * view.mina.x + view.mina.width} 0) scale(-1 1)`);
    assert.equal(mina.parentNode.tagName, "g", "the sprite must be a scene element");
    const clip = elements.find((node) => node.tagName === "clipPath");
    const clipRect = clip.childNodes.find((node) => node.tagName === "rect");
    assert.equal(Number(attrs(clipRect).width), view.width);
    assert.equal(Number(attrs(clipRect).height), view.sceneHeight);
    const terrain = elements.find((node) => node.tagName === "rect" && attrs(node).fill?.includes("-material"));
    assert.match(attrs(terrain).fill, /^url\(#[^)]+-material\)$/);
    const texture = elements.find((node) => attrs(node).href?.includes("/materials/"));
    assert.equal(attrs(texture).href, "https://noita-bartender-images.acidflow.stream/images/materials/Material_soil.png");
    const mask = elements.find((node) => node.tagName === "mask");
    assert.equal(attrs(terrain.parentNode).mask, `url(#${attrs(mask).id})`);
    assert.notEqual(mina.parentNode, terrain.parentNode, "removing terrain must not erase Minä");
    const hole = mask.childNodes.find((node) => node.tagName === "circle");
    const outline = elements.find((node) => node.tagName === "circle" && attrs(node).stroke);
    const svg = elements.find((node) => node.tagName === "svg");
    assert.ok(!svg.childNodes.some((node) => node.tagName === "rect" && attrs(node).fill !== "none"),
      "the hole must remain transparent through the SVG, with no colored background underneath");
    if (radius > 0) {
      assert.equal(attrs(hole).fill, "#000", "the hole removes the terrain from the mask");
      assert.equal(attrs(outline).fill, "none", "the hole must not be filled with tinted terrain");
      assert.equal(attrs(outline).stroke, "#fff");
      for (const attribute of ["cx", "cy", "r"]) assert.equal(attrs(hole)[attribute], attrs(outline)[attribute]);
    } else {
      assert.equal(hole, undefined, "blocked and unsupported effects leave the terrain intact");
      assert.equal(outline, undefined);
    }
    const badge = elements.find((node) => attrs(node).role === "status");
    assert.equal(attrs(badge.parentNode).class, "digging-scene", "status belongs inside the plot");
  }
});

test("acid corrosion shows a successful result without borrowing the explosion's radius", () => {
  const spell = {name: "Acid Ball", radius: 9, rayEnergy: 20000};
  const material = {name: "Brickwork", tags: ["[corrodible]"], image_local: "Material_templebrick_static.png"};
  const result = {status: "digs", method: "acid", radius: null, reason: "Acid dissolves Brickwork."};
  const plot = String(render(spell, material, result, 420, false));
  assert.match(plot, />Digs<\/span>/);
  assert.match(plot, /no fixed circular radius/);
  assert.doesNotMatch(plot, /<circle/);
  const details = String(renderDiggingResult(spell, material, result));
  assert.match(details, /Acid corrosion/);
  assert.match(details, /Varies with flow/);
  assert.doesNotMatch(details, /Maximum radius|9 px|Spell durability limit/);
});

test("projectile penetration shows Digs without claiming its impact radius is the hole depth", () => {
  const spell = {name: "Glowing Lance", radius: 1, rayEnergy: 100000, maxDuraToDestroy: 10,
    groundPenetrationCoeff: 6, groundPenetrationMaxDura: 0};
  const material = {name: "Brickwork", hardness: 1000000, durability: 14};
  const result = {status: "path", method: "path", radius: null, reason: "Ground penetration can dig this material."};
  const plot = String(render(spell, material, result, 420, false));
  assert.match(plot, />Digs<\/span>/);
  assert.match(plot, /Depth per cast is not quantified/);
  assert.doesNotMatch(plot, /<circle|Doesn&#39;t dig/);
  const details = String(renderDiggingResult(spell, material, result));
  assert.match(details, /Projectile penetration/);
  assert.match(details, /Not quantified/);
  assert.match(details, /No cap/);
  assert.doesNotMatch(details, /Maximum radius|Spell durability limit|1 px/);
});

test("mixed effects draw and label only the independently calculated explosion", () => {
  const explosion = {status: "digs", method: "explosion", radius: 30, reason: "Initial explosion."};
  const penetration = {status: "path", method: "path", radius: null, reason: "Penetration is not quantified."};
  const result = {...penetration, effects: [penetration, explosion], circularEffect: explosion};
  const spell = {name: "Holy Lance", radius: 30, rayEnergy: 100000, groundPenetrationMaxDura: 0};
  const material = {name: "Soil"};
  const plot = String(render(spell, material, result, 420, false));
  assert.match(plot, /30 px estimated explosion radius only/);
  assert.match(plot, /Penetration depth is not quantified/);
  const circles = [...nodes(parseFragment(plot))].filter((node) => node.tagName === "circle");
  assert.equal(circles.length, 2, "one mask and one white outline");
  assert.ok(circles.every((node) => Number(attrs(node).r) === 180));
  const details = String(renderDiggingResult(spell, material, result));
  assert.match(details, /Projectile penetration/);
  assert.match(details, /30 px estimated radius/);
  assert.doesNotMatch(details, /&lt;p/);
});

test("beam settings never become a circular hole or a claimed digging depth", () => {
  const spell = {name: "Plasma Beam", laserBeamRadius: 1.5, laserMaxLength: 160, laserCellDamage: 12000, laserMaxDuraToDestroy: 11};
  const material = {name: "Soil", durability: 10};
  const result = {status: "unsupported", method: "laser", radius: null, reason: "Depth has not been calculated."};
  assert.doesNotMatch(String(render(spell, material, result, 420, false)), /<circle/);
  const details = String(renderDiggingResult(spell, material, result));
  assert.match(details, /Configured beam radius/);
  assert.match(details, /1.5 px/);
  assert.match(details, /Maximum beam length/);
  assert.doesNotMatch(details, /Estimated dig radius/);
});

test("probabilistic cell eating outlines its footprint without promising a completely empty hole", () => {
  const result = {status: "digs", method: "cell", radius: 60};
  const plot = String(render({name: "Omega Black Hole", cellEaterEatProbability: 80}, {name: "Soil"}, result, 420, true));
  const circles = [...nodes(parseFragment(plot))].filter((node) => node.tagName === "circle");
  assert.equal(circles.length, 1);
  assert.equal(attrs(circles[0]).fill, "none");
  assert.match(plot, /Removal is probabilistic/);
});

test("default launch-speed comparison labels the range and avoids claiming a tunnel depth", () => {
  const spell = {name: "Glowing Lance", mass: 0.65, groundPenetrationCoeff: 6, groundPenetrationMaxDura: 0, speedMin: 300, speedMax: 400};
  const material = {name: "Brickwork", type: "Solid", hardness: 1000000, durability: 14};
  const details = String(renderDiggingResult(spell, material, evaluateDigging(spell, material)));
  assert.match(details, /Launch-speed range/);
  assert.match(details, /300–400 px\/s/);
  assert.match(details, /175,500–312,000 HP/);
  assert.match(details, /4–6/);
  assert.match(details, /Not quantified/);
});

test("a reference path that removes no complete cell keeps terrain and reports no immediate hole", () => {
  const result = {status: "path", method: "path", radius: null,
    footprint: {kind: "path", width: 1, points: [[1, 0]], lengthMin: 0, lengthMax: 0,
      partial: true, outlineOnly: true, caption: "This contact damages the first cell."}};
  const plot = String(render({name: "Lance"}, {name: "Brickwork"}, result, 640, false));
  assert.match(plot, />No immediate hole<\/span>/);
  assert.doesNotMatch(plot, /digging-path-cutout/);
  assert.match(plot, /digging-path-outline/);
});

test("secondary explosion statistics use the chosen child instead of absent parent settings", () => {
  const result = {status: "digs", method: "explosion", radius: 15, radiusRange: [15, 15],
    explosion: {radius: 15, rayEnergy: 2000000, maxDurability: 10}};
  const details = String(renderDiggingResult({name: "Firework", radius: null, rayEnergy: null},
    {name: "Soil", hardness: 2000, durability: 10}, result));
  assert.match(details, /Ray energy<\/dt><dd>2,000,000/);
  assert.match(details, /Spell durability limit<\/dt><dd>10/);
});

test("partial damage leaves the square intact without claiming a permanent inability to dig", () => {
  const result = {status: "partial", method: "explosion", radius: 0};
  const plot = String(render({name: "Digging Bolt"}, {name: "Dense Rock"}, result, 420, false));
  assert.match(plot, /No immediate hole/);
  assert.match(plot, /Repeated impacts can change the result/);
  assert.doesNotMatch(plot, /<circle|No digging in this material/);
});

const pathResult = (footprint) => ({status: "digs", method: "cell", radius: null,
  footprint: {kind: "path", points: [[0, 0], [25, 0]], width: 1, probabilistic: false,
    caption: "The projectile removes terrain along this path.", lengthMin: 25, lengthMax: 25, ...footprint}});

test("a thin digging path cuts its true width and outlines its swept boundary in white", () => {
  const result = pathResult();
  const elements = [...nodes(parseFragment(String(render({name: "Luminous Drill", radius: 30}, {name: "Soil"}, result, 800, false))))];
  const hole = elements.find((node) => attrs(node).class === "digging-path-cutout");
  const outline = elements.find((node) => attrs(node).class === "digging-path-outline");
  assert.equal(attrs(hole).fill, "none");
  assert.equal(attrs(hole)["stroke-width"], "6", "one game pixel occupies six screen pixels");
  assert.equal(attrs(hole)["stroke-linecap"], "round");
  assert.equal(attrs(outline).stroke, "#fff");
  assert.equal(attrs(outline).fill, "none");
  assert.equal(attrs(outline).d, attrs(hole).d);
  assert.ok(attrs(outline.parentNode).mask.endsWith("-path-outline)"), "the white stroke must be hollowed out to leave a transparent tunnel");
  assert.ok(!elements.some((node) => node.tagName === "circle"), "the spell's unrelated radius must not turn its path into a circle");
});

test("traveling cell eaters cut out one representative path without a second end", () => {
  const result = pathResult({points: [[0, 0], [30, 4], [60, 16]], maxPoints: [[0, 0], [30, 4], [60, 16], [90, 36]],
    previewPoints: [[0, 0], [40, 8], [75, 25]],
    width: 24, lengthMin: 62, lengthMax: 98});
  const geometry = getPathGeometry(result.footprint, 1000, false);
  const output = String(render({name: "Black Hole"}, {name: "Brickwork"}, result, 1000, false));
  const elements = [...nodes(parseFragment(output))];
  const hole = elements.find((node) => attrs(node).class === "digging-path-cutout");
  const extension = elements.find((node) => attrs(node).class === "digging-path-extent");
  assert.equal(attrs(hole).d, geometry.path);
  assert.equal(attrs(hole)["stroke-width"], "144");
  assert.equal(extension, undefined);
  assert.equal(geometry.maxPath, undefined);
  const terrainMask = elements.find((node) => node.tagName === "mask" && attrs(node).id.endsWith("-terrain-mask"));
  assert.equal(terrainMask.childNodes.filter((node) => node.tagName === "path").length, 1,
    "one representative cast produces one cutout");
  assert.doesNotMatch(output, /dashed outline|longer possible path|wind/i);
  const details = String(renderDiggingResult({name: "Black Hole"}, {name: "Brickwork"}, result));
  assert.match(details, /62–98 px/);
  assert.match(details, /Path width/);
});

test("known partial cell eating removes speckles instead of leaving an untouched outline", () => {
  const result = pathResult({width: 24, probabilistic: true, outlineOnly: true, removalProbability: 0.8});
  const output = String(render({name: "Omega Black Hole"}, {name: "Soil"}, result, 800, true));
  const elements = [...nodes(parseFragment(output))];
  const hole = elements.find((node) => attrs(node).class === "digging-path-cutout");
  const pattern = elements.find((node) => node.tagName === "pattern" && attrs(node).id.endsWith("-removal"));
  assert.equal(attrs(hole).stroke, `url(#${attrs(pattern).id})`);
  const removedCells = pattern.childNodes.filter((node) => node.tagName === "rect" && attrs(node).fill === "#000");
  assert.ok(removedCells.length > 0 && removedCells.length < 64, "some material remains inside a partial cutout");
  assert.match(output, /Speckling illustrates partial cell removal/);
});

test("actual traveling spell profiles produce cutouts with a right-facing Mina beside the cast", () => {
  const spells = JSON.parse(readFileSync(new URL("../src/data/FULL_SPELLS_FINAL.json", import.meta.url)));
  const soil = JSON.parse(readFileSync(new URL("../src/data/FULL_MATERIALS_FINAL.json", import.meta.url)))
    .find((material) => material.id === "soil");
  for (const id of ["BLACK_HOLE", "WHITE_HOLE", "BLACK_HOLE_DEATH_TRIGGER", "BLACK_HOLE_GIGA", "WHITE_HOLE_GIGA", "LUMINOUS_DRILL", "LANCE_HOLY"]) {
    const spell = spells.find((spell) => spell.id === id);
    const result = evaluateDigging(spell, soil);
    const output = String(render(spell, soil, result, 1000, true));
    const elements = [...nodes(parseFragment(output))];
    const cutout = elements.find((node) => attrs(node).class === "digging-path-cutout");
    assert.ok(cutout, `${id} must visibly remove material`);
    assert.ok(Number(attrs(cutout)["stroke-width"]) > 0);
    assert.equal(elements.filter((node) => attrs(node).class === "digging-path-outline").length, 1);
    const sprite = attrs(elements.find((node) => attrs(node).class === "digging-mina"));
    assert.match(sprite.transform, /scale\(-1 1\)$/);
    assert.equal(Number(sprite.x), 36);
    assert.ok(Math.abs(Number(sprite.y) + Number(sprite.height) / 2 - 140) < 1e-8);
    assert.doesNotMatch(output, /digging-path-extent/);
  }
});

test("probabilistic paths and reach-only effects retain terrain inside their outlines", () => {
  for (const result of [pathResult({probabilistic: true}), pathResult({outlineOnly: true, impactRadius: 5}), {...pathResult(), reachOnly: true}]) {
    const elements = [...nodes(parseFragment(String(render({name: "Giga Sawblade"}, {name: "Soil"}, result, 800, false))))];
    const terrainMask = elements.find((node) => node.tagName === "mask" && attrs(node).id.endsWith("-terrain-mask"));
    assert.ok(!terrainMask.childNodes.some((node) => ["path", "circle"].includes(node.tagName)));
    assert.ok(elements.some((node) => attrs(node).class === "digging-path-outline"));
  }
});

test("a separately modeled impact circle is drawn only at the path endpoint", () => {
  const result = pathResult({points: [[0, 0], [20, 10]], impactRadius: 5});
  const geometry = getPathGeometry(result.footprint, 800, false);
  const elements = [...nodes(parseFragment(String(render({name: "Holy Lance"}, {name: "Soil"}, result, 800, false))))];
  const impact = elements.find((node) => attrs(node).class === "digging-impact-cutout");
  assert.equal(Number(attrs(impact).cx), geometry.impact.x);
  assert.equal(Number(attrs(impact).cy), geometry.impact.y);
  assert.equal(Number(attrs(impact).r), 30);
});

test("Fit contains the visible path and endpoint blast while keeping the cast level with Mina", () => {
  const footprint = pathResult({points: [[0, 0], [400, 80], [800, 200]], maxPoints: [[0, 0], [700, 200], [1400, 650]],
    width: 24, impactRadius: 120}).footprint;
  for (const width of [240, 420, 1000, 1600]) {
    const fixed = getPathGeometry(footprint, width, false);
    assert.equal(fixed.scale, 6);
    assert.equal(fixed.clipped, true);
    assert.ok(fixed.path.startsWith("M "));
    const fit = getPathGeometry(footprint, width, true);
    assert.equal(fit.clipped, false);
    assert.ok(fit.scale > 0 && fit.scale < 6);
    assert.ok(fit.bounds.left >= 23.999 && fit.bounds.right <= fit.width - 23.999);
    assert.ok(fit.bounds.top >= 23.999 && fit.bounds.bottom <= fit.sceneHeight - 23.999);
    assert.equal(fit.mina.width, 8 * fit.scale);
    assert.equal(fit.mina.height, 18 * fit.scale);
    assert.ok(Math.abs(fit.mina.y + fit.mina.height / 2 - fit.sceneHeight / 2) < 1e-9);
    assert.ok(fit.bounds.left >= fit.mina.x + fit.mina.width + 15.999);
  }
});

test("material conversion outlines its square reach without depicting an empty hole", () => {
  const result = {status: "converts", method: "conversion", radius: 20, reachOnly: true,
    reason: "This changes the material to soil.", conversion: {toMaterial: "soil", shape: "square", minRadius: 4, stepsPerFrame: 2}};
  const output = String(render({name: "Conversion"}, {name: "Rock"}, result, 800, true));
  const elements = [...nodes(parseFragment(output))];
  const terrainMask = elements.find((node) => node.tagName === "mask");
  assert.ok(!terrainMask.childNodes.some((node) => ["circle", "path"].includes(node.tagName)));
  const outline = elements.find((node) => attrs(node).class === "digging-conversion-outline");
  assert.equal(attrs(outline).fill, "none");
  assert.equal(attrs(outline).stroke, "#fff");
  assert.equal(Number(attrs(outline).width), 40 * getDiggingViewport(20, 800, true).scale, "radius is the square's half-width");
  assert.match(output, /Converts material/);
  assert.match(output, /Square conversion area/);
  const details = String(renderDiggingResult({}, {}, result));
  assert.match(details, /Converts to/);
  assert.match(details, /soil/);
  assert.match(details, /Square half-width/);
});

test("conditional child effects keep reach visible and explain their trigger", () => {
  const result = {status: "conditional", method: "indirect", radius: 30, reachOnly: true,
    reason: "A separate projectile must trigger this effect.", indirect: {context: "Requires another spell.",
      children: [{name: "Bomb", trigger: "On death", afterFrames: 60, countMin: 1, countMax: 2,
        result: {status: "digs", reason: "The child explosion can dig this terrain."}}]}};
  const output = String(render({name: "Bomb emitter"}, {name: "Soil"}, result, 800, false));
  const circles = [...nodes(parseFragment(output))].filter((node) => node.tagName === "circle");
  assert.equal(circles.length, 1, "only the reach outline is drawn");
  assert.equal(attrs(circles[0]).fill, "none");
  assert.match(output, /Conditional effect/);
  const details = String(renderDiggingResult({}, {}, result));
  assert.match(details, /Bomb/);
  assert.match(details, /On death/);
  assert.match(details, /After 60 frames/);
  assert.match(details, /1–2 spawned/);
});

test("Nuke and Giga Nuke use one labeled circular estimate with a transparent cutout", () => {
  for (const [radius, rayEnergy, hardness] of [[250, 6700000, 100000], [400, 9700000, 1000000], [400, 9700000, 2000]]) {
    const footprint = evaluateExplosionFootprint({radius, rayEnergy, hardness, durability: 10, maxDurability: 14});
    const result = {status: "digs", method: "explosion", radius: footprint.radius, footprint};
    const output = String(render({name: "Nuke", radius}, {name: "Rock"}, result, 1000, true));
    const elements = [...nodes(parseFragment(output))];
    const circles = elements.filter((node) => node.tagName === "circle");
    assert.equal(circles.length, 2, "one circular mask and one matching outline");
    assert.equal(attrs(circles[0]).fill, "#000");
    assert.equal(attrs(circles[1]).fill, "none");
    assert.equal(attrs(circles[0]).r, attrs(circles[1]).r);
    assert.doesNotMatch(output, /digging-explosion-extent|digging-explosion-outline|stroke-dasharray/);
    assert.match(output, /Circular estimate/);
    const details = String(renderDiggingResult({radius}, {}, result));
    assert.match(details, /Estimated hole radius/);
  }
});

test("the explicit model radius range is shown when preview rows are omitted", () => {
  const details = String(renderDiggingResult({radius: 250}, {}, {
    status: "digs", method: "explosion", radius: 95.01, radiusRange: [66.25, 95.01],
  }));
  assert.match(details, /Hole radius range/);
  assert.match(details, /66\.25–95\.01 px/);
});
