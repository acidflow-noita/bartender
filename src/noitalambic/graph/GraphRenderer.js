// ============================================================================
// GRAPH RENDERER - D3.js visualization of reactions graph
// ============================================================================

import { CONFIG } from "../config/config.js";
import { UIHelper } from "../ui/UIHelper.js";

export class GraphRenderer {
  constructor(dataRepo, state, graphDataBuilder) {
    this.dataRepo = dataRepo;
    this.state = state;
    this.graphDataBuilder = graphDataBuilder;
    this.currentCleanup = null;
  }

  render(filteredReactions) {
    const container = document.getElementById("tableContainer");
    container.innerHTML = "";

    if (this.currentCleanup) {
      this.currentCleanup();
      this.currentCleanup = null;
    }

    if (filteredReactions.length === 0) {
      container.innerHTML = `<div style="text-align: center; padding: 2rem; color: ${CONFIG.graph.colors.textLight};">No reactions found with current filters</div>`;
      return;
    }

    if (filteredReactions.length >= CONFIG.graph.constraints.maxReactions) {
      container.innerHTML = `<div style="text-align: center; padding: 2rem; color: ${CONFIG.graph.colors.textLight};">Too many reactions with current filters</div>`;
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

    const { svg, g } = this._createSVG(container, width, height);
    this._createArrowMarkers(svg);

    const linkGroups = this._createLinks(g, visibleLinks);
    const simulation = this._createSimulation(visibleNodes, visibleLinks, width, height);
    const nodeSelection = this._createNodes(g, visibleNodes, linkArray, simulation);

    simulation.on("tick", () => {
      linkGroups
        .selectAll("line")
        .attr("x1", (d) => d.source.x)
        .attr("y1", (d) => d.source.y)
        .attr("x2", (d) => d.target.x)
        .attr("y2", (d) => d.target.y);

      nodeSelection.attr("transform", (d) => `translate(${d.x},${d.y})`);
    });

    const resizeHandler = () => this._handleResize(container, svg);
    window.addEventListener("resize", resizeHandler);

    this.currentCleanup = () => {
      window.removeEventListener("resize", resizeHandler);
      simulation.stop();
    };
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

  _createLinks(g, visibleLinks) {
    const linkGroups = g
      .append("g")
      .attr("class", "links")
      .selectAll("g")
      .data(visibleLinks)
      .join("g")
      .attr("class", (d) => `link-group ${d.type}-link`)
      .style("opacity", (d) =>
        d.type === "tag-association" ? CONFIG.graph.opacities.tagAssociation : CONFIG.graph.opacities.linkDefault,
      );

    linkGroups
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

  _createNodes(g, visibleNodes, linkArray, simulation) {
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

    const nodeSelection = g
      .append("g")
      .selectAll("g")
      .data(visibleNodes)
      .join("g")
      .attr("class", (d) => `node ${d.type}-node`)
      .call(drag);

    // Create material nodes
    nodeSelection
      .filter((d) => d.type === "material")
      .each((d, i, nodes) => {
        const selection = d3.select(nodes[i]);
        this._createMaterialNode(d, selection, linkArray);
      });

    // Create tag nodes
    nodeSelection
      .filter((d) => d.type === "tag")
      .each((d, i, nodes) => {
        const selection = d3.select(nodes[i]);
        this._createTagNode(d, selection);
      });

    // Create reaction nodes
    nodeSelection
      .filter((d) => d.type === "reaction")
      .each((d, i, nodes) => {
        const selection = d3.select(nodes[i]);
        this._createReactionNode(d, selection);
      });

    // Add click handlers
    nodeSelection.on("click", (event, d) => this._handleNodeClick(event, d, nodeSelection, linkArray));

    return nodeSelection;
  }

  _createMaterialNode(node, selection, linkArray) {
    const isDirectMaterial = this._isMaterialDirectlyInvolved(node.id, linkArray);

    // Highlight
    selection
      .append("circle")
      .attr("r", node.radius + 4)
      .attr("fill", "transparent")
      .attr("stroke", () => {
        if (this.state.selectedReagents.includes(node.id) || this.state.selectedProduct === node.id) {
          return CONFIG.graph.colors.selectedHighlight;
        }
        if (isDirectMaterial) return CONFIG.graph.colors.directMaterialHighlight;
        return "transparent";
      })
      .attr("stroke-width", 2)
      .attr("class", "material-highlight")
      .style(
        "opacity",
        this.state.selectedReagents.includes(node.id) || this.state.selectedProduct === node.id || isDirectMaterial
          ? 1
          : 0,
      );

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

  _createTagNode(node, selection) {
    const materialIds = this.dataRepo.resolveTag(node.id);
    const hasVisibleMaterials = materialIds.some((id) => this.state.visibleTagMaterials.has(id));

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
      .attr(
        "href",
        hasVisibleMaterials
          ? `${CONFIG.urls.imageBase}/images/icons/eye-open.svg`
          : `${CONFIG.urls.imageBase}/images/icons/eye-closed.svg`,
      )
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
      .attr("stroke", hasVisibleMaterials ? CONFIG.graph.colors.tagVisible : CONFIG.graph.colors.tagHidden)
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

    // Tooltip
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

    selection.append("title").text(tooltipText);
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

    // Tooltip
    const inputs = [node.reaction.reagent1, node.reaction.reagent2, node.reaction.reagent3]
      .filter(Boolean)
      .map((id) => UIHelper.getMaterialName(id, this.dataRepo))
      .join(" + ");

    const outputs = [node.reaction.product1, node.reaction.product2, node.reaction.product3]
      .filter(Boolean)
      .map((id) => UIHelper.getMaterialName(id, this.dataRepo))
      .join(" + ");

    selection.append("title").text(`Reaction (Speed: ${node.reaction.reactionRate})\n${inputs} → ${outputs}`);
  }

  _handleNodeClick(event, node, allNodes, linkArray) {
    event.stopPropagation();

    // Double click on tag
    if (event.detail === 2 && node.type === "tag") {
      this.state.toggleTagVisibility(node.id);
      return;
    }

    // Ctrl+Shift+click → wiki
    if (event.shiftKey && event.ctrlKey && node.type === "material") {
      const wikiUrl = node.material?.wikipage
        ? `${CONFIG.urls.wikiBase}${encodeURIComponent(node.material.wikipage)}`
        : "";

      if (wikiUrl) {
        window.open(wikiUrl, "_blank");
      } else {
        UIHelper.showNotification("No wiki page found for this material");
      }
      return;
    }

    // Shift+click → select as product
    if (!event.ctrlKey && event.shiftKey && node.type === "material") {
      if (this.state.selectProduct(node.id)) {
        this.state.eventBus.emit("stateChanged", this.state);
      } else {
        UIHelper.showNotification("No valid reactions with this product");
      }
      return;
    }

    // Ctrl+click → select as reagent
    if (event.ctrlKey && !event.shiftKey && node.type === "material") {
      if (this.state.selectReagent(node.id)) {
        this.state.eventBus.emit("stateChanged", this.state);
      } else {
        UIHelper.showNotification("No valid reactions with this reagent");
      }
      return;
    }

    // Regular click → highlight
    this._highlightConnections(node, allNodes, linkArray);
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
