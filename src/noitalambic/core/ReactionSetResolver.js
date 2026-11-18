// ============================================================================
// REACTION SET RESOLVER - Combines several reaction sets into one merged result
// ============================================================================
// Given a list of reaction sets and a combine mode, this resolver runs each enabled set through
// ReactionFilter.getFilteredReactionsAdvanced() and merges the results:
//   - "union"        keep every reaction matched by at least one enabled set (default)
//   - "intersection" keep only reactions matched by every enabled set
//   - "difference"   keep only reactions matched by exactly one enabled set (symmetric difference)
// Each merged entry keeps track of which set(s) it came from (id/color/name), which the graph
// renderer uses to draw a small "origin ring" around each reaction node.

export class ReactionSetResolver {
  constructor(reactionFilter) {
    this.reactionFilter = reactionFilter;
  }

  resolve(sets, combineMode = "union") {
    const enabledSets = sets.filter((s) => s.enabled !== false);

    if (enabledSets.length === 0) {
      return { entries: [], perSetCounts: {}, totalCount: 0, enabledSetCount: 0 };
    }

    const perSetResults = enabledSets.map((set) => ({
      set,
      matches: this.reactionFilter.getFilteredReactionsAdvanced({
        reagents: set.reagents || [],
        product: set.product || "",
        minSpeed: set.minSpeed || 0,
        maxSpeed: set.maxSpeed || 0,
        advancedFilters: set.advancedFilters || {},
      }),
    }));

    const perSetCounts = {};
    perSetResults.forEach(({ set, matches }) => {
      perSetCounts[set.id] = matches.length;
    });

    // Merge by original reaction index, keeping the list of contributing sets per reaction.
    const merged = new Map();
    perSetResults.forEach(({ set, matches }) => {
      matches.forEach(({ index, reaction }) => {
        if (!merged.has(index)) {
          merged.set(index, { index, reaction, setIds: [], colors: [], names: [] });
        }
        const entry = merged.get(index);
        entry.setIds.push(set.id);
        entry.colors.push(set.color);
        entry.names.push(set.name);
      });
    });

    const totalEnabled = enabledSets.length;
    let finalEntries;

    if (combineMode === "intersection") {
      finalEntries = [...merged.values()].filter((entry) => entry.setIds.length === totalEnabled);
    } else if (combineMode === "difference") {
      finalEntries = [...merged.values()].filter((entry) => entry.setIds.length === 1);
    } else {
      finalEntries = [...merged.values()];
    }

    finalEntries.sort((a, b) => b.reaction.reactionRate - a.reaction.reactionRate);

    return {
      entries: finalEntries,
      perSetCounts,
      totalCount: finalEntries.length,
      enabledSetCount: totalEnabled,
    };
  }
}
