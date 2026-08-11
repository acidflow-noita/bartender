// ============================================================================
// GRAPH RENDERER - D3.js visualization of reactions graph
// ============================================================================

import { CONFIG } from "../config/config.js";
import { UIHelper } from "../ui/UIHelper.js";

export class GraphRenderer {
  // shortcutManager/onQuickAddSet are optional: pass them to enable the configurable
  // click+modifier shortcuts that add a clicked material to a brand new reaction set (see
  // core/ShortcutManager.js and _handleNodeClick below). Existing callers that omit them keep
  // working exactly as before.
  constructor(dataRepo, state, graphDataBuilder, shortcutManager = null, onQuickAddSet = null) {
    this.dataRepo = dataRepo;
    this.state = state;
    this.graphDataBuilder = graphDataBuilder;
    this.shortcutManager = shortcutManager;
    this.onQuickAddSet = onQuickAddSet;
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
    const height = Math.max(CONFIG.graph.layout.minHeight, width * CONFIG.graph.layout.heightRatio);

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
      }
    });
    this._nodesById = new Map(visibleNodes.map((node) => [node.id, node]));

    const isMounted = this._svg && container.contains(this._svg.node());
    if (!isMounted) {
      this._fullSetup(container, width, height, visibleNodes, visibleLinks, linkArray);
    } else {
      this._incrementalUpdate(visibleNodes, visibleLinks, linkArray, width, height);
    }
  }

  // Fully tears down any existing graph (used before showing an empty/too-many-reactions message,
  // and internally before a from-scratch setup).
  _teardown() {
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

    this._simulation = this._createSimulation(visibleNodes, visibleLinks, width, height);
    this._linkGroupSelection = this._joinLinks(g, visibleLinks);
    this._nodeSelection = this._joinNodes(g, visibleNodes, linkArray);

    this._simulation.on("tick", () => this._onTick());
    // Force layout math (d3-force's timer) schedules its first tick asynchronously, so without
    // this, freshly joined elements would sit with no position at all for a brief moment. Paint
    // the current state immediately instead of waiting for that first async tick.
    this._onTick();

    this._resizeHandler = () => this._handleResize(container, this._svg);
    window.addEventListener("resize", this._resizeHandler);

    this.currentCleanup = () => {
      if (this._resizeHandler) window.removeEventListener("resize", this._resizeHandler);
      this._simulation?.stop();
    };
  }

  // Reuses the existing SVG/simulation: joins the new node/link data against what is already on
  // screen (keyed by id), so unaffected nodes/links are left completely untouched, and only the
  // difference is created or removed. A gentle reheat lets the simulation settle the change in
  // without a full, disruptive re-layout.
  _incrementalUpdate(visibleNodes, visibleLinks, linkArray, width, height) {
    // The SVG's own size no longer gets recomputed for free on every render now that it isn't
    // rebuilt from scratch each time (previously any render implicitly refreshed it); the
    // container can resize for reasons other than a window resize event (e.g. the side panel
    // being hidden), so keep it in sync explicitly here too.
    this._svg.attr("width", width).attr("height", height).attr("viewBox", [0, 0, width, height]);

    this._linkGroupSelection = this._joinLinks(this._g, visibleLinks);
    this._nodeSelection = this._joinNodes(this._g, visibleNodes, linkArray);

    this._simulation.nodes(visibleNodes);
    this._simulation.force("link").links(visibleLinks);
    this._simulation.force("center", d3.forceCenter(width / 2, height / 2));
    this._simulation.alpha(0.4).restart();

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
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => g.attr("transform", event.transform));

    svg.call(zoom);
    svg.on("click", () => this._resetHighlighting(d3.selectAll(".node")));

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
              if (d.type === "tag-association") return CONFIG.graph.colors.tagNode;
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

  _createSimulation(visibleNodes, visibleLinks, width, height) {
    return d3
      .forceSimulation(visibleNodes)
      .force(
        "link",
        d3
          .forceLink(visibleLinks)
          .id((d) => d.id)
          .distance(CONFIG.graph.sizes.linkDistance),
      )
      .force("charge", d3.forceManyBody().strength(CONFIG.graph.sizes.chargeStrength))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force(
        "collision",
        d3.forceCollide().radius((d) => d.radius + 15),
      );
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
    const drag = d3
      .drag()
      .on("start", (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on("end", (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
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
            .each((d, i, els) => this._createMaterialNode(d, d3.select(els[i]), linkArray));
          entered
            .filter((d) => d.type === "tag")
            .each((d, i, els) => this._createTagNode(d, d3.select(els[i])));
          entered
            .filter((d) => d.type === "reaction")
            .each((d, i, els) => this._createReactionNode(d, d3.select(els[i])));

          return entered;
        },
        (update) => {
          update
            .filter((d) => d.type === "material")
            .each((d, i, els) => this._updateMaterialHighlight(d, d3.select(els[i]), linkArray));
          update
            .filter((d) => d.type === "tag")
            .each((d, i, els) => this._updateTagNode(d, d3.select(els[i])));
          update
            .filter((d) => d.type === "reaction")
            .each((d, i, els) => this._updateReactionOriginRing(d, d3.select(els[i])));
          return update;
        },
        (exit) => exit.remove(),
      );

    // Re-applying the click handler to the merged (enter + update) selection each time is
    // harmless/idempotent for elements that already had it - D3 simply overwrites the same
    // listener - and correctly (re)binds it for brand new nodes too.
    nodeSelection.on("click", (event, d) => this._handleNodeClick(event, d, nodeSelection, linkArray));
    nodeSelection.on("contextmenu", (event, d) => this._handleNodeContextMenu(event, d));

    return nodeSelection;
  }

  _createMaterialNode(node, selection, linkArray) {
    // Highlight (dynamic - refreshed independently via _updateMaterialHighlight so it can be
    // kept in sync without rebuilding the rest of the node)
    selection
      .append("circle")
      .attr("r", node.radius + 4)
      .attr("fill", "transparent")
      .attr("stroke-width", 2)
      .attr("class", "material-highlight");
    this._updateMaterialHighlight(node, selection, linkArray);

    // Background
    selection
      .append("circle")
      .attr("r", node.radius)
      .attr("fill", node.color)
      .attr("stroke", CONFIG.graph.colors.nodeStroke)
      .attr("stroke-width", CONFIG.graph.sizes.strokeWidth)
      .attr("class", "node-background");

    // Clip path and image
    selection.append("clipPath").attr("id", `clip-${node.id}`).append("circle").attr("r", node.radius);

    selection
      .append("g")
      .attr("clip-path", `url(#clip-${node.id})`)
      .append("image")
      .attr("href", node.imageUrl)
      .attr("x", -node.radius * CONFIG.graph.layout.imagePosition)
      .attr("y", -node.radius * CONFIG.graph.layout.imagePosition)
      .attr("transform", `scale(${CONFIG.graph.layout.imageScale})`)
      .attr("class", "material-image")
      .on("error", function () {
        d3.select(this).style("display", "none");
      });

    // Label
    selection
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dy", node.radius + CONFIG.graph.layout.labelOffsetMaterial)
      .attr("font-size", CONFIG.graph.sizes.fontSizeSmall)
      .attr("fill", CONFIG.graph.colors.text)
      .attr("font-weight", "bold")
      .attr("class", "node-label")
      .text(UIHelper.truncateName(node.name || node.id));

    // Tooltip
    selection.append("title").text(`${node.name} (${node.id})`);
  }

  // Whether a material is "directly involved" (and thus highlighted) is derived from the wider
  // set of currently visible reactions, so it can change for a material that itself neither
  // entered nor left the graph - e.g. toggling off the one set/group that used it as a direct
  // reagent, while a different set still shows it only via a tag association. Called both right
  // after creating the node and, on every subsequent render, for nodes that persist.
  _updateMaterialHighlight(node, selection, linkArray) {
    const isDirectMaterial = this._isMaterialDirectlyInvolved(node.id, linkArray);
    const isSelected = this.state.selectedReagents.includes(node.id) || this.state.selectedProduct === node.id;

    selection
      .select(":scope > circle.material-highlight")
      .attr("stroke", () => {
        if (isSelected) return CONFIG.graph.colors.selectedHighlight;
        if (isDirectMaterial) return CONFIG.graph.colors.directMaterialHighlight;
        return "transparent";
      })
      .style("opacity", isSelected || isDirectMaterial ? 1 : 0);
  }

  _createTagNode(node, selection) {
    // Background
    selection
      .append("circle")
      .attr("r", node.radius)
      .attr("fill", node.color)
      .attr("stroke", CONFIG.graph.colors.nodeStroke)
      .attr("stroke-width", CONFIG.graph.sizes.strokeWidth)
      .attr("class", "node-background");

    // Icon
    selection
      .append("image")
      .attr("x", -node.radius * 0.5)
      .attr("y", -node.radius * 0.5)
      .attr("width", node.radius)
      .attr("height", node.radius)
      .attr("class", "tag-visibility-icon");

    // Border
    selection
      .append("circle")
      .attr("r", node.radius + 2)
      .attr("fill", "transparent")
      .attr("stroke-width", 3)
      .attr("stroke-dasharray", "4,2")
      .attr("class", "tag-border");

    // Label
    selection
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dy", node.radius + CONFIG.graph.layout.labelOffsetReaction)
      .attr("font-size", CONFIG.graph.sizes.fontSizeSmall)
      .attr("fill", CONFIG.graph.colors.text)
      .attr("font-weight", "bold")
      .attr("class", "node-label")
      .text(UIHelper.truncateName(node.name || node.id));

    selection.append("title");

    this._updateTagNode(node, selection);
  }

  // Icon/border color and tooltip depend on this.state.visibleTagMaterials, which can change
  // (double-click) independently of the tag node itself entering or leaving the visible set.
  _updateTagNode(node, selection) {
    const materialIds = this.dataRepo.resolveTag(node.id);
    const hasVisibleMaterials = materialIds.some((id) => this.state.visibleTagMaterials.has(id));

    selection
      .select(":scope > image.tag-visibility-icon")
      .attr(
        "href",
        hasVisibleMaterials
          ? `${CONFIG.urls.imageBase}/images/icons/eye-open.svg`
          : `${CONFIG.urls.imageBase}/images/icons/eye-closed.svg`,
      );

    selection
      .select(":scope > circle.tag-border")
      .attr("stroke", hasVisibleMaterials ? CONFIG.graph.colors.tagVisible : CONFIG.graph.colors.tagHidden);

    const visibleCount = materialIds.filter((id) => this.state.visibleTagMaterials.has(id)).length;
    const totalCount = materialIds.length;
    const tagName = node.tag;

    let tooltipText;
    if (visibleCount === totalCount) {
      tooltipText = `Tag: [${tagName}]\nAll ${totalCount} materials visible\nDouble-click to hide all`;
    } else if (visibleCount > 0) {
      tooltipText = `Tag: [${tagName}]\n${visibleCount} of ${totalCount} materials visible\nDouble-click to toggle all`;
    } else {
      tooltipText = `Tag: [${tagName}]\nAll ${totalCount} materials hidden\nDouble-click to show all`;
    }

    selection.select(":scope > title").text(tooltipText);
  }

  _createReactionNode(node, selection) {
    // Circle
    selection
      .append("circle")
      .attr("r", node.radius)
      .attr("fill", node.color)
      .attr("stroke", CONFIG.graph.colors.nodeStroke)
      .attr("stroke-width", CONFIG.graph.sizes.strokeWidth)
      .attr("class", "reaction-circle");

    // Speed number
    selection
      .append("text")
      .text(node.reaction.reactionRate)
      .attr("text-anchor", "middle")
      .attr("dy", 5)
      .attr("font-size", CONFIG.graph.sizes.fontSizeMedium)
      .attr("fill", CONFIG.graph.colors.text)
      .attr("font-weight", "bold")
      .attr("class", "reaction-speed");

    selection.append("title");

    // Origin ring + tooltip: both depend on which reaction set(s) currently contribute this
    // reaction (node.setColors/setNames), which is refreshed independently on every render even
    // for a reaction node that itself persists - see _updateReactionOriginRing.
    this._updateReactionOriginRing(node, selection);
  }

  // Draws the origin ring (which reaction set(s) this reaction currently comes from - a single
  // contributing set draws a solid colored ring, several draw a pie of colored segments) and the
  // tooltip. Any previous ring is removed first so this is safe to call again for a persisting
  // node whose contributing set(s) changed (e.g. after enabling/disabling a sibling set that
  // also matched this same reaction).
  _updateReactionOriginRing(node, selection) {
    selection.selectAll(".reaction-origin-ring, .reaction-origin-ring-segment").remove();
    if (node.setColors && node.setColors.length > 0) {
      this._createReactionOriginRing(node, selection);
    }

    const inputs = [node.reaction.reagent1, node.reaction.reagent2, node.reaction.reagent3]
      .filter(Boolean)
      .map((id) => UIHelper.getMaterialName(id, this.dataRepo))
      .join(" + ");

    const outputs = [node.reaction.product1, node.reaction.product2, node.reaction.product3]
      .filter(Boolean)
      .map((id) => UIHelper.getMaterialName(id, this.dataRepo))
      .join(" + ");

    let tooltipText = `Reaction (Speed: ${node.reaction.reactionRate})\n${inputs} → ${outputs}`;
    if (node.setNames && node.setNames.length > 0) {
      tooltipText += `\nSets: ${node.setNames.join(", ")}`;
    }

    selection.select(":scope > title").text(tooltipText);
  }

  // Draws a ring of colored segments (one per contributing reaction set) around a reaction node.
  _createReactionOriginRing(node, selection) {
    const colors = node.setColors;
    const ringInner = node.radius + 3;
    const ringOuter = node.radius + 7;

    if (colors.length === 1) {
      selection
        .append("circle")
        .attr("r", (ringInner + ringOuter) / 2)
        .attr("fill", "none")
        .attr("stroke", colors[0])
        .attr("stroke-width", ringOuter - ringInner)
        .attr("class", "reaction-origin-ring");
      return;
    }

    const arcGenerator = d3.arc().innerRadius(ringInner).outerRadius(ringOuter);
    const sliceAngle = (2 * Math.PI) / colors.length;
    const gapAngle = 0.06;

    colors.forEach((color, i) => {
      selection
        .append("path")
        .attr(
          "d",
          arcGenerator({
            startAngle: i * sliceAngle + gapAngle / 2,
            endAngle: (i + 1) * sliceAngle - gapAngle / 2,
          }),
        )
        .attr("fill", color)
        .attr("class", "reaction-origin-ring-segment");
    });
  }

  _handleNodeClick(event, node, allNodes, linkArray) {
    event.stopPropagation();

    if (node.type === "tag") {
      if (this.shortcutManager) {
        if (this.shortcutManager.matchesEvent("openTagMenu", event)) {
          this._showTagContextMenu(event, node);
          return;
        }
      } else if (event.detail === 2) {
        // No shortcut manager configured: fall back to the original hardcoded double-click toggle.
        this.state.toggleTagVisibility(node.id);
        return;
      }
    }

    if (node.type === "material") {
      if (this.shortcutManager) {
        const actionHandlers = [
          ["addReagentToNewSet", () => this.onQuickAddSet && this.onQuickAddSet(node.id, "reagent")],
          ["addProductToNewSet", () => this.onQuickAddSet && this.onQuickAddSet(node.id, "product")],
          ["openMaterialWiki", () => this._openMaterialWiki(node)],
          ["selectAsProduct", () => this._selectMaterialAsProduct(node)],
          ["selectAsReagent", () => this._selectMaterialAsReagent(node)],
        ];

        for (const [action, handler] of actionHandlers) {
          if (this.shortcutManager.matchesEvent(action, event)) {
            handler();
            return;
          }
        }
      } else {
        // No shortcut manager configured: fall back to the original hardcoded combos.
        if (event.ctrlKey && event.shiftKey) {
          this._openMaterialWiki(node);
          return;
        }
        if (event.shiftKey) {
          this._selectMaterialAsProduct(node);
          return;
        }
        if (event.ctrlKey) {
          this._selectMaterialAsReagent(node);
          return;
        }
      }
    }

    // Regular click → highlight
    this._highlightConnections(node, allNodes, linkArray);
  }

  _handleNodeContextMenu(event, node) {
    if (node.type !== "tag" || !this.shortcutManager) return; // let the browser's native menu show
    if (!this.shortcutManager.matchesEvent("openTagMenu", event)) return; // rebound elsewhere

    event.preventDefault();
    event.stopPropagation();
    this._showTagContextMenu(event, node);
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

  // A small floating menu with explicit show/hide actions, replacing the old double-click toggle
  // (which had no way to tell whether it would open or close - here both options are always
  // spelled out, so a tag can always be closed again regardless of its current state).
  _showTagContextMenu(event, node) {
    this._closeContextMenu();

    const materialIds = this.dataRepo.resolveTag(node.id);
    const tagName = node.tag || node.id;

    const menu = document.createElement("div");
    menu.setAttribute("role", "menu");
    menu.style.cssText = [
      "position:fixed",
      `left:${event.clientX}px`,
      `top:${event.clientY}px`,
      "background:#1a1a1a",
      "border:1px solid #555",
      "border-radius:6px",
      "padding:4px",
      "z-index:10000",
      "box-shadow:0 4px 12px rgba(0,0,0,0.5)",
      "font-family:Arial, sans-serif",
      "font-size:12px",
      "min-width:180px",
    ].join(";");

    const title = document.createElement("div");
    title.textContent = `[${tagName}]`;
    title.style.cssText = "color:#999;padding:4px 8px;border-bottom:1px solid #444;margin-bottom:4px;";
    menu.appendChild(title);

    const addItem = (label, onClick) => {
      const item = document.createElement("button");
      item.type = "button";
      item.textContent = label;
      item.style.cssText =
        "display:block;width:100%;text-align:left;background:none;border:none;color:#fff;padding:6px 8px;cursor:pointer;border-radius:4px;";
      item.addEventListener("mouseenter", () => (item.style.background = "#333"));
      item.addEventListener("mouseleave", () => (item.style.background = "none"));
      item.addEventListener("click", () => {
        onClick();
        this._closeContextMenu();
      });
      menu.appendChild(item);
    };

    addItem("Show all materials", () => this.state.showTagMaterials(node.id));
    addItem("Hide all materials", () => this.state.hideTagMaterials(node.id));

    document.body.appendChild(menu);
    this._activeContextMenu = menu;

    // Deferred so the click/contextmenu event that opened the menu doesn't immediately close it.
    this._contextMenuOutsideHandler = (e) => {
      if (!menu.contains(e.target)) this._closeContextMenu();
    };
    setTimeout(() => {
      document.addEventListener("click", this._contextMenuOutsideHandler);
      document.addEventListener("contextmenu", this._contextMenuOutsideHandler);
    }, 0);
  }

  _closeContextMenu() {
    if (this._activeContextMenu) {
      this._activeContextMenu.remove();
      this._activeContextMenu = null;
    }
    if (this._contextMenuOutsideHandler) {
      document.removeEventListener("click", this._contextMenuOutsideHandler);
      document.removeEventListener("contextmenu", this._contextMenuOutsideHandler);
      this._contextMenuOutsideHandler = null;
    }
  }

  _highlightConnections(node, allNodes, linkArray) {
    this._resetHighlighting(allNodes);

    if (node.type === "material" || node.type === "tag") {
      allNodes
        .filter((n) => n.id === node.id)
        .select(".node-background")
        .attr("stroke", CONFIG.graph.colors.nodeStrokeHighlight)
        .attr("stroke-width", CONFIG.graph.sizes.strokeWidthHighlight);

      if (node.type === "tag") {
        const materialIds = this.dataRepo.resolveTag(node.id);
        materialIds.forEach((materialId) => {
          allNodes
            .filter((n) => n.id === materialId)
            .select(".node-background")
            .attr("stroke", CONFIG.graph.colors.tagVisible)
            .attr("stroke-width", CONFIG.graph.sizes.strokeWidthMedium);
        });
      }

      const connectedReactionIds = new Set();
      linkArray.forEach((link) => {
        if (link.source.id === node.id && link.target.type === "reaction") {
          connectedReactionIds.add(link.target.id);
        }
        if (link.target.id === node.id && link.source.type === "reaction") {
          connectedReactionIds.add(link.source.id);
        }
      });

      connectedReactionIds.forEach((reactionId) => {
        allNodes
          .filter((n) => n.id === reactionId)
          .select(".reaction-circle")
          .attr("stroke", CONFIG.graph.colors.nodeStrokeHighlight)
          .attr("stroke-width", CONFIG.graph.sizes.strokeWidthHighlight);

        linkArray.forEach((link) => {
          if (link.source.id === reactionId && (link.target.type === "material" || link.target.type === "tag")) {
            allNodes
              .filter((n) => n.id === link.target.id)
              .select(".node-background")
              .attr("stroke", CONFIG.graph.colors.outputHighlight)
              .attr("stroke-width", CONFIG.graph.sizes.strokeWidthMedium);
          }
          if (link.target.id === reactionId && (link.source.type === "material" || link.source.type === "tag")) {
            allNodes
              .filter((n) => n.id === link.source.id)
              .select(".node-background")
              .attr("stroke", CONFIG.graph.colors.inputHighlight)
              .attr("stroke-width", CONFIG.graph.sizes.strokeWidthMedium);
          }
        });
      });

      const allConnectedIds = this._getConnectedNodeIds(node.id, node.type, linkArray);

      allNodes.style("opacity", (n) =>
        allConnectedIds.has(n.id) ? CONFIG.graph.opacities.default : CONFIG.graph.opacities.dimmed,
      );

      d3.selectAll(".link-group").style("opacity", (l) =>
        allConnectedIds.has(l.source.id) && allConnectedIds.has(l.target.id)
          ? l.type === "tag-association"
            ? CONFIG.graph.opacities.tagAssociation
            : CONFIG.graph.opacities.default
          : CONFIG.graph.opacities.veryDimmed,
      );
    } else if (node.type === "reaction") {
      allNodes
        .filter((n) => n.id === node.id)
        .select(".reaction-circle")
        .attr("stroke", CONFIG.graph.colors.nodeStrokeHighlight)
        .attr("stroke-width", CONFIG.graph.sizes.strokeWidthHighlight);

      const connectedMaterialIds = new Set();
      linkArray.forEach((link) => {
        if (link.source.id === node.id && (link.target.type === "material" || link.target.type === "tag")) {
          connectedMaterialIds.add(link.target.id);
        }
        if (link.target.id === node.id && (link.source.type === "material" || link.source.type === "tag")) {
          connectedMaterialIds.add(link.source.id);
        }
      });

      connectedMaterialIds.forEach((materialId) => {
        allNodes
          .filter((n) => n.id === materialId)
          .select(".node-background")
          .attr("stroke", CONFIG.graph.colors.nodeStrokeHighlight)
          .attr("stroke-width", CONFIG.graph.sizes.strokeWidthMedium);
      });

      const allConnectedIds = new Set([node.id, ...connectedMaterialIds]);

      allNodes.style("opacity", (n) =>
        allConnectedIds.has(n.id) ? CONFIG.graph.opacities.default : CONFIG.graph.opacities.dimmed,
      );

      d3.selectAll(".link-group").style("opacity", (l) =>
        allConnectedIds.has(l.source.id) && allConnectedIds.has(l.target.id)
          ? l.type === "tag-association"
            ? CONFIG.graph.opacities.tagAssociation
            : CONFIG.graph.opacities.default
          : CONFIG.graph.opacities.veryDimmed,
      );
    }
  }

  _getConnectedNodeIds(nodeId, nodeType, linkArray) {
    const connected = new Set([nodeId]);

    if (nodeType === "material" || nodeType === "tag") {
      const connectedReactions = new Set();
      linkArray.forEach((link) => {
        if (link.source.id === nodeId && link.target.type === "reaction") {
          connectedReactions.add(link.target.id);
        }
        if (link.target.id === nodeId && link.source.type === "reaction") {
          connectedReactions.add(link.source.id);
        }
      });

      connectedReactions.forEach((id) => connected.add(id));

      connectedReactions.forEach((reactionId) => {
        linkArray.forEach((link) => {
          if (link.source.id === reactionId && (link.target.type === "material" || link.target.type === "tag")) {
            connected.add(link.target.id);
          }
          if (link.target.id === reactionId && (link.source.type === "material" || link.source.type === "tag")) {
            connected.add(link.source.id);
          }
        });
      });

      if (nodeType === "tag") {
        const materialIds = this.dataRepo.resolveTag(nodeId);
        materialIds.forEach((materialId) => connected.add(materialId));
      }
    }

    return connected;
  }

  _resetHighlighting(allNodes) {
    allNodes.style("opacity", CONFIG.graph.opacities.default);

    d3.selectAll(".link-group").style("opacity", (d) => {
      if (d.type === "tag-association") return CONFIG.graph.opacities.tagAssociation;
      return CONFIG.graph.opacities.linkDefault;
    });

    allNodes
      .select(".node-background, .reaction-circle")
      .attr("stroke", CONFIG.graph.colors.nodeStroke)
      .attr("stroke-width", CONFIG.graph.sizes.strokeWidth);
  }

  _handleResize(container, svg) {
    const width = container.clientWidth;
    const height = Math.max(CONFIG.graph.layout.minHeight, width * CONFIG.graph.layout.heightRatio);

    svg.attr("width", width).attr("height", height).attr("viewBox", `0 0 ${width} ${height}`);
  }
}
