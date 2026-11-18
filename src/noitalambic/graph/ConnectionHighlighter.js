// ============================================================================
// CONNECTION HIGHLIGHTER - Clicking a node highlights what it connects to
// ============================================================================
// Dims everything else; reset() restores the plain look. without(fn) runs fn on the plain look
// (exports) and puts the highlight back.
// Part of GraphRenderer, which owns the SVG and the simulation: reached through this.r.

import * as d3 from "d3";
import { CONFIG } from "../config/config.js";

export class ConnectionHighlighter {
  constructor(renderer) {
    this.r = renderer;
    this.current = null; // {node, allNodes, linkArray}
  }

  // Runs fn() with the graph in its plain, un-highlighted look, then restores the current
  // highlight. Everything happens synchronously, so the intermediate state is never painted.
  without(fn) {
    const highlight = this.current;
    if (!highlight) return fn();
    this.reset(highlight.allNodes);
    try {
      return fn();
    } finally {
      this.highlight(highlight.node, highlight.allNodes, highlight.linkArray);
    }
  }

  highlight(node, allNodes, linkArray) {
    this.reset(allNodes);
    this.current = { node, allNodes, linkArray };

    if (node.type === "material" || node.type === "tag") {
      allNodes
        .filter((n) => n.id === node.id)
        .select(".node-background")
        .attr("stroke", CONFIG.graph.colors.nodeStrokeHighlight)
        .attr("stroke-width", CONFIG.graph.sizes.strokeWidthHighlight);

      if (node.type === "tag") {
        const materialIds = this.r.dataRepo.resolveTag(node.id);
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

      const allConnectedIds = this.connectedNodeIds(node.id, node.type, linkArray);

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

  connectedNodeIds(nodeId, nodeType, linkArray) {
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
        const materialIds = this.r.dataRepo.resolveTag(nodeId);
        materialIds.forEach((materialId) => connected.add(materialId));
      }
    }

    return connected;
  }

  reset(allNodes) {
    this.current = null;
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
}
