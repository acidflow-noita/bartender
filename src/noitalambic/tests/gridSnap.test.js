import test from "node:test";
import assert from "node:assert/strict";

import { makeGrid, nearestFreeCell, snapAll, occupiedCells, getSnapGrid, SNAP_GRID_IDS, forEachLatticePointInView, latticeTooDense } from "../graph/gridSnap.js";

test("square and rectangular grids round to the closest lattice point", () => {
  const rect = makeGrid({ dx: 100, dy: 50 });
  assert.deepEqual([rect.nearest(149, 74).x, rect.nearest(149, 74).y], [100, 50]);
  assert.deepEqual([rect.nearest(151, 76).x, rect.nearest(151, 76).y], [200, 100]);
  assert.deepEqual([rect.nearest(-60, -30).x, rect.nearest(-60, -30).y], [-100, -50]);
});

test("staggered grids shift odd rows by half a column, including negative rows", () => {
  const hex = makeGrid({ dx: 100, dy: 87, staggered: true });
  assert.deepEqual(hex.point(0, 1), { x: 50, y: 87 });
  assert.deepEqual(hex.point(0, -1), { x: 50, y: -87 });
  assert.deepEqual(hex.point(1, 2), { x: 100, y: 174 });
  // Closer to the offset point of the odd row than to any even-row point.
  const p = hex.nearest(50, 60);
  assert.deepEqual([p.x, p.y], [50, 87]);
});

test("nearestFreeCell skips taken cells and picks the closest free one", () => {
  const grid = makeGrid({ dx: 100, dy: 100 });
  const occupied = new Set([grid.key(0, 0)]);
  const cell = nearestFreeCell(grid, 10, 40, occupied);
  assert.deepEqual([cell.x, cell.y], [0, 100], "the cell below is closer than the one to the right");
});

test("snapAll gives every node its own cell, hubs first, and keeps pinned nodes in place", () => {
  const grid = makeGrid({ dx: 100, dy: 100 });
  const pinned = { id: "p", x: 0, y: 0, fx: 0, fy: 0 };
  const hub = { id: "hub", x: 5, y: 5, degree: 9 };
  const leaf = { id: "leaf", x: 3, y: 3, degree: 1 };
  const targets = snapAll([leaf, hub, pinned], grid, { keep: new Set([pinned]) });
  assert.deepEqual(targets.get(pinned), { x: 0, y: 0 });
  const cells = [...targets.values()].map(({ x, y }) => `${x},${y}`);
  assert.equal(new Set(cells).size, 3, "no two nodes share a cell");
  const dist = (n) => Math.hypot(targets.get(n).x - n.x, targets.get(n).y - n.y);
  assert.ok(dist(hub) <= dist(leaf), "the hub got the closer of the free cells");
});

test("occupiedCells lists pinned nodes' cells, except the given node", () => {
  const grid = makeGrid({ dx: 100, dy: 100 });
  const a = { fx: 100, fy: 0 }, b = { fx: 0, fy: 100 }, c = { fx: null, fy: null };
  assert.deepEqual([...occupiedCells(grid, [a, b, c], b)], ["1,0"]);
});

test("every configured grid is available; unknown ids mean no grid (on/off is a separate switch)", () => {
  assert.equal(getSnapGrid("nope"), null);
  assert.deepEqual(SNAP_GRID_IDS, ["square", "rectangular", "hexagonal"]);
  for (const id of SNAP_GRID_IDS) assert.ok(getSnapGrid(id));
});

test("snapping on/off is stored on its own; settings saved before the switch existed carry over", async () => {
  const { loadSnapEnabled, saveSnapEnabled, loadSnapGridId } = await import("../graph/gridSnap.js");
  const { InMemoryStorage } = await import("../core/ReactionSetManager.js");
  const storage = new InMemoryStorage();
  assert.equal(loadSnapEnabled(storage), false, "off by default");
  assert.equal(loadSnapGridId(storage), "square");

  storage.setItem("noitalambic.graph.snapGrid", "hexagonal"); // old format: a grid was on
  assert.equal(loadSnapEnabled(storage), true);
  assert.equal(loadSnapGridId(storage), "hexagonal");

  storage.setItem("noitalambic.graph.snapGrid", "off"); // old format: snapping was off
  assert.equal(loadSnapEnabled(storage), false);
  assert.equal(loadSnapGridId(storage), "square", "off is not a grid kind any more");

  saveSnapEnabled(true, storage);
  assert.equal(loadSnapEnabled(storage), true, "the switch wins once it was saved");
});

test("grid size scales both spacings (shape kept) and is clamped to its range", async () => {
  const { CONFIG } = await import("../config/config.js");
  const { SNAP_SCALE, clampScale } = await import("../graph/gridSnap.js");
  const spec = CONFIG.graph.snapGrids.rectangular;
  const half = getSnapGrid("rectangular", 50);
  assert.equal(half.dx, spec.dx * 0.5);
  assert.equal(half.dy, spec.dy * 0.5);
  assert.equal(getSnapGrid("rectangular").dx, spec.dx, "100% by default");
  assert.equal(clampScale(1), SNAP_SCALE.min);
  assert.deepEqual([SNAP_SCALE.min, SNAP_SCALE.max], [5, 100]);
  assert.equal(clampScale(999), SNAP_SCALE.max);
  assert.equal(clampScale("abc"), SNAP_SCALE.default);
});

test("the backdrop enumerates every lattice point in view, exactly where nodes snap (fine hex grid included)", () => {
  for (const scale of [100, 20, 5]) {
    const grid = getSnapGrid("hexagonal", scale);
    const transform = { x: 37.3, y: -12.9, k: 1.7 };
    const [width, height] = [400, 300];
    const points = [];
    forEachLatticePointInView(grid, transform, width, height, (x, y) => points.push([x, y]));
    // Every drawn point is a lattice point (back in graph space).
    for (const [sx, sy] of points) {
      const gx = (sx - transform.x) / transform.k, gy = (sy - transform.y) / transform.k;
      const cell = grid.nearest(gx, gy);
      assert.ok(Math.hypot(cell.x - gx, cell.y - gy) < 1e-6, `${scale}%: (${gx}, ${gy}) is a lattice point`);
    }
    // And every lattice point inside the viewport is drawn: none skipped.
    const isInside = ([x, y]) => x >= 0 && x <= width && y >= 0 && y <= height;
    const inside = points.filter(isInside).length;
    let expected = 0;
    for (let j = -150; j <= 150; j++) {
      for (let i = -150; i <= 150; i++) {
        const p = grid.point(i, j);
        if (isInside([p.x * transform.k + transform.x, p.y * transform.k + transform.y])) expected++;
      }
    }
    assert.equal(inside, expected, `${scale}%: every lattice point in view is drawn`);
    // Hexagonal: odd rows are shifted by half a column.
    const rows = new Map();
    for (const [sx, sy] of points) {
      const j = Math.round((sy - transform.y) / transform.k / grid.dy);
      const i = ((sx - transform.x) / transform.k) / grid.dx;
      rows.set(Math.abs(j) % 2, i - Math.floor(i));
    }
    assert.ok(Math.abs(rows.get(1) - 0.5) < 1e-6 && rows.get(0) < 1e-6);
  }
});

test("points too dense to tell apart on screen are not drawn (zoomed far out on a fine grid)", () => {
  const grid = getSnapGrid("square", 5);
  assert.equal(latticeTooDense(grid, 1), false, "5% at 100% zoom is still drawn");
  assert.equal(latticeTooDense(grid, 0.3), true);
});
