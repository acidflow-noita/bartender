// ============================================================================
// NODE SELECTION - Multi-selection with a rectangle drawn on the background
// ============================================================================
// Selected nodes (by id, so it survives re-renders) get a dashed ring and are dragged together.
// Part of GraphRenderer, which owns the SVG and the simulation: reached through this.r.

import * as d3 from "d3";
import { CONFIG } from "../config/config.js";

export class NodeSelection {
  constructor(renderer) {
    this.r = renderer;
    this.ids = new Set();
    this._keyHandler = null;
    this._suppressNextClick = false;
  }

  // Left-dragging the background draws a selection rectangle; on release the nodes inside become
  // the selection (Shift: added to it). A plain left click on the background (no drag) clears
  // it, as does Escape. Mouse events, so jsdom can drive it; touch keeps panning.
  setupRectangle(svg) {
    let start = null;
    let rect = null;
    const point = (event) => d3.pointer(event, svg.node());
    const move = (event) => {
      if (!start) return;
      const [x, y] = point(event);
      if (!rect && Math.hypot(x - start.x, y - start.y) < 4) return;
      rect ??= svg.append("rect").attr("class", "selection-rectangle")
        .attr("fill", "rgba(255,255,0,0.08)").attr("stroke", CONFIG.graph.colors.selectedHighlight)
        .attr("stroke-dasharray", "4,3").style("pointer-events", "none");
      rect.attr("x", Math.min(x, start.x)).attr("y", Math.min(y, start.y))
        .attr("width", Math.abs(x - start.x)).attr("height", Math.abs(y - start.y));
    };
    const up = (event) => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      if (!start) return;
      const [x, y] = point(event);
      const additive = start.additive;
      const dragged = !!rect;
      rect?.remove();
      rect = null;
      const box = { x0: Math.min(x, start.x), x1: Math.max(x, start.x), y0: Math.min(y, start.y), y1: Math.max(y, start.y) };
      start = null;
      if (!dragged) {
        if (!additive) this.clear();
        return;
      }
      // The click that follows this release must not also reset the highlight / selection.
      this._suppressNextClick = true;
      const t = this.r._zoomTransform ?? d3.zoomIdentity;
      const inside = (this.r._simulation?.nodes() ?? []).filter((node) => {
        const [sx, sy] = t.apply([node.x, node.y]);
        return sx >= box.x0 && sx <= box.x1 && sy >= box.y0 && sy <= box.y1;
      });
      this.set([...(additive ? this.ids : []), ...inside.map((node) => node.id)]);
    };
    svg.on("mousedown.select", (event) => {
      if (event.button !== 0 || event.target.closest?.(".node")) return;
      const [x, y] = point(event);
      start = { x, y, additive: event.shiftKey };
      event.preventDefault(); // no text selection while drawing
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    });
    svg.on("click.select", (event) => {
      if (!this._suppressNextClick) return;
      this._suppressNextClick = false;
      event.stopImmediatePropagation();
    }, true);
    this._keyHandler ??= (event) => {
      if (event.key === "Escape" && this.ids.size && !this.r.menu._active) this.clear();
    };
    document.removeEventListener("keydown", this._keyHandler);
    document.addEventListener("keydown", this._keyHandler);
  }

  set(ids) {
    const visible = new Set((this.r._simulation?.nodes() ?? []).map((node) => node.id));
    this.ids = new Set([...ids].filter((id) => visible.has(id)));
    this.refresh();
  }

  clear() {
    if (!this.ids.size) return;
    this.ids.clear();
    this.refresh();
  }

  nodes() {
    return (this.r._simulation?.nodes() ?? []).filter((node) => this.ids.has(node.id));
  }

  // Nodes moved together by dragging `node`: the whole selection if it is part of it, with each
  // node's offset from the dragged one.
  dragGroup(node) {
    const nodes = this.ids.has(node.id) ? this.nodes() : [node];
    return nodes.map((n) => ({ node: n, dx: n.x - node.x, dy: n.y - node.y }));
  }

  // Dashed ring on selected nodes; drops ids of nodes no longer shown.
  refresh() {
    if (!this.r._nodeSelection) return;
    const shown = new Set();
    this.r._nodeSelection.each((d, i, els) => {
      shown.add(d.id);
      const selection = d3.select(els[i]);
      const ring = selection.select(":scope > .selection-ring");
      const selected = this.ids.has(d.id);
      selection.classed("selected", selected);
      if (!selected) return ring.remove();
      if (!ring.empty()) return;
      selection.insert("circle", ":first-child").attr("class", "selection-ring").attr("r", d.radius + 9)
        .attr("fill", "none").attr("stroke", CONFIG.graph.colors.selectedHighlight).attr("stroke-width", 2)
        .attr("stroke-dasharray", "5,4").style("pointer-events", "none");
    });
    this.ids.forEach((id) => {
      if (!shown.has(id)) this.ids.delete(id);
    });
  }

  // Removes the document-level Escape listener (renderer teardown).
  detach() {
    if (this._keyHandler) document.removeEventListener("keydown", this._keyHandler);
  }
}
