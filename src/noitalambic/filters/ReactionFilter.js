// ============================================================================
// REACTION FILTER - Filters reactions based on selected criteria
// ============================================================================

import { AdvancedFilters } from "./AdvancedFilters.js";

export class ReactionFilter {
  constructor(dataRepo) {
    this.dataRepo = dataRepo;
  }

  getFilteredReactions(selectedReagents = [], selectedProduct = "", minSpeed = 0) {
    let indices = this._computeBaseIndices(selectedReagents, selectedProduct);

    // Filter by minimum reaction speed
    if (minSpeed > 0) {
      indices = new Set(
        [...indices].filter((index) => {
          const reaction = this.dataRepo.getReaction(index);
          return reaction.reactionRate >= minSpeed;
        }),
      );
    }

    return Array.from(indices)
      .map((index) => this.dataRepo.getReaction(index))
      .sort((a, b) => b.reactionRate - a.reactionRate);
  }

  // Advanced, multi-set-aware variant of getFilteredReactions.
  // Unlike getFilteredReactions, it returns {index, reaction} pairs (the original index in
  // dataRepo.reactions is preserved) so that results from several reaction sets can later be
  // merged/deduplicated by a resolver without ambiguity, and it accepts a richer criteria object
  // supporting a speed range plus the advanced filters from AdvancedFilters.matches().
  getFilteredReactionsAdvanced(criteria = {}) {
    const { reagents = [], product = "", minSpeed = 0, maxSpeed = 0, advancedFilters = {} } = criteria;

    let indices = this._computeBaseIndices(reagents, product);

    indices = new Set(
      [...indices].filter((index) => {
        const reaction = this.dataRepo.getReaction(index);
        if (minSpeed > 0 && reaction.reactionRate < minSpeed) return false;
        if (maxSpeed > 0 && reaction.reactionRate > maxSpeed) return false;
        return AdvancedFilters.matches(reaction, this.dataRepo, advancedFilters);
      }),
    );

    return Array.from(indices)
      .map((index) => ({ index, reaction: this.dataRepo.getReaction(index) }))
      .sort((a, b) => b.reaction.reactionRate - a.reaction.reactionRate);
  }

  // Shared reagent/product matching logic used by both filtering methods above.
  _computeBaseIndices(selectedReagents, selectedProduct) {
    let indices = new Set(Array.from({ length: this.dataRepo.reactions.length }, (_, i) => i));

    if (selectedProduct) {
      const productReactions = new Set(this.dataRepo.getReactionsWithOutput(selectedProduct));
      indices = new Set([...indices].filter((x) => productReactions.has(x)));
    }

    if (selectedReagents.length > 0) {
      selectedReagents.forEach((reagent) => {
        const reagentReactions = new Set(this.dataRepo.getReactionsWithInput(reagent));
        indices = new Set([...indices].filter((x) => reagentReactions.has(x)));
      });

      indices = new Set(
        [...indices].filter((index) => {
          const reaction = this.dataRepo.getReaction(index);
          const reactionInputs = [reaction.reagent1, reaction.reagent2, reaction.reagent3].filter(Boolean);

          const possibleAssignments = selectedReagents.map((reagent) => {
            return reactionInputs.filter((slot) => {
              if (this.dataRepo.isTag(slot)) {
                return this.dataRepo.resolveTag(slot).includes(reagent);
              }
              return slot === reagent;
            });
          });

          return this._canAssignWithoutConflict(possibleAssignments);
        }),
      );
    }

    return indices;
  }

  _canAssignWithoutConflict(possibleAssignments) {
    const backtrack = (index, usedSlots) => {
      if (index >= possibleAssignments.length) return true;

      for (const slot of possibleAssignments[index]) {
        if (!usedSlots.has(slot)) {
          usedSlots.add(slot);
          if (backtrack(index + 1, usedSlots)) return true;
          usedSlots.delete(slot);
        }
      }
      return false;
    };

    return backtrack(0, new Set());
  }

  getAvailableReagents(selectedReagents = [], selectedProduct = "") {
    if (!selectedProduct && selectedReagents.length === 0) {
      return this._createChoices(Array.from(this.dataRepo.inputIndex.keys()));
    }

    let indices = selectedProduct
      ? new Set(this.dataRepo.getReactionsWithOutput(selectedProduct))
      : new Set(Array.from({ length: this.dataRepo.reactions.length }, (_, i) => i));

    if (selectedReagents.length > 0) {
      selectedReagents.forEach((reagent) => {
        const reagentReactions = new Set(this.dataRepo.getReactionsWithInput(reagent));
        indices = new Set([...indices].filter((x) => reagentReactions.has(x)));
      });
    }

    const availableIds = new Set();
    indices.forEach((index) => {
      const reaction = this.dataRepo.getReaction(index);
      [reaction.reagent1, reaction.reagent2, reaction.reagent3]
        .filter(Boolean)
        .flatMap((id) => this.dataRepo.resolveTag(id))
        .forEach((id) => availableIds.add(id));
    });

    return this._createChoices(Array.from(availableIds));
  }

  getAvailableProducts(selectedReagents = []) {
    if (selectedReagents.length === 0) {
      return this._createChoices(Array.from(this.dataRepo.outputIndex.keys()));
    }

    let indices = new Set(Array.from({ length: this.dataRepo.reactions.length }, (_, i) => i));

    selectedReagents.forEach((reagent) => {
      const reagentReactions = new Set(this.dataRepo.getReactionsWithInput(reagent));
      indices = new Set([...indices].filter((x) => reagentReactions.has(x)));
    });

    const availableIds = new Set();
    indices.forEach((index) => {
      const reaction = this.dataRepo.getReaction(index);
      [reaction.product1, reaction.product2, reaction.product3]
        .filter(Boolean)
        .flatMap((id) => this.dataRepo.resolveTag(id))
        .forEach((id) => availableIds.add(id));
    });

    return this._createChoices(Array.from(availableIds));
  }

  _createChoices(materialIds) {
    return materialIds
      .filter((id) => !this.dataRepo.isTag(id))
      .map((id) => {
        const material = this.dataRepo.getMaterial(id);
        return material
          ? {
              value: id,
              label: `${material.name} (${id})`,
              name: material.name,
              type: material.type || "",
            }
          : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name));
  }
}
