import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {parseFragment} from "parse5";
import {getBaseRadius, getDiggingViewport} from "../src/digging/model.js";

// Serialize the view's templates for HTML parsing in Node; no browser or DOM.
class Markup {
  constructor(value) { this.value = value; }
  toString() { return this.value; }
}
const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[c]);
const markup = (strings, ...values) => new Markup(strings.reduce((result, part, i) =>
  result + part + (i === values.length || values[i] == null ? ""
    : values[i] instanceof Markup ? values[i] : escape(values[i])), ""));
const source = readFileSync(new URL("../src/digging/view.js", import.meta.url), "utf8")
  .replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "");
const {renderDiggingPlot: render, renderDiggingResult} = runInNewContext(`${source}\n({renderDiggingPlot, renderDiggingResult});`, {
  html: markup, svg: markup, getBaseRadius, getDiggingViewport,
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
