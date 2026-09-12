// ============================================================================
// REACTION SET MANAGER - CRUD for individual reaction set data
// ============================================================================
// A "reaction set" bundles a reagent/product selection, a speed range, and a bag of advanced
// filters (see AdvancedFilters.js). This class only owns the DATA of each set (by id); how sets
// are grouped and combined (union/intersection/difference/symmetric difference, arbitrarily
// nested) is a separate structural concern owned by ReactionGroupTree. The two are composed
// together by ReactionSetWorkspace, which also handles persistence (save/load/URL/export).

import { CONFIG } from "../config/config.js";

let idCounter = 0;
function generateId() {
  idCounter += 1;
  return `set_${Date.now().toString(36)}_${idCounter}`;
}

// Minimal localStorage-compatible in-memory fallback, used in non-browser environments (tests,
// or if localStorage is unavailable e.g. private browsing with storage disabled).
export class InMemoryStorage {
  constructor() {
    this.map = new Map();
  }
  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }
  setItem(key, value) {
    this.map.set(key, value);
  }
  removeItem(key) {
    this.map.delete(key);
  }
}

export function createEmptyAdvancedFilters() {
  return {
    excludeCatalysts: false,
    onlyCatalysts: false,
    minReagentCount: CONFIG.advancedFilters.minReagentCount,
    maxReagentCount: CONFIG.advancedFilters.maxReagentCount,
    minProductCount: CONFIG.advancedFilters.minProductCount,
    maxProductCount: CONFIG.advancedFilters.maxProductCount,
    requireTags: [],
    excludeTags: [],
    materialTypeIn: [],
    materialTypeOut: [],
    nameSearch: "",
  };
}

export function createReactionSet(overrides = {}) {
  const palette = CONFIG.reactionSets.defaultColors;
  return {
    id: generateId(),
    name: "New set",
    color: palette[0],
    enabled: true,
    collapsed: false,
    reagents: [],
    product: "",
    minSpeed: 0,
    maxSpeed: 0, // 0 means "no upper limit"
    advancedFilters: createEmptyAdvancedFilters(),
    ...overrides,
    // Advanced filters must always be a complete object (merge instead of full overwrite),
    // otherwise a partial "advancedFilters" override would silently drop the other defaults.
    advancedFilters: { ...createEmptyAdvancedFilters(), ...(overrides.advancedFilters || {}) },
  };
}

export class ReactionSetManager {
  constructor(eventBus) {
    this.eventBus = eventBus;
    this.sets = [];
  }

  addSet(overrides = {}) {
    if (this.sets.length >= CONFIG.reactionSets.maxSets) {
      this.eventBus.emit("reactionSetLimitReached", CONFIG.reactionSets.maxSets);
      return null;
    }

    const palette = CONFIG.reactionSets.defaultColors;
    const color = overrides.color || palette[this.sets.length % palette.length];
    const name = overrides.name || `Set ${this.sets.length + 1}`;
    const set = createReactionSet({ ...overrides, name, color });

    this.sets.push(set);
    this._emitChanged();
    return set;
  }

  removeSet(id) {
    this.sets = this.sets.filter((s) => s.id !== id);
    this._emitChanged();
  }

  duplicateSet(id) {
    const original = this.getSet(id);
    if (!original) return null;

    // Deep clone through JSON to avoid sharing array/object references with the original set.
    const clone = JSON.parse(JSON.stringify(original));
    delete clone.id;

    const palette = CONFIG.reactionSets.defaultColors;
    const newSet = createReactionSet({
      ...clone,
      name: `${original.name} (copy)`,
      color: palette[this.sets.length % palette.length],
    });

    this.sets.push(newSet);
    this._emitChanged();
    return newSet;
  }

  getSet(id) {
    return this.sets.find((s) => s.id === id) || null;
  }

  updateSet(id, changes) {
    const set = this.getSet(id);
    if (!set) return;
    Object.assign(set, changes);
    this._emitChanged();
  }

  updateSetFilters(id, filterChanges) {
    const set = this.getSet(id);
    if (!set) return;
    Object.assign(set.advancedFilters, filterChanges);
    this._emitChanged();
  }

  toggleSetEnabled(id) {
    const set = this.getSet(id);
    if (!set) return;
    set.enabled = !set.enabled;
    this._emitChanged();
  }

  toggleSetCollapsed(id) {
    const set = this.getSet(id);
    if (!set) return;
    set.collapsed = !set.collapsed;
    this._emitChanged();
  }

  _emitChanged() {
    this.eventBus.emit("reactionSetsChanged", this);
  }
}
