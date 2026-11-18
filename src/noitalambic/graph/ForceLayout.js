// ============================================================================
// FORCE LAYOUT - Force presets, the untangle -> compact phases, re-layouts, settling time
// ============================================================================
// The simulation's forces come from the active preset (CONFIG.graph.forcePresets); a fresh layout
// untangles first, then compacts. Settling time 0, or pause, means the simulation never runs.
// Part of GraphRenderer, which owns the SVG and the simulation: reached through this.r.

import * as d3 from "d3";
import { CONFIG } from "../config/config.js";
import { getForcePreset, loadForcePresetId, saveForcePresetId, alphaDecayFor, clampSettleSeconds, loadSettleSeconds, saveSettleSeconds } from "./forcePresets.js";

export class ForceLayout {
  constructor(renderer) {
    this.r = renderer;
    this.presetId = loadForcePresetId();
    this.settleSeconds = loadSettleSeconds();
    this.paused = false; // the Layout section's play/pause; not saved, a reload plays again
    this.checkPhase = () => {}; // armed by applyPreset()
  }

  create(visibleNodes, visibleLinks, width, height) {
    const fresh = visibleNodes.filter((node) => !Number.isFinite(node.x));
    const simulation = d3
      .forceSimulation(visibleNodes)
      .force("link", d3.forceLink(visibleLinks).id((d) => d.id))
      .force("charge", d3.forceManyBody())
      .force("collision", d3.forceCollide());
    this.applyPreset(simulation, width, height);
    if (this.noSettling()) {
      simulation.stop();
      this.centerFreshNodes(fresh, width, height);
    }
    return simulation;
  }

  // Paused, or settling time 0: the simulation never runs (see SETTLE_SECONDS) - nothing moves on
  // its own, drags move nodes by hand, a grid applies straight away.
  noSettling() {
    return this.paused || this.settleSeconds === 0;
  }

  // Play/pause. Pausing freezes every node where it is; playing lets the layout balance itself
  // again from there (the chosen settling time is kept either way).
  setPaused(paused) {
    const wasFrozen = this.noSettling();
    this.paused = !!paused;
    const simulation = this.r._simulation;
    if (!simulation) return;
    if (this.noSettling()) {
      simulation.alphaTarget(0);
      simulation.stop();
    } else if (wasFrozen) {
      this.relayout(0.5);
    }
  }

  // d3 seeds unpositioned nodes on a spiral around the origin (the top-left corner) and relies on
  // the simulation to bring them in; with no settling, put that spiral in the middle of the view.
  centerFreshNodes(nodes, width, height) {
    nodes.forEach((node) => {
      node.x += width / 2;
      node.y += height / 2;
    });
  }

  // Wakes the simulation up to `alpha` - unless there is no settling, then only repaints.
  reheat(alpha) {
    const simulation = this.r._simulation;
    if (!simulation) return;
    if (this.noSettling()) {
      simulation.stop();
      this.r._onTick();
      return;
    }
    simulation.alpha(Math.max(simulation.alpha(), alpha)).restart();
  }

  // Configures every force from the active preset (CONFIG.graph.forcePresets) and arms the
  // untangle -> compact phase switch. Only a fresh layout (initial render, preset change)
  // untangles; later reheats (incremental updates, drag, resize) keep the compact repulsion so
  // existing nodes don't get blown apart again.
  applyPreset(simulation, width, height) {
    const f = getForcePreset(this.presetId);
    const link = simulation.force("link").distance(f.linkDistance);
    // A null strength keeps d3's default: 1 / degree of the less connected end.
    link.strength((l) => {
      const strength = l.type === "tag-association" ? f.tagLinkStrength : f.linkStrength;
      return strength ?? 1 / Math.min(l.source.degree || 1, l.target.degree || 1);
    });
    const charge = (base) => (d) => base * (1 + (f.degreeCharge || 0) * (Math.sqrt(d.degree || 1) - 1));
    simulation.force("charge").strength(charge(f.untangleCharge)).distanceMax(f.chargeDistanceMax);
    simulation.force("collision").radius((d) => d.radius + f.collisionPadding);
    simulation.alphaDecay(alphaDecayFor(this.settleSeconds));
    this.setCenterForces(simulation, width, height);

    // Kept as a method (not only a tick listener) because relayout() ticks by hand, and manual
    // simulation.tick() calls dispatch no "tick" event.
    let compact = !(f.compactAlpha > 0);
    if (compact) simulation.force("charge").strength(charge(f.compactCharge));
    this.checkPhase = () => {
      if (compact || simulation.alpha() >= f.compactAlpha) return;
      compact = true;
      simulation.force("charge").strength(charge(f.compactCharge));
    };
    simulation.on("tick.phase", () => this.checkPhase());
    if (simulation === this.r._simulation) this.r.grid.configureForce();
  }

  // Reheats the layout to `alpha`. With a grid, nodes end up on it anyway, so watching them
  // settle frame by frame is only a wait: the settling is computed at once (no frames drawn) and
  // nodes glide straight from where they are to their cell.
  relayout(alpha) {
    const simulation = this.r._simulation;
    if (this.noSettling()) {
      simulation.stop();
      if (this.r.grid.current()) this.r.grid.snapToGrid();
      else this.r._onTick();
      return;
    }
    simulation.alpha(alpha);
    if (!this.r.grid.current()) {
      simulation.restart();
      return;
    }
    simulation.stop();
    const starts = new Map(simulation.nodes().map((node) => [node, { x: node.x, y: node.y }]));
    for (let i = 0; i < 1000 && simulation.alpha() >= CONFIG.graph.snapAlpha; i++) {
      simulation.tick();
      this.checkPhase();
    }
    this.r.grid.snapToGrid(starts);
  }

  // Changes how long layouts take to settle (seconds, see SETTLE_SECONDS). Applies to the layout
  // in progress right away, and to every later one.
  setSettleSeconds(seconds) {
    const wasStatic = this.noSettling();
    this.settleSeconds = clampSettleSeconds(seconds);
    saveSettleSeconds(this.settleSeconds);
    if (!this.r._simulation) return;
    this.r._simulation.alphaDecay(alphaDecayFor(this.settleSeconds));
    if (this.noSettling()) this.r._simulation.stop();
    else if (wasStatic) this.relayout(0.5); // settling back on: let the layout balance itself
  }

  // Switches the force preset and lays the current graph out again with it.
  setPreset(id) {
    this.presetId = id;
    saveForcePresetId(id);
    if (!this.r._simulation || !this.r._svg) return;
    this.r.grid.stopAnimation();
    this.r.pins.releaseUnpinned(this.r._simulation.nodes());
    this.applyPreset(this.r._simulation, Number(this.r._svg.attr("width")), Number(this.r._svg.attr("height")));
    this.relayout(1);
  }

  // forceCenter only translates the whole graph; the weak forceX/forceY gravity is what keeps
  // disconnected components from drifting apart.
  setCenterForces(simulation, width, height) {
    const g = getForcePreset(this.presetId).gravity;
    simulation
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("x", d3.forceX(width / 2).strength(g))
      .force("y", d3.forceY(height / 2).strength(g));
  }
}
