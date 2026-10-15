import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {parseFragment} from "parse5";
import {evaluateDigging, getBaseRadius, getDiggingViewport} from "../src/digging/model.js";
import {getPathGeometry, getExplosionGeometry} from "../src/digging/geometry.js";
import {evaluateExplosionFootprint} from "../src/digging/explosion.js";

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
const {renderDiggingPlot: render, renderDiggingResult} = runInNewContext(`${source}\n({renderDiggingPlot, renderDiggingResult});`, {
  html: markup, svg: markup, getBaseRadius, getDiggingViewport, getPathGeometry, getExplosionGeometry,
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

test("traveling cell eaters sweep a curved path, with only the optional longer extent dashed", () => {
  const result = pathResult({points: [[0, 0], [30, 4], [60, 16]], maxPoints: [[0, 0], [30, 4], [60, 16], [90, 36]],
    width: 24, lengthMin: 62, lengthMax: 98});
  const geometry = getPathGeometry(result.footprint, 1000, false);
  const output = String(render({name: "Black Hole"}, {name: "Brickwork"}, result, 1000, false));
  const elements = [...nodes(parseFragment(output))];
  const hole = elements.find((node) => attrs(node).class === "digging-path-cutout");
  const extension = elements.find((node) => attrs(node).class === "digging-path-extent");
  assert.equal(attrs(hole).d, geometry.path);
  assert.equal(attrs(hole)["stroke-width"], "144");
  assert.equal(attrs(extension).d, geometry.maxPath);
  assert.equal(attrs(extension).stroke, "#fff");
  assert.ok(attrs(extension)["stroke-dasharray"]);
  const terrainMask = elements.find((node) => node.tagName === "mask" && attrs(node).id.endsWith("-terrain-mask"));
  assert.equal(terrainMask.childNodes.filter((node) => node.tagName === "path").length, 1,
    "the possible longer path is not presented as already excavated");
  assert.match(output, /dashed outline shows the longer possible path/);
  const details = String(renderDiggingResult({name: "Black Hole"}, {name: "Brickwork"}, result));
  assert.match(details, /62–98 px/);
  assert.match(details, /Path width/);
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

test("Fit includes the whole swept path, possible extension and endpoint blast at responsive sizes", () => {
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
    assert.ok(Math.abs(fit.mina.y + fit.mina.height - (fit.sceneHeight - 12)) < 1e-9);
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
  assert.equal(Number(attrs(outline).width), 240, "radius is the square's half-width");
  assert.match(output, /Converts material/);
  assert.match(output, /square conversion area/);
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

test("native explosion bounds use a continuous outer contour and transparent raster cutout", () => {
  const footprint = evaluateExplosionFootprint({radius: 250, rayEnergy: 6700000, hardness: 100000, durability: 10, maxDurability: 12});
  const result = {status: "digs", method: "explosion", radius: footprint.radiusMax, footprint};
  const output = String(render({name: "Nuke", radius: 250}, {name: "Rock"}, result, 1000, true));
  const elements = [...nodes(parseFragment(output))];
  const cutout = elements.find((node) => attrs(node).class === "digging-explosion-cutout");
  const outline = elements.find((node) => attrs(node).class === "digging-explosion-outline");
  const possible = elements.find((node) => attrs(node).class === "digging-explosion-extent");
  assert.equal(attrs(cutout).fill, "#000");
  assert.equal(attrs(cutout).d, attrs(outline).d);
  assert.equal(attrs(outline).fill, "none");
  assert.equal(attrs(outline).stroke, "#fff");
  assert.ok(attrs(possible)["stroke-dasharray"]);
  assert.ok(!elements.some((node) => node.tagName === "circle"), "360-ray bounds must not fall back to one invented circle");
  assert.match(output, /centered explosion in fresh uniform terrain/);
  const details = String(renderDiggingResult({radius: 250}, {}, result));
  assert.match(details, /Hole radius range/);
  assert.match(details, /66\.25–95\.01 px/);
});

test("the explicit model radius range is shown when preview rows are omitted", () => {
  const details = String(renderDiggingResult({radius: 250}, {}, {
    status: "digs", method: "explosion", radius: 95.01, radiusRange: [66.25, 95.01],
  }));
  assert.match(details, /Hole radius range/);
  assert.match(details, /66\.25–95\.01 px/);
});
