import {reactionUsesUnusedMaterial} from "../components/materialAvailability.js";

// Filtering extracted unchanged from the original Reactions Finder.
export function createReactionFinder(materials, reactions, unusedMaterials, state) {
const materialsMap = new Map(materials.map((m) => [m.id, m]));

// Build indexes for faster filtering
const reactionInputsIndex = new Map();
const reactionOutputsIndex = new Map();

reactions.forEach((reaction, index) => {
  // Index inputs
  [reaction.input_cell1, reaction.input_cell2, reaction.input_cell3].filter(Boolean).forEach((input) => {
    if (!reactionInputsIndex.has(input)) {
      reactionInputsIndex.set(input, []);
    }
    reactionInputsIndex.get(input).push(index);
  });

  // Index outputs
  [reaction.output_cell1, reaction.output_cell2, reaction.output_cell3].filter(Boolean).forEach((output) => {
    if (!reactionOutputsIndex.has(output)) {
      reactionOutputsIndex.set(output, []);
    }
    reactionOutputsIndex.get(output).push(index);
  });
});
// Special materials to exclude
const specialMaterials = new Set(["mimic_liquid", "midas_precursor", "midas"]);
const isReactionAvailable = (reaction) => !state.excludeUnusedMaterials || !reactionUsesUnusedMaterial(reaction, unusedMaterials);
const clearUnusedSelections = () => {
  if (!state.excludeUnusedMaterials) return;
  state.selectedReagents = state.selectedReagents.filter((id) => !unusedMaterials.has(id));
  if (unusedMaterials.has(state.selectedProduct)) state.selectedProduct = "";
};

// Optimized functions using indexes
const getAvailableReagents = (selectedReagents = [], selectedProduct = "") => {
  if (!selectedProduct && selectedReagents.length === 0) {
    // Return all materials that appear as inputs in reactions
    let availableIds = Array.from(reactionInputsIndex.keys());
    if (state.excludeUnusedMaterials) {
      availableIds = availableIds.filter((id) => !unusedMaterials.has(id) && reactionInputsIndex.get(id).some((index) => isReactionAvailable(reactions[index])));
    }

    // Filter out special materials if needed
    if (state.excludeSpecialMaterials) {
      availableIds = availableIds.filter((id) => !specialMaterials.has(id));
    }

    return availableIds
      .map((id) => {
        const material = materialsMap.get(id);
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

  // Get relevant reaction indices using indexes
  let relevantReactionIndices = new Set();

  if (selectedProduct) {
    const productReactions = reactionOutputsIndex.get(selectedProduct) || [];
    relevantReactionIndices = new Set(productReactions);
  } else {
    relevantReactionIndices = new Set(Array.from({ length: reactions.length }, (_, i) => i));
  }

  if (selectedReagents.length > 0) {
    selectedReagents.forEach((reagent) => {
      const reagentReactions = new Set(reactionInputsIndex.get(reagent) || []);
      relevantReactionIndices = new Set([...relevantReactionIndices].filter((x) => reagentReactions.has(x)));
    });
  }

  // Apply filters to reactions
  if (state.excludeSpecialMaterials || state.onlyPracticalReactions || state.excludeUnusedMaterials) {
    relevantReactionIndices = new Set(
      [...relevantReactionIndices].filter((index) => {
        const reaction = reactions[index];
        if (!isReactionAvailable(reaction)) return false;

        // Filter out low-speed reactions
        if (state.onlyPracticalReactions && reaction.reaction_rate <= 5) {
          return false;
        }

        // Filter out reactions with special materials
        if (state.excludeSpecialMaterials) {
          const allMaterials = [
            reaction.input_cell1,
            reaction.input_cell2,
            reaction.input_cell3,
            reaction.output_cell1,
            reaction.output_cell2,
            reaction.output_cell3,
          ].filter(Boolean);

          if (allMaterials.some((id) => specialMaterials.has(id))) {
            return false;
          }
        }

        return true;
      })
    );
  }

  // Collect all input materials from relevant reactions
  const availableReagentIds = new Set();
  relevantReactionIndices.forEach((index) => {
    const reaction = reactions[index];
    [reaction.input_cell1, reaction.input_cell2, reaction.input_cell3]
      .filter(Boolean)
      .forEach((id) => availableReagentIds.add(id));
  });

  return Array.from(availableReagentIds)
    .map((id) => {
      const material = materialsMap.get(id);
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
};

const getAvailableProducts = (selectedReagents = []) => {
  if (selectedReagents.length === 0) {
    // Return all products from all reactions
    let availableIds = Array.from(reactionOutputsIndex.keys());
    if (state.excludeUnusedMaterials) {
      availableIds = availableIds.filter((id) => !unusedMaterials.has(id) && reactionOutputsIndex.get(id).some((index) => isReactionAvailable(reactions[index])));
    }

    // Filter out special materials if needed
    if (state.excludeSpecialMaterials) {
      availableIds = availableIds.filter((id) => !specialMaterials.has(id));
    }

    return availableIds
      .map((id) => {
        const material = materialsMap.get(id);
        return {
          value: id,
          label: material ? `${material.name} (${id})` : `${id} (${id})`,
          name: material ? material.name : id,
          type: material ? material.type || "" : "",
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  // Get relevant reaction indices using indexes
  let relevantReactionIndices = new Set(Array.from({ length: reactions.length }, (_, i) => i));

  selectedReagents.forEach((reagent) => {
    const reagentReactions = new Set(reactionInputsIndex.get(reagent) || []);
    relevantReactionIndices = new Set([...relevantReactionIndices].filter((x) => reagentReactions.has(x)));
  });

  // Apply filters to reactions
  if (state.excludeSpecialMaterials || state.onlyPracticalReactions || state.excludeUnusedMaterials) {
    relevantReactionIndices = new Set(
      [...relevantReactionIndices].filter((index) => {
        const reaction = reactions[index];
        if (!isReactionAvailable(reaction)) return false;

        // Filter out low-speed reactions
        if (state.onlyPracticalReactions && reaction.reaction_rate <= 5) {
          return false;
        }

        // Filter out reactions with special materials
        if (state.excludeSpecialMaterials) {
          const allMaterials = [
            reaction.input_cell1,
            reaction.input_cell2,
            reaction.input_cell3,
            reaction.output_cell1,
            reaction.output_cell2,
            reaction.output_cell3,
          ].filter(Boolean);

          if (allMaterials.some((id) => specialMaterials.has(id))) {
            return false;
          }
        }

        return true;
      })
    );
  }

  // Collect all output materials from relevant reactions
  const availableProductIds = new Set();
  relevantReactionIndices.forEach((index) => {
    const reaction = reactions[index];
    [reaction.output_cell1, reaction.output_cell2, reaction.output_cell3]
      .filter(Boolean)
      .forEach((id) => availableProductIds.add(id));
  });

  return Array.from(availableProductIds)
    .map((id) => {
      const material = materialsMap.get(id);
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
};

const getFilteredReactions = (selectedReagents = [], selectedProduct = "") => {
  // Use indexes for faster filtering
  let relevantReactionIndices = new Set(Array.from({ length: reactions.length }, (_, i) => i));

  if (selectedProduct) {
    const productReactions = new Set(reactionOutputsIndex.get(selectedProduct) || []);
    relevantReactionIndices = new Set([...relevantReactionIndices].filter((x) => productReactions.has(x)));
  }

  if (selectedReagents.length > 0) {
    selectedReagents.forEach((reagent) => {
      const reagentReactions = new Set(reactionInputsIndex.get(reagent) || []);
      relevantReactionIndices = new Set([...relevantReactionIndices].filter((x) => reagentReactions.has(x)));
    });
  }

  // Apply filters to reactions
  if (state.excludeSpecialMaterials || state.onlyPracticalReactions || state.excludeUnusedMaterials) {
    relevantReactionIndices = new Set(
      [...relevantReactionIndices].filter((index) => {
        const reaction = reactions[index];
        if (!isReactionAvailable(reaction)) return false;

        // Filter out low-speed reactions
        if (state.onlyPracticalReactions && reaction.reaction_rate <= 5) {
          return false;
        }

        // Filter out reactions with special materials
        if (state.excludeSpecialMaterials) {
          const allMaterials = [
            reaction.input_cell1,
            reaction.input_cell2,
            reaction.input_cell3,
            reaction.output_cell1,
            reaction.output_cell2,
            reaction.output_cell3,
          ].filter(Boolean);

          if (allMaterials.some((id) => specialMaterials.has(id))) {
            return false;
          }
        }

        return true;
      })
    );
  }

  // Get filtered reactions
  return Array.from(relevantReactionIndices)
    .map((index) => reactions[index])
    .sort((a, b) => b.reaction_rate - a.reaction_rate);
};
return {getFilteredReactions, getAvailableReagents, getAvailableProducts, clearUnusedSelections, specialMaterials};
}
