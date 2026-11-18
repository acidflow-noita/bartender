// The graph palette must stay readable for everyone (see the comment on CONFIG.graph.colors:
// pairs were checked with the dataviz CVD validator). Guards the cheap part:
// contrast against the background, and the pairs that must differ actually differ.

import test from "node:test";
import assert from "node:assert/strict";

import { CONFIG } from "../config/config.js";

const SURFACE = "#0f172b";
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

test("arrows, nodes and highlights stand out from the navy background (>= 6:1)", () => {
  const c = CONFIG.graph.colors;
  for (const role of ["inputArrow", "outputArrow", "reactionNode", "tagNode", "tagVisible", "selectedHighlight", "directMaterialHighlight"]) {
    assert.ok(contrast(c[role], SURFACE) >= 6, `${role} ${c[role]}: ${contrast(c[role], SURFACE).toFixed(2)}:1`);
  }
});

test("pairs that must be told apart use different colors; tag links stay neutral", () => {
  const c = CONFIG.graph.colors;
  assert.notEqual(c.inputArrow, c.outputArrow);
  assert.notEqual(c.reactionNode, c.tagNode);
  assert.notEqual(c.tagVisible, c.tagHidden);
  assert.ok(![c.inputArrow, c.outputArrow].includes(c.tagAssociation));
  assert.equal(c.inputHighlight, c.inputArrow);
  assert.equal(c.outputHighlight, c.outputArrow);
});
