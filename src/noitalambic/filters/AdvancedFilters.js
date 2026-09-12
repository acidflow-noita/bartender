// ============================================================================
// ADVANCED FILTERS - Pure predicate helpers for fine-grained reaction filtering
// ============================================================================
// This module has no DOM dependency so it can be unit-tested directly with Node.

export const AdvancedFilters = {
  getInputFields(reaction) {
    return [reaction.reagent1, reaction.reagent2, reaction.reagent3].filter(Boolean);
  },

  getOutputFields(reaction) {
    return [reaction.product1, reaction.product2, reaction.product3].filter(Boolean);
  },

  // Resolves a list of raw identifiers (materials or [tags]) into a Set of concrete material ids.
  resolveFields(fields, dataRepo) {
    const resolved = new Set();
    fields.forEach((field) => {
      dataRepo.resolveTag(field).forEach((id) => resolved.add(id));
    });
    return resolved;
  },

  // A "catalyst" reaction is one where at least one material is present both as an input
  // and as an output (it is consumed and regenerated, or simply unaffected by the reaction).
  isCatalystReaction(reaction, dataRepo) {
    const inputs = this.resolveFields(this.getInputFields(reaction), dataRepo);
    const outputs = this.resolveFields(this.getOutputFields(reaction), dataRepo);

    for (const id of inputs) {
      if (outputs.has(id)) return true;
    }
    return false;
  },

  // Returns the list of material ids that are shared between inputs and outputs of a reaction.
  getCatalystMaterialIds(reaction, dataRepo) {
    const inputs = this.resolveFields(this.getInputFields(reaction), dataRepo);
    const outputs = this.resolveFields(this.getOutputFields(reaction), dataRepo);
    return [...inputs].filter((id) => outputs.has(id));
  },

  // Evaluates a reaction against a bag of advanced filter options.
  // Every option is optional; an empty/undefined filters object always matches.
  matches(reaction, dataRepo, filters = {}) {
    if (!filters) return true;

    const inputFields = this.getInputFields(reaction);
    const outputFields = this.getOutputFields(reaction);

    if (filters.excludeCatalysts && this.isCatalystReaction(reaction, dataRepo)) return false;
    if (filters.onlyCatalysts && !this.isCatalystReaction(reaction, dataRepo)) return false;

    if (typeof filters.minReagentCount === "number" && inputFields.length < filters.minReagentCount) return false;
    if (typeof filters.maxReagentCount === "number" && inputFields.length > filters.maxReagentCount) return false;
    if (typeof filters.minProductCount === "number" && outputFields.length < filters.minProductCount) return false;
    if (typeof filters.maxProductCount === "number" && outputFields.length > filters.maxProductCount) return false;

    if (filters.requireTags?.length) {
      const allFields = [...inputFields, ...outputFields];
      const hasAllRequiredTags = filters.requireTags.every((tag) => allFields.includes(`[${tag}]`));
      if (!hasAllRequiredTags) return false;
    }

    if (filters.excludeTags?.length) {
      const allFields = [...inputFields, ...outputFields];
      const hasExcludedTag = filters.excludeTags.some((tag) => allFields.includes(`[${tag}]`));
      if (hasExcludedTag) return false;
    }

    if (filters.materialTypeIn?.length) {
      const inputMaterialIds = this.resolveFields(inputFields, dataRepo);
      const hasMatchingType = [...inputMaterialIds].some((id) =>
        filters.materialTypeIn.includes(dataRepo.getMaterial(id)?.type),
      );
      if (!hasMatchingType) return false;
    }

    if (filters.materialTypeOut?.length) {
      const outputMaterialIds = this.resolveFields(outputFields, dataRepo);
      const hasMatchingType = [...outputMaterialIds].some((id) =>
        filters.materialTypeOut.includes(dataRepo.getMaterial(id)?.type),
      );
      if (!hasMatchingType) return false;
    }

    if (filters.nameSearch && filters.nameSearch.trim()) {
      const term = filters.nameSearch.trim().toLowerCase();
      const involvedIds = [
        ...this.resolveFields(inputFields, dataRepo),
        ...this.resolveFields(outputFields, dataRepo),
      ];
      const found = involvedIds.some((id) => {
        const material = dataRepo.getMaterial(id);
        return material?.name?.toLowerCase().includes(term) || id.toLowerCase().includes(term);
      });
      if (!found) return false;
    }

    return true;
  },
};
