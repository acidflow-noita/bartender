// ============================================================================
// GRID SNAP - Lattices graph nodes can be snapped to (see CONFIG.graph.snapGrids)
// ============================================================================
// A grid is a lattice of points: column i, row j sit at (i * dx + offset, j * dy), where odd rows
// are shifted by dx / 2 on staggered grids (the hexagonal one). Rectangular grids are wider than
// tall because node labels are wider than nodes. Pure functions, no DOM: the renderer decides
// when to snap, this module only decides where.

import { CONFIG } from "../config/config.js";

const STORAGE_KEY = "noitalambic.graph.snapGrid";
const SCALE_STORAGE_KEY = "noitalambic.graph.snapGridScale";
const ENABLED_STORAGE_KEY = "noitalambic.graph.snapGridEnabled";

// Grid size, as a percentage of the configured spacing (CONFIG.graph.snapGrids): 100 = as configured.
export const SNAP_SCALE = { min: 5, max: 100, step: 5, default: 100 };

// Grid kinds. Whether snapping is on at all is a separate switch (loadSnapEnabled).
export const SNAP_GRID_IDS = Object.keys(CONFIG.graph.snapGrids);

export function snapGridLabel(id) {
  return CONFIG.graph.snapGrids[id]?.label ?? id;
}

// null for an unknown id. scale is a percentage (SNAP_SCALE) applied to
// both spacings, so the grid keeps its shape.
export function getSnapGrid(id, scale = SNAP_SCALE.default) {
  const spec = CONFIG.graph.snapGrids[id];
  if (!spec) return null;
  const k = clampScale(scale) / 100;
  return makeGrid({ ...spec, dx: spec.dx * k, dy: spec.dy * k });
}

export function clampScale(scale) {
  const value = Number(scale);
  if (!Number.isFinite(value)) return SNAP_SCALE.default;
  return Math.min(SNAP_SCALE.max, Math.max(SNAP_SCALE.min, value));
}

export function makeGrid({ dx, dy, staggered = false }) {
  const offset = (j) => (staggered && Math.abs(j) % 2 === 1 ? dx / 2 : 0);
  const point = (i, j) => ({ x: i * dx + offset(j), y: j * dy });
  return {
    dx,
    dy,
    staggered,
    point,
    key: (i, j) => `${i},${j}`,
    // Closest lattice point to (x, y). On staggered grids the closest point can sit in the row
    // above or below the closest row, so the three nearest rows are compared.
    nearest(x, y) {
      const j0 = Math.round(y / dy);
      let best = null;
      for (let j = j0 - 1; j <= j0 + 1; j++) {
        const i = Math.round((x - offset(j)) / dx);
        const p = point(i, j);
        const d = (p.x - x) ** 2 + (p.y - y) ** 2;
        if (!best || d < best.d) best = { i, j, x: p.x, y: p.y, d };
      }
      return best;
    },
  };
}

// Closest lattice point to (x, y) whose key is not in `occupied`. Searches square rings of cells
// around the nearest point; the ring after the first hit is checked too, since on a staggered or
// non-square grid a cell of the next ring can still be closer.
export function nearestFreeCell(grid, x, y, occupied) {
  const { i: i0, j: j0 } = grid.nearest(x, y);
  let best = null;
  for (let r = 0, stopAt = Infinity; r <= stopAt && r < 1000; r++) {
    for (let j = j0 - r; j <= j0 + r; j++) {
      for (let i = i0 - r; i <= i0 + r; i++) {
        if (Math.max(Math.abs(i - i0), Math.abs(j - j0)) !== r) continue;
        if (occupied.has(grid.key(i, j))) continue;
        const p = grid.point(i, j);
        const d = (p.x - x) ** 2 + (p.y - y) ** 2;
        if (!best || d < best.d) best = { i, j, x: p.x, y: p.y, d };
      }
    }
    if (best && stopAt === Infinity) stopAt = r + 1;
  }
  return best;
}

