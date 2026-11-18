// ============================================================================
// NODE PINNING - Nodes pinned on purpose: out of the physics' reach, still draggable
// ============================================================================
// A pinned node keeps node.pinned and fixed fx/fy across re-renders, re-layouts and grid changes.
// Part of GraphRenderer, which owns the SVG and the simulation: reached through this.r.

import * as d3 from "d3";
import { nearestFreeCell, occupiedCells } from "./gridSnap.js";

export class NodePinning {
  constructor(renderer) {
    this.r = renderer;
  }

  // Releases nodes to the simulation, except those pinned on purpose (node.pinned), which keep
  // their position (GridSnapping.snapToGrid() then moves them onto the closest cell of a new grid).
  releaseUnpinned(nodes) {
    nodes.forEach((node) => {
      if (node.pinned) return;
      node.fx = null;
      node.fy = null;
    });
  }

  setPinned(node, pinned) {
    const simulation = this.r._simulation;
    node.pinned = pinned;
    if (pinned) {
      const grid = this.r.grid.current();
      const cell = grid ? nearestFreeCell(grid, node.x, node.y, occupiedCells(grid, simulation.nodes(), node)) : node;
      node.x = node.fx = cell.x;
      node.y = node.fy = cell.y;
      node.vx = node.vy = 0;
      this.r._onTick();
    } else {
      node.fx = null;
      node.fy = null;
      this.r.layout.reheat(0.3);
    }
    this.refreshBadges();
  }

  // Small badge on nodes pinned on purpose.
  refreshBadges() {
    this.r._nodeSelection?.each((d, i, els) => {
      const selection = d3.select(els[i]);
      const badge = selection.select(":scope > .pin-badge");
      if (!d.pinned) return badge.remove();
      if (!badge.empty()) return;
      const offset = d.radius * 0.72;
      selection.append("circle").attr("class", "pin-badge").attr("cx", offset).attr("cy", -offset).attr("r", 5)
        .attr("fill", "#ffffff").attr("stroke", "#1b1b1f").attr("stroke-width", 2).style("pointer-events", "none");
    });
  }
}
