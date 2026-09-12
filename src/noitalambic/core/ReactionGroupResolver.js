// ============================================================================
// REACTION GROUP RESOLVER - Recursively evaluates a ReactionGroupTree
// ============================================================================
// Walks a workspace's group tree bottom-up: each leaf resolves to the set of reactions matching
// its own reagents/product/speed/advanced filters, and each group combines its children's
// results with its own mode:
//   - union:               reactions present in ANY child
//   - intersection:        reactions present in EVERY child
//   - difference:          reactions in the FIRST child, minus the union of every other child
//                           (standard set difference; order of children matters)
//   - symmetricDifference: reactions present in EXACTLY ONE child
// Because groups can contain other groups, arbitrarily nested boolean expressions over the
// reaction sets are possible, e.g. (A union B) intersect (C difference D).
//
// Disabled leaves/groups are pruned entirely from their parent's combination (as if they were
// never a child at all) rather than treated as an empty operand - this matters for intersection,
// where an empty operand would otherwise force the whole group to be empty.

export class ReactionGroupResolver {
  constructor(reactionFilter) {
    this.reactionFilter = reactionFilter;
  }

  // Resolves any node in the workspace's tree (defaults to the root, i.e. the full result).
  // Resolving an arbitrary sub-node is used by the panel to show a live count per group.
  resolve(workspace, nodeId = workspace.tree.rootId) {
    const node = workspace.tree.getNode(nodeId);
    const map = this._resolveNode(node, workspace);
    const entries = [...map.values()].sort((a, b) => b.reaction.reactionRate - a.reaction.reactionRate);

    const perSetCounts = {};
    workspace.manager.sets.forEach((set) => {
      perSetCounts[set.id] = this.reactionFilter.getFilteredReactionsAdvanced(this._criteriaFor(set)).length;
    });

    return { entries, perSetCounts, totalCount: entries.length };
  }

  _criteriaFor(set) {
    return {
      reagents: set.reagents || [],
      product: set.product || "",
      minSpeed: set.minSpeed || 0,
      maxSpeed: set.maxSpeed || 0,
      advancedFilters: set.advancedFilters || {},
    };
  }

  _resolveNode(node, workspace) {
    if (!node) return new Map();

    if (node.type === "leaf") {
      const set = workspace.manager.getSet(node.setId);
      if (!set || set.enabled === false) return new Map();

      const matches = this.reactionFilter.getFilteredReactionsAdvanced(this._criteriaFor(set));
      const map = new Map();
      matches.forEach(({ index, reaction }) => {
        map.set(index, { index, reaction, setIds: [set.id], colors: [set.color], names: [set.name] });
      });
      return map;
    }

    const childMaps = node.children
      .map((childId) => workspace.tree.getNode(childId))
      .filter((child) => this._isChildActive(child, workspace))
      .map((child) => this._resolveNode(child, workspace));

    if (childMaps.length === 0) return new Map();

    switch (node.mode) {
      case "intersection":
        return this._intersect(childMaps);
      case "difference":
        return this._difference(childMaps);
      case "symmetricDifference":
        return this._symmetricDifference(childMaps);
      case "union":
      default:
        return this._union(childMaps);
    }
  }

  _isChildActive(child, workspace) {
    if (!child) return false;
    if (child.type === "leaf") {
      const set = workspace.manager.getSet(child.setId);
      return !!set && set.enabled !== false;
    }
    return child.enabled !== false;
  }

  _cloneEntry(entry) {
    return {
      index: entry.index,
      reaction: entry.reaction,
      setIds: [...entry.setIds],
      colors: [...entry.colors],
      names: [...entry.names],
    };
  }

  _union(maps) {
    const result = new Map();
    maps.forEach((map) => {
      map.forEach((entry, index) => {
        if (!result.has(index)) {
          result.set(index, { index, reaction: entry.reaction, setIds: [], colors: [], names: [] });
        }
        const target = result.get(index);
        target.setIds.push(...entry.setIds);
        target.colors.push(...entry.colors);
        target.names.push(...entry.names);
      });
    });
    return result;
  }

  _intersect(maps) {
    const [first, ...rest] = maps;
    const result = new Map();
    first.forEach((entry, index) => {
      if (rest.every((m) => m.has(index))) {
        const merged = this._cloneEntry(entry);
        rest.forEach((m) => {
          const other = m.get(index);
          merged.setIds.push(...other.setIds);
          merged.colors.push(...other.colors);
          merged.names.push(...other.names);
        });
        result.set(index, merged);
      }
    });
    return result;
  }

  _difference(maps) {
    const [first, ...rest] = maps;
    const result = new Map();
    first.forEach((entry, index) => {
      const excluded = rest.some((m) => m.has(index));
      if (!excluded) result.set(index, this._cloneEntry(entry));
    });
    return result;
  }

  _symmetricDifference(maps) {
    const counts = new Map();
    const owner = new Map();
    maps.forEach((map) => {
      map.forEach((entry, index) => {
        counts.set(index, (counts.get(index) || 0) + 1);
        if (!owner.has(index)) owner.set(index, entry);
      });
    });

    const result = new Map();
    counts.forEach((count, index) => {
      if (count === 1) result.set(index, this._cloneEntry(owner.get(index)));
    });
    return result;
  }
}
