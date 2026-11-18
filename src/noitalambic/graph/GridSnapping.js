// ============================================================================
// GRID SNAPPING - Nodes on a lattice: on/off, kind, size, snapping, grid force, backdrop
// ============================================================================
// Where nodes snap is decided by gridSnap.js; this decides when (layout settled, grid changed,
// node dropped), animates it, keeps a grid force pulling free nodes toward their cell, and draws
// the lattice behind the graph.
// Part of GraphRenderer, which owns the SVG and the simulation: reached through this.r.

import * as d3 from "d3";
import { CONFIG } from "../config/config.js";
import { getSnapGrid, loadSnapGridId, saveSnapGridId, loadSnapEnabled, saveSnapEnabled, loadSnapScale, saveSnapScale, clampScale, snapAll, forEachLatticePointInView, latticeTooDense } from "./gridSnap.js";

export class GridSnapping {
  constructor(renderer) {
    this.r = renderer;
    this.kind = loadSnapGridId();
    this.enabled = loadSnapEnabled();
    this.scale = loadSnapScale();
    this.canvas = null; // backdrop, see attachCanvas()
    this._context = undefined; // its 2D context, fetched on first draw
    this._timer = null; // snap animation
    this._frame = null; // pending backdrop redraw
  }

  // Switches the grid kind (a CONFIG.graph.snapGrids id); applied right away if snapping is on.
  setKind(id) {
    this.kind = id;
    saveSnapGridId(id);
    this.applyChange();
  }

  // Grid snapping on/off (the grid kind is kept either way).
  setEnabled(enabled) {
    this.enabled = !!enabled;
    saveSnapEnabled(this.enabled);
    this.applyChange();
  }

  // Snapping on (or a different grid): snap the current positions right away. Off: release every
  // node (but those pinned on purpose) to the simulation again.
  applyChange() {
    this.draw();
    if (!this.r._simulation) return;
    this.stopAnimation();
    this.r.pins.releaseUnpinned(this.r._simulation.nodes());
    this.configureForce();
    if (this.current()) this.snapToGrid();
    else this.r.layout.reheat(0.3);
  }

  // Grid force: pulls each free node toward its own cell, so the layout settles onto the grid
  // while gravity and links keep acting (a grid with no physics at all = settling time 0). Cells are re-assigned every few ticks from
  // current positions (one node per cell; pinned nodes hold theirs).
  configureForce() {
    if (!this.r._simulation) return;
    const grid = this.current();
    if (!grid) {
      this.r._simulation.force("grid", null);
      return;
    }
    const strength = CONFIG.graph.snapPhysicsStrength;
    let nodes = [];
    let targets = null;
    let ticks = 0;
    const force = (alpha) => {
      if (!targets || ticks++ % 10 === 0) {
        targets = snapAll(nodes, grid, { keep: new Set(nodes.filter((node) => node.fx != null)) });
      }
      targets.forEach((target, node) => {
        if (node.fx != null) return;
        node.vx += (target.x - node.x) * strength * alpha;
        node.vy += (target.y - node.y) * strength * alpha;
      });
    };
    force.initialize = (simulationNodes) => {
      nodes = simulationNodes;
      targets = null;
    };
    this.r._simulation.force("grid", force);
  }

  // Changes the grid size (percentage of the configured spacing, see SNAP_SCALE) and re-snaps
  // every node onto the resized grid from where it is now.
  setScale(scale) {
    this.scale = clampScale(scale);
    saveSnapScale(this.scale);
    this.draw();
    this.configureForce();
    if (!this.r._simulation || !this.current()) return;
    this.stopAnimation();
    this.r.pins.releaseUnpinned(this.r._simulation.nodes());
    this.snapToGrid();
  }

  current() {
    return this.enabled ? getSnapGrid(this.kind, this.scale) : null;
  }

  // Moves every node to its own grid cell, animated (from `starts`, or where nodes are now), and
  // leaves it free: gravity and links act again on the next reheat, the grid force keeping it
  // near its cell. Nodes pinned on purpose keep their cell (the closest one) and stay pinned.
  snapToGrid(starts = null) {
    const grid = this.current();
    if (!grid || !this.r._simulation) return;
    this.stopAnimation();
    this.setSuspended(false);
    const nodes = this.r._simulation.nodes();
    const keep = new Set(nodes.filter((node) => node.fx != null));
    const targets = snapAll(nodes, grid, { keep });
    starts ??= new Map(nodes.map((node) => [node, { x: node.x, y: node.y }]));
    targets.forEach((target, node) => {
      node.vx = 0;
      node.vy = 0;
      if (node.fx != null) {
        node.fx = target.x;
        node.fy = target.y;
      }
    });
    const duration = CONFIG.graph.snapAnimationMs;
    const step = (t) => {
      targets.forEach((target, node) => {
        const start = starts.get(node);
        // Exact target at the end: start + (target - start) * 1 can be off by a rounding error.
        node.x = t === 1 ? target.x : start.x + (target.x - start.x) * t;
        node.y = t === 1 ? target.y : start.y + (target.y - start.y) * t;
      });
      this.r._onTick();
    };
    if (!(duration > 0)) return step(1);
    this._timer = d3.timer((elapsed) => {
      const t = Math.min(1, elapsed / duration);
      step(d3.easeCubicOut(t));
      if (t === 1) this.stopAnimation();
    });
  }

  stopAnimation() {
    this._timer?.stop();
    this._timer = null;
  }

  // Dims the grid backdrop while a layout runs with snapping suspended.
  setSuspended(suspended) {
    if (this.canvas) this.canvas.style.opacity = suspended ? "0.35" : "";
  }

  // Zoom/pan fire many events per frame: draw at most once per frame.
  scheduleDraw() {
    if (typeof window.requestAnimationFrame !== "function") return this.draw();
    if (this._frame) return;
    this._frame = window.requestAnimationFrame(() => {
      this._frame = null;
      this.draw();
    });
  }

  // The backdrop canvas, created with each SVG (it sits right under it).
  attachCanvas(canvas) {
    this.canvas = canvas;
    this._context = undefined; // fetched on first draw, per canvas
  }

  // Draws every lattice point in view (see forEachLatticePointInView), or nothing when snapping
  // is off or the points would be too dense on screen to tell apart (latticeTooDense).
  draw() {
    const canvas = this.canvas;
    if (!canvas || !this.r._svg) return;
    const grid = this.current();
    const width = Number(this.r._svg.attr("width")) || 0;
    const height = Number(this.r._svg.attr("height")) || 0;
    const ratio = window.devicePixelRatio || 1;
    canvas.style.display = grid ? "" : "none";
    if (!grid) return;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    // No 2D canvas support (e.g. jsdom in tests): snapping still works, only the backdrop is skipped.
    if (this._context === undefined) {
      this._context = typeof window.CanvasRenderingContext2D === "function" ? canvas.getContext("2d") : null;
    }
    const context = this._context;
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    const transform = this.r._zoomTransform ?? d3.zoomIdentity;
    if (latticeTooDense(grid, transform.k)) return;
    const spacing = Math.min(grid.dx, grid.dy) * transform.k;
    const size = Math.max(1, Math.min(3, spacing * 0.12));
    context.fillStyle = spacing < 8 ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.22)";
    forEachLatticePointInView(grid, transform, width, height, (x, y) => context.fillRect(x - size / 2, y - size / 2, size, size));
  }
}
