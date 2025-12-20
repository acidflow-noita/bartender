// ============================================================================
// DATA REPOSITORY - Manages materials, reactions, and tags
// ============================================================================

export class DataRepository {
    constructor(materials, reactionSources, materialAssociations) {
        this.materialsMap = new Map(materials.map(m => [m.id, m]));
        this.reactionSources = reactionSources;
        this.currentSource = "base";
        this.reactions = reactionSources["base"].reactions;
        this.tagToMaterialsMap = this._buildTagMap(materialAssociations);
        this._rebuildIndexes();
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
            count: source.reactions.length
        }));
    }

    _rebuildIndexes() {
        this.inputIndex = this._buildIndex(r => [r.reagent1, r.reagent2, r.reagent3]);
        this.outputIndex = this._buildIndex(r => [r.product1, r.product2, r.product3]);
    }

    _buildTagMap(associations) {
        const map = new Map();
        associations.forEach(assoc => {
            if (!map.has(assoc.tag)) map.set(assoc.tag, []);
            map.get(assoc.tag).push(assoc.id);
        });
        return map;
    }

    _buildIndex(getFields) {
        const index = new Map();
        this.reactions.forEach((reaction, reactionIndex) => {
            getFields(reaction).filter(Boolean).forEach(field => {
                this.resolveTag(field).forEach(resolvedId => {
                    if (!index.has(resolvedId)) index.set(resolvedId, []);
                    index.get(resolvedId).push(reactionIndex);
                });
            });
        });
        return index;
    }

    isTag(identifier) {
        return identifier?.startsWith('[') && identifier?.endsWith(']');
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