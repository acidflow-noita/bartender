// ============================================================================
// GRAPH RENDERER - D3.js visualization of reactions graph
// ============================================================================
// Owns the SVG, the zoom and the force simulation: renders reactions into nodes and links
// (keyed joins, so updates keep what persists), paints positions on each tick, dispatches clicks
// to shortcut actions, and fits the view. Everything else lives in a controller of its own:
// ForceLayout, GridSnapping, NodeSelection, NodePinning, NodeContextMenu, NodeShapes and
// ConnectionHighlighter.

import * as d3 from "d3";
import { CONFIG } from "../config/config.js";
import { UIHelper } from "../ui/UIHelper.js";
import { allowGraphGesture } from "./viewport.js";
import { getSharedShortcutManager } from "../core/ShortcutManager.js";
import { getForcePreset } from "./forcePresets.js";
import { nearestFreeCell, occupiedCells } from "./gridSnap.js";
import { ForceLayout } from "./ForceLayout.js";
import { GridSnapping } from "./GridSnapping.js";
import { NodeSelection } from "./NodeSelection.js";
import { NodePinning } from "./NodePinning.js";
import { NodeContextMenu } from "./NodeContextMenu.js";
import { NodeShapes } from "./NodeShapes.js";
import { ConnectionHighlighter } from "./ConnectionHighlighter.js";

export class GraphRenderer {
  static DOUBLE_CLICK_DELAY = 300;

  // Node interactions go through a ShortcutManager (core/ShortcutManager.js); the app-wide one is
  // used when none is given. onQuickAddSet(materialId, role) enables the "add to a new set"
  // actions; without it those shortcuts do nothing (classic mode has no sets).
  constructor(dataRepo, state, graphDataBuilder, shortcutManager = null, onQuickAddSet = null) {
    this.dataRepo = dataRepo;
    this.state = state;
    this.graphDataBuilder = graphDataBuilder;
    this.shortcutManager = shortcutManager ?? getSharedShortcutManager();
    this.onQuickAddSet = onQuickAddSet;
    // onExcludeReactions(reactions) enables "Exclude" in reaction menus (advanced mode sets it).
    this.onExcludeReactions = null;
    // Each concern lives in its own controller (see their files), which reaches back here via its r.
    this.layout = new ForceLayout(this);
    this.grid = new GridSnapping(this);
    this.selection = new NodeSelection(this);
    this.pins = new NodePinning(this);
    this.menu = new NodeContextMenu(this);
    this.shapes = new NodeShapes(this);
    this.highlighter = new ConnectionHighlighter(this);
    this._pendingClick = null; // single-click action waiting to see if a double-click follows
    // Tag tooltips mention the menu shortcut: refresh them when it is rebound.
    this._unsubscribeShortcuts = this.shortcutManager.subscribe(() => this._nodeSelection?.filter((d) => d.type === "tag").each((d, i, els) => this.shapes.updateTag(d, d3.select(els[i]))));
    this.currentCleanup = null;

    // Persistent rendering state, kept alive across render() calls. Previously every render()
    // wiped the container and rebuilt the SVG/simulation from scratch, which made the whole
    // graph visibly "reload" (a fresh force-layout jump, and a reset zoom/pan) on every change,
    // even a trivial one like toggling a set's/group's "enabled" checkbox. Now, as long as the
    // same SVG is still mounted, render() reuses it: nodes/links that are still present just
    // keep their existing DOM element and simulated position (via D3's keyed .join()), and only
    // whatever actually entered or left the visible set is created or removed.
    this._svg = null;
    this._g = null;
    this._simulation = null;
    this._linkGroupSelection = null;
    this._nodeSelection = null;
    this._nodesById = new Map(); // id -> live simulation datum, carries x/y/vx/vy across renders
    this._resizeHandler = null;
  }

  // -------------------------------------------------------------------
  // Public settings API (the page's Layout section): delegates to the controllers
  // -------------------------------------------------------------------

