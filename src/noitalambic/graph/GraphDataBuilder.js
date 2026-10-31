// ============================================================================
// GRAPH DATA BUILDER - Constructs nodes and links for D3 visualization
// ============================================================================

import { CONFIG } from "../config/config.js";
import { UIHelper } from "../ui/UIHelper.js";

export class GraphDataBuilder {
  constructor(dataRepo) {
    this.dataRepo = dataRepo;
  }

  // filteredReactions accepts two shapes for backward compatibility:
  //  - a plain array of reaction objects (legacy single-selection mode), or
  //  - an array of {reaction, index, setIds, colors, names} entries produced by
  //    ReactionSetResolver.resolve() for the multi-set union/intersection/difference feature.
  // In the legacy shape, the reaction node id is derived from the array position (unchanged
  // behavior). In the entry shape, the *original* dataRepo index is used instead, which is what
  // allows several reaction sets to be merged/deduplicated correctly by the resolver.
  buildGraphData(filteredReactions) {
    const entries = filteredReactions.map((item, position) =>
      item && item.reaction ? item : { reaction: item, index: position, setIds: [], colors: [], names: [] },
    );

    const nodes = new Map();
    const links = [];
    const linkKeys = new Set();

    entries.forEach(({ reaction, index, setIds, colors, names }) => {
      const reactionId = `reaction_${index}`;
      nodes.set(reactionId, {
        id: reactionId,
        type: "reaction",
        reaction,
        radius: CONFIG.graph.sizes.reactionRadius,
        color: CONFIG.graph.colors.reactionNode,
        // Which reaction set(s) this reaction came from, used to draw the origin ring.
        setIds: setIds || [],
        setColors: colors || [],
        setNames: names || [],
      });

      this._processFields(
        [reaction.reagent1, reaction.reagent2, reaction.reagent3],
        reactionId,
        "input",
        nodes,
        links,
        linkKeys,
        (tagId, reactionId, index) => ({ source: tagId, target: reactionId, type: "input", index }),
        (materialId, reactionId, index) => ({ source: materialId, target: reactionId, type: "input", index }),
        (materialId, tagId, index) => ({ source: materialId, target: tagId, type: "tag-association", index }),
      );

      this._processFields(
        [reaction.product1, reaction.product2, reaction.product3],
        reactionId,
        "output",
        nodes,
        links,
        linkKeys,
        (tagId, reactionId, index) => ({ source: reactionId, target: tagId, type: "output", index }),
        (materialId, reactionId, index) => ({ source: reactionId, target: materialId, type: "output", index }),
        (materialId, tagId, index) => ({ source: tagId, target: materialId, type: "tag-association", index }),
      );
    });

    return { nodes, links };
  }

  _processFields(fields, reactionId, direction, nodes, links, linkKeys, tagLinkFn, materialLinkFn, assocLinkFn) {
    fields.filter(Boolean).forEach((fieldId, index) => {
      if (this.dataRepo.isTag(fieldId)) {
        this._addTagNode(fieldId, nodes);
        this._addLinkIfUnique(tagLinkFn(fieldId, reactionId, index), links, linkKeys);

        this.dataRepo.resolveTag(fieldId).forEach((materialId) => {
          this._addMaterialNode(materialId, nodes, true, fieldId);
          this._addLinkIfUnique(assocLinkFn(materialId, fieldId, index), links, linkKeys);
        });
      } else {
        this._addMaterialNode(fieldId, nodes, false);
        this._addLinkIfUnique(materialLinkFn(fieldId, reactionId, index), links, linkKeys);
      }
    });
  }

  _addLinkIfUnique(link, links, linkKeys) {
    const key = `${link.source}-${link.target}-${link.type}`;
    if (!linkKeys.has(key)) {
      linkKeys.add(key);
      links.push(link);
    }
  }

  _addMaterialNode(materialId, nodes, isTagMaterial, parentTag = null) {
    if (!nodes.has(materialId)) {
      const material = this.dataRepo.getMaterial(materialId);
      nodes.set(materialId, {
        id: materialId,
        type: "material",
        material,
        radius: CONFIG.graph.sizes.materialRadius,
        color: material?.color || CONFIG.graph.colors.materialNodeDefault,
        imageUrl: UIHelper.getMaterialImageUrl(materialId, this.dataRepo),
        name: material?.name || materialId,
        isTagMaterial,
        parentTag,
      });
    }
  }

  _addTagNode(tagId, nodes) {
    if (!nodes.has(tagId)) {
      nodes.set(tagId, {
        id: tagId,
        type: "tag",
        tag: tagId.slice(1, -1),
        radius: CONFIG.graph.sizes.tagRadius,
        color: CONFIG.graph.colors.tagNode,
        imageUrl: UIHelper.getMaterialImageUrl(tagId, this.dataRepo),
        name: UIHelper.getMaterialName(tagId, this.dataRepo),
      });
    }
  }

  filterVisibleNodes(nodeArray, state) {
    return nodeArray.filter((node) => {
      if (state.selectedReagents.includes(node.id) || state.selectedProduct === node.id) return true;
      if (node.type === "tag" || node.type === "reaction") return true;
      if (node.type === "material" && !node.isTagMaterial) return true;
      if (node.type === "material" && node.isTagMaterial) {
        return state.visibleTagMaterials.has(node.id);
      }
      return true;
    });
  }

  filterVisibleLinks(linkArray, visibleNodes) {
    const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));
    return linkArray.filter((link) => visibleNodeIds.has(link.source.id) && visibleNodeIds.has(link.target.id));
  }
}
