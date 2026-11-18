// Colors written into exported files must be plain sRGB: the theme's oklch()/color-mix() colors
// come back unchanged from getComputedStyle, and many SVG renderers draw them as black.

import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
global.window = dom.window;
global.document = dom.window.document;

// Fake 2D context: the "painted pixel" is the sRGB value registered for the last fillStyle.
const painted = { "oklch(20.8% 0.042 265.755)": [15, 23, 43, 255], "color-mix(in oklch, red 50%, transparent)": [255, 0, 0, 128] };
let fillStyle = "#000";
dom.window.HTMLCanvasElement.prototype.getContext = function () {
  return {
    canvas: this,
    set fillStyle(value) {
      if (value in painted || value === "#000") fillStyle = value; // invalid colors are ignored, like a real canvas
    },
    get fillStyle() {
      return fillStyle;
    },
    clearRect() {},
    fillRect() {},
    getImageData: () => ({ data: painted[fillStyle] ?? [0, 0, 0, 255] }),
  };
};

const { parseColor, toSrgb, composite, formatColor } = await import("../ui/cssColor.js");
const { UIHelper } = await import("../ui/UIHelper.js");

test("rgb()/rgba() strings are parsed without touching the canvas", () => {
  assert.deepEqual(parseColor("rgb(1, 2, 3)"), { r: 1, g: 2, b: 3, a: 1 });
  assert.deepEqual(parseColor("rgba(1, 2, 3, 0.5)"), { r: 1, g: 2, b: 3, a: 0.5 });
  assert.deepEqual(parseColor("rgb(1 2 3 / 25%)"), { r: 1, g: 2, b: 3, a: 0.25 });
  assert.deepEqual(parseColor("transparent"), { r: 0, g: 0, b: 0, a: 0 });
});

test("oklch() and color-mix() are converted to sRGB through the canvas", () => {
  assert.equal(toSrgb("oklch(20.8% 0.042 265.755)"), "rgb(15, 23, 43)");
  assert.equal(toSrgb("color-mix(in oklch, red 50%, transparent)"), "rgba(255, 0, 0, 0.502)");
});

test("composite blends a translucent color over an opaque one", () => {
  assert.equal(formatColor(composite({ r: 255, g: 255, b: 255, a: 0.5 }, { r: 0, g: 0, b: 0, a: 1 })), "rgb(128, 128, 128)");
});

test("backgroundColorOf converts the theme color and composites translucent layers over their parent", () => {
  document.body.innerHTML = `
    <div id="card" style="background-color: oklch(20.8% 0.042 265.755)">
      <div id="tint" style="background-color: rgba(255, 255, 255, 0.5)">
        <div id="graph"><svg id="svg"></svg></div>
      </div>
    </div>`;
  // jsdom keeps unknown color syntaxes out of the computed style: provide them explicitly.
  const getComputedStyle = window.getComputedStyle.bind(window);
  window.getComputedStyle = (el) =>
    el.id === "card" ? { backgroundColor: "oklch(20.8% 0.042 265.755)" } : getComputedStyle(el);

  assert.equal(UIHelper.backgroundColorOf(document.getElementById("card")), "rgb(15, 23, 43)");
  // (255 * 0.5 + 15 * 0.5, 255 * 0.5 + 23 * 0.5, 255 * 0.5 + 43 * 0.5)
  assert.equal(UIHelper.backgroundColorOf(document.getElementById("svg")), "rgb(135, 139, 149)");
  window.getComputedStyle = getComputedStyle;
});

test("with no background anywhere, the result is white", () => {
  document.body.innerHTML = `<div id="bare"></div>`;
  assert.equal(UIHelper.backgroundColorOf(document.getElementById("bare")), "rgb(255, 255, 255)");
});
