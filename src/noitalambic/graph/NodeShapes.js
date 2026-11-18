// ============================================================================
// NODE SHAPES - What material, tag and reaction nodes are drawn with
// ============================================================================
// Builds each kind of node inside its <g>, and refreshes the parts that depend on the rest of the
// graph (highlight rings, tag visibility, reaction origin rings) without rebuilding the node.
// Part of GraphRenderer, which owns the SVG and the simulation: reached through this.r.

import * as d3 from "d3";
import { CONFIG } from "../config/config.js";
import { UIHelper } from "../ui/UIHelper.js";
import { icon } from "../../ui/icons.js";
import { formatCombo } from "../core/ShortcutManager.js";

export class NodeShapes {
  constructor(renderer) {
    this.r = renderer;
  }

  createMaterial(node, selection, linkArray) {
    // Highlight (dynamic - refreshed independently via _updateMaterialHighlight so it can be
    // kept in sync without rebuilding the rest of the node)
    selection
      .append("circle")
      .attr("r", node.radius + 4)
      .attr("fill", "transparent")
      .attr("stroke-width", 2)
      .attr("class", "material-highlight");
    this.updateMaterialHighlight(node, selection, linkArray);

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
      .attr("x", -CONFIG.graph.layout.textureSize * CONFIG.graph.layout.imageScale / 2)
      .attr("y", -CONFIG.graph.layout.textureSize * CONFIG.graph.layout.imageScale / 2)
      .attr("width", CONFIG.graph.layout.textureSize * CONFIG.graph.layout.imageScale)
      .attr("height", CONFIG.graph.layout.textureSize * CONFIG.graph.layout.imageScale)
      .attr("preserveAspectRatio", "xMidYMid slice")
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
  updateMaterialHighlight(node, selection, linkArray) {
    const isDirectMaterial = this.r._isMaterialDirectlyInvolved(node.id, linkArray);
    const isSelected = this.r.state.selectedReagents.includes(node.id) || this.r.state.selectedProduct === node.id;

    selection
      .select(":scope > circle.material-highlight")
      .attr("stroke", () => {
        if (isSelected) return CONFIG.graph.colors.selectedHighlight;
        if (isDirectMaterial) return CONFIG.graph.colors.directMaterialHighlight;
        return "transparent";
      })
      .style("opacity", isSelected || isDirectMaterial ? 1 : 0);
  }

  createTag(node, selection) {
    // Background
    selection
      .append("circle")
      .attr("r", node.radius)
      .attr("fill", node.color)
      .attr("stroke", CONFIG.graph.colors.nodeStroke)
      .attr("stroke-width", CONFIG.graph.sizes.strokeWidth)
      .attr("class", "node-background");

    // Icon is inserted (and swapped on visibility change) by _updateTagNode below.

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

    this.updateTag(node, selection);
  }

  // Icon/border color and tooltip depend on this.r.state.visibleTagMaterials, which can change
  // (tag menu) independently of the tag node itself entering or leaving the visible set.
  updateTag(node, selection) {
    const materialIds = this.r.dataRepo.resolveTag(node.id);
    const hasVisibleMaterials = materialIds.some((id) => this.r.state.visibleTagMaterials.has(id));

    selection.select(":scope > .tag-visibility-icon").remove();
    selection
      .insert(() => icon(hasVisibleMaterials ? 'eye' : 'eye-slash'), ":scope > circle.tag-border")
      .attr("width", node.radius).attr("height", node.radius)
      .attr("x", -node.radius / 2).attr("y", -node.radius / 2)
      .style("color", "var(--bg-body)")
      .classed("tag-visibility-icon", true);

    selection
      .select(":scope > circle.tag-border")
      .attr("stroke", hasVisibleMaterials ? CONFIG.graph.colors.tagVisible : CONFIG.graph.colors.tagHidden);

    const visibleCount = materialIds.filter((id) => this.r.state.visibleTagMaterials.has(id)).length;
    const totalCount = materialIds.length;
    const tagName = node.tag;

    let tooltipText;
    if (visibleCount === totalCount) {
      tooltipText = `Tag: [${tagName}]\nAll ${totalCount} materials visible`;
    } else if (visibleCount > 0) {
      tooltipText = `Tag: [${tagName}]\n${visibleCount} of ${totalCount} materials visible`;
    } else {
      tooltipText = `Tag: [${tagName}]\nAll ${totalCount} materials hidden`;
    }
    const toggleCombo = this.r.shortcutManager.getBinding("toggleTagMaterials");
    const menuCombo = this.r.shortcutManager.getBinding("openTagMenu");
    if (toggleCombo) tooltipText += `\n${formatCombo(toggleCombo)}: ${visibleCount === totalCount ? "hide" : "show"} them all`;
    if (menuCombo) tooltipText += `\n${formatCombo(menuCombo)}: actions menu`;

    selection.select(":scope > title").text(tooltipText);
  }

  createReaction(node, selection) {
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
    this.updateReactionOriginRing(node, selection);
  }

  // Draws the origin ring (which reaction set(s) this reaction currently comes from - a single
  // contributing set draws a solid colored ring, several draw a pie of colored segments) and the
  // tooltip. Any previous ring is removed first so this is safe to call again for a persisting
  // node whose contributing set(s) changed (e.g. after enabling/disabling a sibling set that
  // also matched this same reaction).
  updateReactionOriginRing(node, selection) {
    selection.selectAll(".reaction-origin-ring, .reaction-origin-ring-segment").remove();
    if (node.setColors && node.setColors.length > 0) {
      this.createReactionOriginRing(node, selection);
    }

    const inputs = [node.reaction.reagent1, node.reaction.reagent2, node.reaction.reagent3]
      .filter(Boolean)
      .map((id) => UIHelper.getMaterialName(id, this.r.dataRepo))
      .join(" + ");

    const outputs = [node.reaction.product1, node.reaction.product2, node.reaction.product3]
      .filter(Boolean)
      .map((id) => UIHelper.getMaterialName(id, this.r.dataRepo))
      .join(" + ");

    let tooltipText = `Reaction (Speed: ${node.reaction.reactionRate})\n${inputs} → ${outputs}`;
    if (node.setNames && node.setNames.length > 0) {
      tooltipText += `\nSets: ${node.setNames.join(", ")}`;
    }

    selection.select(":scope > title").text(tooltipText);
  }

  // Draws a ring of colored segments (one per contributing reaction set) around a reaction node.
  createReactionOriginRing(node, selection) {
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
}