  get forcePresetId() { return this.layout.presetId; }
  get settleSeconds() { return this.layout.settleSeconds; }
  get paused() { return this.layout.paused; }
  get snapGridId() { return this.grid.kind; }
  get snapEnabled() { return this.grid.enabled; }
  get snapScale() { return this.grid.scale; }

  setForcePreset(id) { this.layout.setPreset(id); }
  setSettleSeconds(seconds) { this.layout.setSettleSeconds(seconds); }
  setPaused(paused) { this.layout.setPaused(paused); }
  setSnapGrid(id) { this.grid.setKind(id); }
  setSnapEnabled(enabled) { this.grid.setEnabled(enabled); }
  setSnapScale(scale) { this.grid.setScale(scale); }
  setSelection(ids) { this.selection.set(ids); }
  selectedNodes() { return this.selection.nodes(); }
  // Runs fn() with the graph in its plain, un-highlighted look (exports), then restores it.
  withoutHighlight(fn) { return this.highlighter.without(fn); }

  render(filteredReactions) {
    const container = document.getElementById("graphContainer");

    if (filteredReactions.length === 0 || filteredReactions.length >= CONFIG.graph.constraints.maxReactions) {
      this._teardown(container);
      container.innerHTML =
        filteredReactions.length === 0
          ? `<div style="text-align: center; padding: 2rem; color: ${CONFIG.graph.colors.textLight};">No reactions found with current filters</div>`
          : `<div style="text-align: center; padding: 2rem; color: ${CONFIG.graph.colors.textLight};">Too many reactions with current filters</div>`;
      return;
    }

    const width = container.clientWidth;
    const height = Math.max(1, container.clientHeight);

    const { nodes, links } = this.graphDataBuilder.buildGraphData(filteredReactions);
    const nodeArray = Array.from(nodes.values());
    const linkArray = links.map((link) => ({
      ...link,
      source: nodes.get(link.source),
      target: nodes.get(link.target),
    }));

    let visibleNodes = this.graphDataBuilder.filterVisibleNodes(nodeArray, this.state);

    // Add directly involved materials
    visibleNodes = nodeArray.filter((node) => {
      if (visibleNodes.includes(node)) return true;
      if (node.type === "material" && node.isTagMaterial) {
        return this._isMaterialDirectlyInvolved(node.id, linkArray);
      }
      return false;
    });

    const visibleLinks = this.graphDataBuilder.filterVisibleLinks(linkArray, visibleNodes);
    // Visible degree, read by the force presets (link strength, degree-scaled repulsion). Set
    // before the simulation sees the nodes, since d3 evaluates strengths when nodes are assigned.
    visibleNodes.forEach((node) => (node.degree = 0));
    visibleLinks.forEach(({ source, target }) => {
      source.degree += 1;
      target.degree += 1;
    });

    // Carry over position/velocity from whatever is already on screen, keyed by node id, so a
    // node that persists across this update does not jump; only genuinely new nodes get a fresh
    // starting position from the simulation.
    visibleNodes.forEach((node) => {
      const previous = this._nodesById.get(node.id);
      if (previous) {
        node.x = previous.x;
        node.y = previous.y;
        node.vx = previous.vx;
        node.vy = previous.vy;
        node.fx = previous.fx;
        node.fy = previous.fy;
        node.pinned = previous.pinned;
      }
    });
    const newCount = visibleNodes.filter((node) => !this._nodesById.has(node.id)).length;
    this._placeNewNodesNearNeighbors(visibleNodes, visibleLinks);
    this._nodesById = new Map(visibleNodes.map((node) => [node.id, node]));

    const isMounted = this._svg && container.contains(this._svg.node());
    if (!isMounted) {
      this._fullSetup(container, width, height, visibleNodes, visibleLinks, linkArray);
    } else {
      this._incrementalUpdate(visibleNodes, visibleLinks, linkArray, width, height, newCount);
    }
  }

