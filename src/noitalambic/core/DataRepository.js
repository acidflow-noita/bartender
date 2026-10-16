// ============================================================================
// DATA REPOSITORY - Manages materials, reactions, and tags
// ============================================================================

import {getUnusedMaterialIds, reactionUsesUnusedMaterial} from "../../components/materialAvailability.js";

export class DataRepository {
  constructor(materials, reactionSources, materialAssociations, materialAvailability) {
    this.materialsMap = new Map(materials.map((m) => [m.id, m]));
    this.reactionSources = reactionSources;
    this.currentSource = "base";
    this.reactions = reactionSources["base"].reactions;
    this.tagToMaterialsMap = this._buildTagMap(materialAssociations);
    this.unusedMaterialIds = getUnusedMaterialIds(materialAvailability);
    this.excludeUnusedMaterials = true;
    this._rebuildIndexes();
  }

  setExcludeUnusedMaterials(enabled) {
    this.excludeUnusedMaterials = !!enabled;
    this._rebuildIndexes();
  }

  isMaterialAvailable(id) {
    return !(this.currentSource === "base" && this.excludeUnusedMaterials && this.unusedMaterialIds.has(id));
  }

  isReactionAvailable(reaction) {
    return this.currentSource !== "base" || !this.excludeUnusedMaterials ||
      !reactionUsesUnusedMaterial(reaction, this.unusedMaterialIds,
        (id) => this.resolveTag(id, {includeUnused: true}));
  }

  setReactionSource(sourceId) {
    if (!this.reactionSources[sourceId]) {
      console.error(`Unknown reaction source: ${sourceId}`);
      return false;
    }

    this.currentSource = sourceId;
    this.reactions = this.reactionSources[sourceId].reactions;
    this._rebuildIndexes();
    return true;
  }

  getAvailableSources() {
    return Object.entries(this.reactionSources).map(([id, source]) => ({
      id,
      name: source.name,
      count: source.reactions.length,
    }));
  }

  _rebuildIndexes() {
    this.inputIndex = this._buildIndex((r) => [r.reagent1, r.reagent2, r.reagent3]);
    this.outputIndex = this._buildIndex((r) => [r.product1, r.product2, r.product3]);
  }

  _buildTagMap(associations) {
    const map = new Map();
    associations.forEach((assoc) => {
      if (!map.has(assoc.tag)) map.set(assoc.tag, []);
      map.get(assoc.tag).push(assoc.id);
    });
    return map;
  }

  _buildIndex(getFields) {
    const index = new Map();
    this.reactions.forEach((reaction, reactionIndex) => {
      if (!this.isReactionAvailable(reaction)) return;
      getFields(reaction)
        .filter(Boolean)
        .forEach((field) => {
          this.resolveTag(field).forEach((resolvedId) => {
            if (!index.has(resolvedId)) index.set(resolvedId, []);
            index.get(resolvedId).push(reactionIndex);
          });
        });
    });
    return index;
  }

  isTag(identifier) {
    return identifier?.startsWith("[") && identifier?.endsWith("]");
  }

  resolveTag(identifier, {includeUnused = false} = {}) {
    const ids = this.isTag(identifier) ? this.tagToMaterialsMap.get(identifier.slice(1, -1)) || [] : [identifier];
    return includeUnused ? ids : ids.filter((id) => this.isMaterialAvailable(id));
  }

  getMaterial(id) {
    return this.materialsMap.get(id);
  }

  getReaction(index) {
    return this.reactions[index];
  }

  getReactionsWithInput(materialId) {
    return this.inputIndex.get(materialId) || [];
  }

  getReactionsWithOutput(materialId) {
    return this.outputIndex.get(materialId) || [];
  }
}
