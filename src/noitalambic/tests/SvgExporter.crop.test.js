// circularCrop(): which part of a material texture a node's circular clip shows, so the export
// can ship just that disc (viewers that ignore clip-path would otherwise show whole textures).

import test from "node:test";
import assert from "node:assert/strict";

import { circularCrop } from "../graph/SvgExporter.js";

test("a 252px texture centered on a 25px-radius node: the middle 50px are read, filling the node's box", () => {
  const crop = circularCrop({ x: -126, y: -126, width: 252, height: 252 }, { cx: 0, cy: 0, r: 25 }, 252);
  assert.deepEqual(crop, { sx: 101, sy: 101, size: 50, box: { x: -25, y: -25, width: 50, height: 50 } });
});

test("a texture drawn zoomed in (2x) reads half as many texture pixels", () => {
  const crop = circularCrop({ x: -252, y: -252, width: 504, height: 504 }, { cx: 0, cy: 0, r: 25 }, 252);
  assert.deepEqual([crop.sx, crop.sy, crop.size], [113.5, 113.5, 25]);
});

test("no crop when the circle is not entirely over the image, or sizes are missing", () => {
  assert.equal(circularCrop({ x: -10, y: -10, width: 20, height: 20 }, { cx: 0, cy: 0, r: 25 }, 252), null);
  assert.equal(circularCrop({ x: 0, y: 0, width: 0, height: 0 }, { cx: 0, cy: 0, r: 25 }, 252), null);
  assert.equal(circularCrop({ x: -126, y: -126, width: 252, height: 252 }, { cx: 0, cy: 0, r: 25 }, 0), null);
});