// Assigns every node a distinct lattice point near its current position and returns
// Map(node -> {x, y}). Nodes listed in `keep` hold the cell they already sit on (if free);
// everyone else is placed best-connected first, so hubs get the cell closest to where the
// layout put them and leaves settle around them.
export function snapAll(nodes, grid, { keep = new Set() } = {}) {
  const occupied = new Set();
  const targets = new Map();
  nodes.forEach((node) => {
    if (!keep.has(node)) return;
    const cell = grid.nearest(node.x, node.y);
    const key = grid.key(cell.i, cell.j);
    if (occupied.has(key)) return;
    occupied.add(key);
    targets.set(node, { x: cell.x, y: cell.y });
  });
  nodes
    .filter((node) => !targets.has(node))
    .sort((a, b) => (b.degree || 0) - (a.degree || 0))
    .forEach((node) => {
      const cell = nearestFreeCell(grid, node.x, node.y, occupied);
      occupied.add(grid.key(cell.i, cell.j));
      targets.set(node, { x: cell.x, y: cell.y });
    });
  return targets;
}

// Keys of the cells taken by `nodes` (pinned on the grid), skipping `except`.
export function occupiedCells(grid, nodes, except = null) {
  const occupied = new Set();
  nodes.forEach((node) => {
    if (node === except || node.fx == null) return;
    const cell = grid.nearest(node.fx, node.fy);
    occupied.add(grid.key(cell.i, cell.j));
  });
  return occupied;
}

// Smallest on-screen spacing (px) at which grid points are still drawn: below it, dots would merge
// into a flat tint (and their count explode when zoomed out on a fine grid), so the backdrop is
// left empty until the user zooms in. Snapping itself is unaffected.
export const MIN_DRAWN_SPACING = 3;

export function latticeTooDense(grid, k = 1) {
  return Math.min(grid.dx, grid.dy) * k < MIN_DRAWN_SPACING;
}

// Calls fn(screenX, screenY) for every lattice point visible in a width x height viewport, graph
// coordinates mapping to the screen as (x * k + tx, y * k + ty) - a d3 zoom transform. Uses the
// grid's own point() so what is drawn is exactly where nodes snap.
export function forEachLatticePointInView(grid, { x: tx = 0, y: ty = 0, k = 1 }, width, height, fn) {
  const x0 = -tx / k, x1 = (width - tx) / k;
  const y0 = -ty / k, y1 = (height - ty) / k;
  for (let j = Math.floor(y0 / grid.dy); j <= Math.ceil(y1 / grid.dy); j++) {
    const offset = grid.point(0, j).x;
    for (let i = Math.floor((x0 - offset) / grid.dx); i <= Math.ceil((x1 - offset) / grid.dx); i++) {
      const p = grid.point(i, j);
      fn(p.x * k + tx, p.y * k + ty);
    }
  }
}

export function loadSnapGridId(storage = defaultStorage()) {
  try {
    const id = storage?.getItem(STORAGE_KEY);
    if (id && SNAP_GRID_IDS.includes(id)) return id;
  } catch {/* storage unavailable: fall back to the first grid */}
  return SNAP_GRID_IDS[0];
}

// Off by default. Before the switch existed, the grid id itself said "off" or which grid was
// on: a stored grid other than "off" means snapping was on.
export function loadSnapEnabled(storage = defaultStorage()) {
  try {
    const enabled = storage?.getItem(ENABLED_STORAGE_KEY);
    if (enabled != null) return enabled === "true";
    const legacy = storage?.getItem(STORAGE_KEY);
    return !!legacy && legacy !== "off" && SNAP_GRID_IDS.includes(legacy);
  } catch {
    return false;
  }
}

export function saveSnapEnabled(enabled, storage = defaultStorage()) {
  try {
    storage?.setItem(ENABLED_STORAGE_KEY, String(!!enabled));
  } catch {/* only loses the preference */}
}

export function saveSnapGridId(id, storage = defaultStorage()) {
  try {
    storage?.setItem(STORAGE_KEY, id);
  } catch {/* only loses the preference */}
}

export function loadSnapScale(storage = defaultStorage()) {
  try {
    const raw = storage?.getItem(SCALE_STORAGE_KEY);
    if (raw != null) return clampScale(raw);
  } catch {/* storage unavailable: fall back to the default */}
  return SNAP_SCALE.default;
}

export function saveSnapScale(scale, storage = defaultStorage()) {
  try {
    storage?.setItem(SCALE_STORAGE_KEY, String(clampScale(scale)));
  } catch {/* only loses the preference */}
}

function defaultStorage() {
  return typeof window !== "undefined" ? window.localStorage ?? null : null;
}