  // A new node starts next to an already placed neighbor (a tag's materials around the tag, a
  // new reaction next to its reagents) instead of at d3's default spot around the origin, far from
  // everything: the layout then only has to settle it locally. Several passes, so chains of new
  // nodes (reaction -> new tag -> its new materials) are placed outward from what exists.
  _placeNewNodesNearNeighbors(visibleNodes, visibleLinks) {
    const neighbors = new Map(visibleNodes.map((node) => [node, []]));
    visibleLinks.forEach(({ source, target }) => {
      neighbors.get(source)?.push(target);
      neighbors.get(target)?.push(source);
    });
    const placed = new Set(visibleNodes.filter((node) => Number.isFinite(node.x)));
    if (placed.size === 0) return;
    const spread = getForcePreset(this.layout.presetId).linkDistance * 0.6;
    for (let pass = 0; pass < 4; pass++) {
      const placedThisPass = [];
      visibleNodes.forEach((node) => {
        if (placed.has(node)) return;
        const anchor = neighbors.get(node).find((n) => placed.has(n));
        if (!anchor) return;
        const angle = Math.random() * 2 * Math.PI;
        node.x = anchor.x + Math.cos(angle) * spread;
        node.y = anchor.y + Math.sin(angle) * spread;
        placedThisPass.push(node);
      });
      if (placedThisPass.length === 0) break;
      placedThisPass.forEach((node) => placed.add(node));
    }
  }

  // Stops listening to shortcut changes. Call when the renderer is discarded.
  dispose() {
    this._cancelPendingClick();
    this._unsubscribeShortcuts?.();
    this._unsubscribeShortcuts = null;
  }

  // Fully tears down any existing graph (used before showing an empty/too-many-reactions message,
  // and internally before a from-scratch setup).
  _teardown() {
    this._cancelPendingClick();
    this.highlighter.current = null;
    if (this._resizeHandler) {
      window.removeEventListener("resize", this._resizeHandler);
      this._resizeHandler = null;
    }
    if (this.currentCleanup) {
      this.currentCleanup();
      this.currentCleanup = null;
    }
    this._svg = null;
    this._g = null;
    this._simulation = null;
    this._linkGroupSelection = null;
    this._nodeSelection = null;
    this._nodesById = new Map();
  }

  // Builds the SVG/simulation from scratch. Only needed on the very first render, or after
  // recovering from an empty/too-many-reactions state (which clears the container). Does NOT
  // touch this._nodesById - render() already set it to the correct value for this call right
  // before invoking this method; clearing it here would defeat position carry-over on the very
  // first incremental update right after a fresh setup.
  _fullSetup(container, width, height, visibleNodes, visibleLinks, linkArray) {
    if (this._resizeHandler) {
      window.removeEventListener("resize", this._resizeHandler);
      this._resizeHandler = null;
    }
    if (this.currentCleanup) {
      this.currentCleanup();
      this.currentCleanup = null;
    }
    this._svg = null;
    this._g = null;
    this._simulation = null;
    this._linkGroupSelection = null;
    this._nodeSelection = null;

    container.innerHTML = "";

    const { svg, g } = this._createSVG(container, width, height);
    this._createArrowMarkers(svg);
    this._svg = svg;
    this._g = g;

    this._simulation = this.layout.create(visibleNodes, visibleLinks, width, height);
    this._linkGroupSelection = this._joinLinks(g, visibleLinks);
    this._nodeSelection = this._joinNodes(g, visibleNodes, linkArray);

    this._simulation.on("tick", () => this._onTick());
    // Snap once the layout has settled (initial layout, preset change, new nodes coming in): as
    // soon as it looks settled (CONFIG.graph.snapAlpha), or when d3 stops on its own.
    this._simulation.on("tick.snap", () => {
      if (this.grid.current() && this._simulation.alpha() < CONFIG.graph.snapAlpha) {
        this._simulation.stop();
        this.grid.snapToGrid();
      } else {
        this.grid.setSuspended(!!this.grid.current());
      }
    });
    this._simulation.on("end.snap", () => this.grid.snapToGrid());
    this.grid.configureForce();
    this.grid.draw();
    if (this.grid.current()) this.layout.relayout(1);
    // Force layout math (d3-force's timer) schedules its first tick asynchronously, so without
    // this, freshly joined elements would sit with no position at all for a brief moment. Paint
    // the current state immediately instead of waiting for that first async tick.
    this._onTick();

    this._resizeHandler = () => this._handleResize(container, this._svg, this._simulation);
    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(this._resizeHandler) : null;
    resizeObserver?.observe(container);
    window.addEventListener("resize", this._resizeHandler);

    this.currentCleanup = () => {
      if (this._resizeHandler) window.removeEventListener("resize", this._resizeHandler);
      resizeObserver?.disconnect();
      this._simulation?.stop();
      this.grid.stopAnimation();
      this.selection.detach();
    };
  }

