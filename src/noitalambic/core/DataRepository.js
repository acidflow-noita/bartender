// ============================================================================
// DATA REPOSITORY - Manages materials, reactions, and tags
// ============================================================================

export class DataRepository {
  constructor(materials, reactionSources, materialAssociations) {
    this.baseMaterialsMap = new Map(materials.map((m) => [m.id, m]));
    this.materialsMap = new Map(this.baseMaterialsMap);
    this.reactionSources = reactionSources;
    this.currentSource = "base";
    this.reactions = reactionSources["base"].reactions;
    this.tagToMaterialsMap = this._buildTagMap(materialAssociations);
    this._rebuildIndexes();
    this._ensureMaterialsExist();
  }

  setReactionSource(sourceId) {
    if (!this.reactionSources[sourceId]) {
      console.error(`Unknown reaction source: ${sourceId}`);
      return false;
    }

    this.currentSource = sourceId;
    this.reactions = this.reactionSources[sourceId].reactions;

    // Merge source-specific materials if they exist
    if (this.reactionSources[sourceId].materials) {
      this.materialsMap = new Map([
        ...this.baseMaterialsMap,
        ...this.reactionSources[sourceId].materials.map((m) => [m.id, m]),
      ]);
    } else {
      this.materialsMap = new Map(this.baseMaterialsMap);
    }

    this._rebuildIndexes();
    this._ensureMaterialsExist();
    return true;
  }

  _ensureMaterialsExist() {
    // Auto-create missing materials referenced in reactions
    const missingMaterials = new Set();

    this.reactions.forEach((reaction) => {
      [reaction.reagent1, reaction.reagent2, reaction.reagent3, reaction.product1, reaction.product2, reaction.product3]
        .filter(Boolean)
        .forEach((id) => {
          if (!this.isTag(id) && !this.materialsMap.has(id)) {
            missingMaterials.add(id);
          }
        });
    });

    // Create placeholder materials for missing ones
    // Using 'air' as the image to avoid broken images
    missingMaterials.forEach((id) => {
      this.materialsMap.set(id, {
        id: id,
        name: id.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
        type: "unknown",
        color: "#808080",
        imageId: "air", // Use air texture for missing materials
      });
    });

    if (missingMaterials.size > 0) {
      console.log(`Created ${missingMaterials.size} placeholder materials for ${this.currentSource}`);
    }
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

  resolveTag(identifier) {
    if (!this.isTag(identifier)) return [identifier];
    const tag = identifier.slice(1, -1);
    return this.tagToMaterialsMap.get(tag) || [];
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