  // Reuses the existing SVG/simulation: joins the new node/link data against what is already on
  // screen (keyed by id), so unaffected nodes/links are left completely untouched, and only the
  // difference is created or removed. A gentle reheat lets the simulation settle the change in
  // without a full, disruptive re-layout.
  _incrementalUpdate(visibleNodes, visibleLinks, linkArray, width, height, newCount = 0) {
    // The SVG's own size no longer gets recomputed for free on every render now that it isn't
    // rebuilt from scratch each time (previously any render implicitly refreshed it); the
    // container can resize for reasons other than a window resize event (e.g. the side panel
    // being hidden), so keep it in sync explicitly here too.
    this._svg.attr("width", width).attr("height", height).attr("viewBox", [0, 0, width, height]);
    this.grid.draw();

    this._linkGroupSelection = this._joinLinks(this._g, visibleLinks);
    this._nodeSelection = this._joinNodes(this._g, visibleNodes, linkArray);

    const fresh = visibleNodes.filter((node) => !Number.isFinite(node.x));
    this._simulation.nodes(visibleNodes);
    if (this.layout.noSettling()) this.layout.centerFreshNodes(fresh, width, height);
    this._simulation.force("link").links(visibleLinks);
    this.layout.setCenterForces(this._simulation, width, height);
    // A snap animation in flight would fight the new layout; layout.relayout() settles everything and,
    // with a grid, snaps it back.
    if (this.grid.current()) this.grid.stopAnimation();
    // Mostly new nodes (e.g. a saved config loaded): a gentle reheat can't untangle that, so
    // lay it out from scratch, untangle phase included.
    if (newCount > visibleNodes.length / 2) {
      this.layout.applyPreset(this._simulation, width, height);
      this.layout.relayout(1);
    } else {
      this.layout.relayout(0.4);
    }

    // Same reasoning as in _fullSetup: paint immediately with whatever positions are already
    // known (carried-over ones for persisting nodes, computed defaults for new ones) instead of
    // waiting for the simulation's next async tick, which is what made persisting links in
    // particular look like they were lagging a step behind their nodes.
    this._onTick();
  }

  _onTick() {
    this._linkGroupSelection
      .selectAll("line")
      .attr("x1", (d) => d.source.x)
      .attr("y1", (d) => d.source.y)
      .attr("x2", (d) => d.target.x)
      .attr("y2", (d) => d.target.y);

    this._nodeSelection.attr("transform", (d) => `translate(${d.x},${d.y})`);
  }

  _isMaterialDirectlyInvolved(materialId, linkArray) {
    return linkArray.some(
      (link) =>
        (link.source.id === materialId && link.target.type === "reaction" && link.type === "input") ||
        (link.target.id === materialId && link.source.type === "reaction" && link.type === "output"),
    );
  }

  _createSVG(container, width, height) {
    const wrapper = document.createElement("div");
    wrapper.style.cssText = "width:100%;height:100%;overflow:hidden;position:relative;";
    container.appendChild(wrapper);

    // Grid snapping backdrop: a canvas under the SVG drawing every visible lattice point, from the
    // grid's own coordinates and the current zoom. (An SVG <pattern> drifted away from the real
    // lattice: browsers rasterize pattern tiles at rounded sizes, so the error piles up tile after
    // tile.) Outside the SVG, it is never part of an export.
    const gridCanvas = document.createElement("canvas");
    gridCanvas.className = "snap-grid";
    gridCanvas.style.cssText = "position:absolute;left:0;top:0;pointer-events:none;";
    wrapper.appendChild(gridCanvas);
    this.grid.attachCanvas(gridCanvas);
    this._zoomTransform = d3.zoomIdentity;

    const svg = d3
      .select(wrapper)
      .append("svg")
      .attr("width", width)
      .attr("height", height)
      .attr("viewBox", [0, 0, width, height])
      .attr("preserveAspectRatio", "none")
      .style("position", "absolute")
      .style("left", 0)
      .style("top", 0);

    const g = svg.append("g");

    const zoom = d3
      .zoom()
      .extent(() => [[0, 0], [Math.max(1, container.clientWidth), Math.max(1, container.clientHeight)]])
      .filter(event => allowGraphGesture(event, container))
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
        this._zoomTransform = event.transform;
        this.grid.scheduleDraw();
      });

    svg.call(zoom);
    this._zoom = zoom;
    svg.on("click", () => this.highlighter.reset(d3.selectAll(".node")));
    // Right button drags pan the view (see allowGraphGesture): no browser menu on the background.
    // Nodes keep theirs (or their own actions menu).
    svg.on("contextmenu.pan", (event) => {
      if (!event.target.closest?.(".node")) event.preventDefault();
    });
    // Middle-button drags pan too: keep the browser from starting its autoscroll (Windows) or
    // pasting the primary selection (Linux) on that press.
    svg.on("mousedown.middlepan", (event) => {
      if (event.button === 1) event.preventDefault();
    });
    svg.on("auxclick.middlepan", (event) => {
      if (event.button === 1) event.preventDefault();
    });
    this.selection.setupRectangle(svg);

    return { svg, g };
  }

  _createArrowMarkers(svg) {
    const defs = svg.append("defs");

    [
      { id: "arrow-input", color: CONFIG.graph.colors.inputArrow },
      { id: "arrow-output", color: CONFIG.graph.colors.outputArrow },
    ].forEach(({ id, color }) => {
      defs
        .append("marker")
        .attr("id", id)
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", CONFIG.graph.sizes.materialRadius)
        .attr("refY", 0)
        .attr("markerWidth", 8)
        .attr("markerHeight", 8)
        .attr("orient", "auto")
        .append("path")
        .attr("d", "M0,-5L10,0L0,5")
        .attr("fill", color);
    });
  }

  // Uses a keyed .join(): links present in both the previous and new data keep their existing
  // DOM (nothing to update - a link's appearance is fully determined by its stable "type"), new
  // links are created, and links no longer present are removed.
  _joinLinks(g, visibleLinks) {
    let linksContainer = g.select(":scope > g.links");
    if (linksContainer.empty()) {
      linksContainer = g.append("g").attr("class", "links");
    }

    const linkKey = (d) => `${d.source.id}--${d.target.id}--${d.type}`;

    const linkGroups = linksContainer
      .selectAll(":scope > g.link-group")
      .data(visibleLinks, linkKey)
      .join(
        (enter) => {
          const entered = enter
            .append("g")
            .attr("class", (d) => `link-group ${d.type}-link`)
            .style("opacity", (d) =>
              d.type === "tag-association" ? CONFIG.graph.opacities.tagAssociation : CONFIG.graph.opacities.linkDefault,
            );

          entered
            .append("line")
            .attr("stroke", (d) => {
              if (d.type === "input") return CONFIG.graph.colors.inputArrow;
              if (d.type === "output") return CONFIG.graph.colors.outputArrow;
              if (d.type === "tag-association") return CONFIG.graph.colors.tagAssociation;
              return "#ccc";
            })
            .attr("stroke-width", (d) =>
              d.type === "tag-association" ? CONFIG.graph.sizes.strokeWidth - 1 : CONFIG.graph.sizes.strokeWidth,
            )
            .attr("stroke-dasharray", (d) => (d.type === "input" ? "5,5" : null))
            .attr("marker-end", (d) => {
              if (d.type === "input") return "url(#arrow-input)";
              if (d.type === "output") return "url(#arrow-output)";
              return null;
            });

          return entered;
        },
        (update) => update,
        (exit) => exit.remove(),
      );

    // The keyed join above correctly refreshes each <g>'s own bound datum (including a
    // persisting link's up-to-date source/target node references), but a child <line>'s
    // __data__ is captured once at creation time and does not automatically track later rebinds
    // of its parent. Left alone, a persisting link would keep reading its ORIGINAL source/target
    // object references forever - and since GraphDataBuilder builds fresh node objects on every
    // render, those original references are no longer the ones the simulation is actually
    // ticking, so the line visually freezes in place while its nodes keep moving. Explicitly
    // re-propagating the parent's current datum onto the <line> here (once per render, not per
    // tick) keeps _onTick's efficient batched selectAll("line") reading correct, live data.
    linkGroups.each(function (d) {
      d3.select(this).select("line").datum(d);
    });

    return linkGroups;
  }

  // Zooms/pans so the whole graph fits the view (labels included), centered: the "Recenter"
  // button. Never zooms in past 100%, so a small graph is centered rather than blown up.
  fitToView({ duration = 400, padding = 40 } = {}) {
    const nodes = this._simulation?.nodes() ?? [];
    if (!this._svg || !this._zoom || nodes.length === 0) return;
    const width = Number(this._svg.attr("width")) || 1;
    const height = Number(this._svg.attr("height")) || 1;
    const labelRoom = CONFIG.graph.layout.labelOffsetMaterial + 12; // label under the node
    const x0 = d3.min(nodes, (n) => n.x - n.radius), x1 = d3.max(nodes, (n) => n.x + n.radius);
    const y0 = d3.min(nodes, (n) => n.y - n.radius), y1 = d3.max(nodes, (n) => n.y + n.radius + labelRoom);
    const [minScale, maxScale] = this._zoom.scaleExtent();
    const fit = Math.min((width - 2 * padding) / Math.max(1, x1 - x0), (height - 2 * padding) / Math.max(1, y1 - y0));
    const k = Math.max(minScale, Math.min(1, maxScale, fit));
    const transform = d3.zoomIdentity.translate(width / 2 - k * (x0 + x1) / 2, height / 2 - k * (y0 + y1) / 2).scale(k);
    const target = duration > 0 ? this._svg.transition().duration(duration) : this._svg;
    target.call(this._zoom.transform, transform);
  }

  // Uses a keyed .join(): a node that persists between two renders keeps its existing DOM
  // element (base circle/image/label are never rebuilt), only a few attributes that depend on
  // the wider graph context - not on the node itself - are refreshed (material highlight ring,
  // reaction origin ring, tag visibility icon/border), since those can change without the node
  // entering or leaving the visible set. New nodes are fully constructed; removed nodes are
  // dropped from the DOM (and, since they are no longer in this._nodesById either, from the
  // simulation on the next render).
  _joinNodes(g, visibleNodes, linkArray) {
    const simulation = this._simulation;
    // A normal d3 drag (neighbors follow, gravity keeps working); with a grid the dragged node
    // moves cell to cell. Dragging a selected node moves the whole selection, offsets kept (each
    // node on its own cell with a grid). On release nodes are let go, unless pinned on purpose
    // ("Pin position" in the menu): those stay where they are dropped, physics never moving
    // them. With no settling (settling time 0) nothing ticks: nodes are moved by hand, stay put.
    // Nothing happens until the pointer actually moves: a plain click (d3 still sends start/end)
    // must neither move the node nor shake the layout.
    let group = [];
    let moved = false;
    const drag = d3
      .drag()
      .on("start", (event, d) => {
        group = this.selection.dragGroup(d);
        moved = false;
      })
      .on("drag", (event) => {
        if (!moved) {
          moved = true;
          this.grid.stopAnimation();
          if (!this.layout.noSettling()) simulation.alphaTarget(0.3).restart();
        }
        const grid = this.grid.current();
        group.forEach(({ node, dx, dy }) => {
          const target = { x: event.x + dx, y: event.y + dy };
          const at = grid ? grid.nearest(target.x, target.y) : target;
          node.fx = at.x;
          node.fy = at.y;
          if (this.layout.noSettling()) {
            node.x = at.x;
            node.y = at.y;
          }
        });
        if (this.layout.noSettling()) this._onTick();
      })
      .on("end", (event) => {
        if (!moved) {
          group = [];
          return;
        }
        const grid = this.grid.current();
        if (!this.layout.noSettling() && !event.active) simulation.alphaTarget(0);
        // Where they land: with a grid, each on the closest free cell (no two nodes on one cell).
        const moving = new Set(group.map(({ node }) => node));
        const occupied = grid ? occupiedCells(grid, simulation.nodes().filter((n) => !moving.has(n))) : null;
        group.forEach(({ node }) => {
          if (grid && (node.pinned || this.layout.noSettling())) {
            const cell = nearestFreeCell(grid, node.fx ?? node.x, node.fy ?? node.y, occupied);
            occupied.add(grid.key(cell.i, cell.j));
            node.fx = cell.x;
            node.fy = cell.y;
            if (this.layout.noSettling()) {
              node.x = cell.x;
              node.y = cell.y;
            }
          }
          if (!node.pinned) {
            node.fx = null;
            node.fy = null;
          }
        });
        if (this.layout.noSettling()) this._onTick();
        group = [];
      });

    let nodesContainer = g.select(":scope > g.nodes-root");
    if (nodesContainer.empty()) {
      nodesContainer = g.append("g").attr("class", "nodes-root");
    }

    const nodeSelection = nodesContainer
      .selectAll(":scope > g.node")
      .data(visibleNodes, (d) => d.id)
      .join(
        (enter) => {
          const entered = enter
            .append("g")
            .attr("class", (d) => `node ${d.type}-node`)
            .call(drag);

          entered
            .filter((d) => d.type === "material")
            .each((d, i, els) => this.shapes.createMaterial(d, d3.select(els[i]), linkArray));
          entered
            .filter((d) => d.type === "tag")
            .each((d, i, els) => this.shapes.createTag(d, d3.select(els[i])));
          entered
            .filter((d) => d.type === "reaction")
            .each((d, i, els) => this.shapes.createReaction(d, d3.select(els[i])));

          return entered;
        },
        (update) => {
          update
            .filter((d) => d.type === "material")
            .each((d, i, els) => this.shapes.updateMaterialHighlight(d, d3.select(els[i]), linkArray));
          update
            .filter((d) => d.type === "tag")
            .each((d, i, els) => this.shapes.updateTag(d, d3.select(els[i])));
          update
            .filter((d) => d.type === "reaction")
            .each((d, i, els) => this.shapes.updateReactionOriginRing(d, d3.select(els[i])));
          return update;
        },
        (exit) => exit.remove(),
      );

    // Re-applying the click handler to the merged (enter + update) selection each time is
    // harmless/idempotent for elements that already had it - D3 simply overwrites the same
    // listener - and correctly (re)binds it for brand new nodes too.
    nodeSelection.on("click contextmenu", (event, d) => this._handleNodeEvent(event, d, nodeSelection, linkArray));
    // Node double-clicks are shortcuts, not zoom-in requests (d3.zoom listens to dblclick on the svg).
    nodeSelection.on("dblclick", (event) => event.stopPropagation());
    this._nodeSelection = nodeSelection;
    this.pins.refreshBadges();
    this.selection.refresh();

    return nodeSelection;
  }

  // Action id -> handler(node). An action missing here (or whose handler returns false because
  // it is unavailable) behaves as if it were unbound.
  _actionHandler(actionId) {
    return {
      selectAsReagent: (node) => this._selectMaterialAsReagent(node),
      selectAsProduct: (node) => this._selectMaterialAsProduct(node),
      openMaterialWiki: (node) => this._openMaterialWiki(node),
      addReagentToNewSet: (node) => this.onQuickAddSet && this.onQuickAddSet(node.id, "reagent"),
      addProductToNewSet: (node) => this.onQuickAddSet && this.onQuickAddSet(node.id, "product"),
      openMaterialMenu: (node, event, ctx) => this.menu.show(event, node, ctx),
      openTagMenu: (node, event, ctx) => this.menu.show(event, node, ctx),
      openReactionMenu: (node, event, ctx) => this.menu.show(event, node, ctx),
      toggleTagMaterials: (node) => this.state.toggleTagVisibility(node.id),
    }[actionId];
  }

  // Single entry point for click and contextmenu on a node. The node type is the shortcut scope.
  _handleNodeEvent(event, node, allNodes, linkArray) {
    const actionId = this.shortcutManager.resolve(node.type, event);
    const handler = actionId && this._actionHandler(actionId);

    if (event.type === "contextmenu") {
      if (!handler) return; // nothing bound: keep the browser's native menu
      event.preventDefault();
      event.stopPropagation();
      handler(node, event, { allNodes, linkArray });
      return;
    }

    event.stopPropagation();
    this._cancelPendingClick();

    if (!handler) {
      // A plain click (or an unbound combo) highlights. Skip the second click of a double-click
      // so it doesn't toggle the highlight back off.
      if (event.detail < 2) this.highlighter.highlight(node, allNodes, linkArray);
      return;
    }

    // A double-click with the same modifiers is bound too: wait before running this one.
    if (event.detail < 2 && this.shortcutManager.hasDoubleClickVariant(node.type, event)) {
      const { clientX, clientY } = event;
      this._pendingClick = setTimeout(() => {
        this._pendingClick = null;
        handler(node, { clientX, clientY }, { allNodes, linkArray });
      }, GraphRenderer.DOUBLE_CLICK_DELAY);
      return;
    }

    handler(node, event, { allNodes, linkArray });
  }

  _cancelPendingClick() {
    clearTimeout(this._pendingClick);
    this._pendingClick = null;
  }

  _openMaterialWiki(node) {
    const wikiUrl = node.material?.wikipage ? `${CONFIG.urls.wikiBase}${encodeURIComponent(node.material.wikipage)}` : "";
    if (wikiUrl) {
      window.open(wikiUrl, "_blank");
    } else {
      UIHelper.showNotification("No wiki page found for this material");
    }
  }

  _selectMaterialAsProduct(node) {
    if (this.state.selectProduct(node.id)) {
      this.state.eventBus.emit("stateChanged", this.state);
    } else {
      UIHelper.showNotification("No valid reactions with this product");
    }
  }

  _selectMaterialAsReagent(node) {
    if (this.state.selectReagent(node.id)) {
      this.state.eventBus.emit("stateChanged", this.state);
    } else {
      UIHelper.showNotification("No valid reactions with this reagent");
    }
  }

  _handleResize(container, svg, simulation) {
    const width = container.clientWidth;
    const height = Math.max(1, container.clientHeight);
    const changed = Number(svg.attr('width')) !== width || Number(svg.attr('height')) !== height;
    svg.attr("width", width).attr("height", height).attr("viewBox", `0 0 ${width} ${height}`);
    if (changed) this.grid.draw();
    if (changed && simulation) {
      simulation.force('center').x(width / 2).y(height / 2);
      simulation.force('x')?.x(width / 2);
      simulation.force('y')?.y(height / 2);
      this.layout.reheat(0.1);
    }
  }
}
