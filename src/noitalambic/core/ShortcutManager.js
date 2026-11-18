// ============================================================================
// SHORTCUT MANAGER - Configurable mouse shortcuts on graph nodes
// ============================================================================
// A shortcut is a mouse gesture (Click, DoubleClick, RightClick) with optional modifiers
// (Ctrl, Shift, Alt), written as a canonical string such as "Ctrl+Shift+Click".
//
// Every action belongs to a scope (the node type it acts on: "material" or "tag"). Two actions
// can only collide if they share a scope, so "RightClick" can open the tag menu and, at the same
// time, do something else on materials.
//
// Plain "Click" is reserved: it always highlights the clicked node's connections.
//
// Rebinding an action to a gesture already used in the same scope swaps the two bindings instead
// of refusing: the user never has to free a gesture first, and nothing is ever silently lost.
//
// Only the bindings that differ from the defaults are persisted, so changing a default in the code
// reaches every user who did not customize that action.

export const MODIFIERS = ["Ctrl", "Shift", "Alt"];
export const GESTURES = ["Click", "DoubleClick", "RightClick"];
export const RESERVED_COMBO = "Click";

export const ACTIONS = [
  { id: "selectAsReagent", scope: "material", label: "Set as reagent", defaultCombo: "Ctrl+Click" },
  { id: "selectAsProduct", scope: "material", label: "Set as product", defaultCombo: "Shift+Click" },
  { id: "openMaterialWiki", scope: "material", label: "Open wiki page", defaultCombo: "Ctrl+Shift+Click" },
  { id: "addReagentToNewSet", scope: "material", label: "Add as reagent to a new set", defaultCombo: "Alt+Click" },
  { id: "addProductToNewSet", scope: "material", label: "Add as product to a new set", defaultCombo: "Shift+Alt+Click" },
  { id: "openMaterialMenu", scope: "material", label: "Open actions menu", defaultCombo: "RightClick" },
  { id: "toggleTagMaterials", scope: "tag", label: "Show/hide all its materials", defaultCombo: "DoubleClick" },
  { id: "openTagMenu", scope: "tag", label: "Open actions menu", defaultCombo: "RightClick" },
  { id: "openReactionMenu", scope: "reaction", label: "Open actions menu", defaultCombo: "RightClick" },
];

export const SCOPE_LABELS = { material: "Material", tag: "Tag", reaction: "Reaction" };

const ACTIONS_BY_ID = new Map(ACTIONS.map((action) => [action.id, action]));
const STORAGE_KEY = "noitalambic.shortcuts.v2";
const LEGACY_STORAGE_KEY = "noitalambic.shortcuts";
const LEGACY_TRIGGERS = { click: "Click", dblclick: "DoubleClick", contextmenu: "RightClick" };
const GESTURE_LABELS = { Click: "Click", DoubleClick: "Double-click", RightClick: "Right-click" };

// Builds the canonical combo string. Modifier order is fixed so equal combos compare equal.
export function buildCombo({ ctrl = false, shift = false, alt = false, gesture }) {
  const flags = { Ctrl: ctrl, Shift: shift, Alt: alt };
  return [...MODIFIERS.filter((mod) => flags[mod]), gesture].join("+");
}

// Returns {ctrl, shift, alt, gesture} or null if the string is not a valid combo. Accepts any
// modifier order and casing, so hand-edited storage still loads.
export function parseCombo(combo) {
  if (typeof combo !== "string" || !combo) return null;
  const parts = combo.split("+").map((part) => part.trim().toLowerCase());
  const gesture = GESTURES.find((g) => g.toLowerCase() === parts[parts.length - 1]);
  if (!gesture) return null;

  const result = { ctrl: false, shift: false, alt: false, gesture };
  for (const part of parts.slice(0, -1)) {
    if (!["ctrl", "shift", "alt"].includes(part) || result[part]) return null;
    result[part] = true;
  }
  return result;
}

export function normalizeCombo(combo) {
  const parsed = parseCombo(combo);
  return parsed ? buildCombo(parsed) : null;
}

// Maps a native click/contextmenu event to its combo. A click whose detail is 2 or more is the
// second click of a double-click. Returns null for anything that is not a mouse gesture.
export function comboFromEvent(event) {
  let gesture;
  if (event.type === "contextmenu") gesture = "RightClick";
  else if (event.type === "dblclick") gesture = "DoubleClick";
  else if (event.type === "click") gesture = event.detail >= 2 ? "DoubleClick" : "Click";
  else return null;
  return buildCombo({ ctrl: !!event.ctrlKey, shift: !!event.shiftKey, alt: !!event.altKey, gesture });
}

// Human readable label, e.g. "Ctrl+Shift+Double-click". null means "not bound".
export function formatCombo(combo) {
  const parsed = parseCombo(combo);
  if (!parsed) return "Unassigned";
  return buildCombo(parsed).replace(parsed.gesture, GESTURE_LABELS[parsed.gesture]);
}

export class ShortcutManager {
  constructor(storage = null) {
    this.storage = storage ?? (typeof window !== "undefined" ? window.localStorage ?? null : null);
    this._listeners = new Set();
    this._bindings = this._defaultBindings();
    this._applyOverrides(this._loadOverrides());
  }

  // ---------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------

  getActions(scope = null) {
    return scope ? ACTIONS.filter((action) => action.scope === scope) : [...ACTIONS];
  }

  getAction(actionId) {
    return ACTIONS_BY_ID.get(actionId) ?? null;
  }

  // Current combo of an action, or null when it is unassigned.
  getBinding(actionId) {
    return this._bindings.get(actionId) ?? null;
  }

  isDefault(actionId) {
    return this.getBinding(actionId) === this.getAction(actionId)?.defaultCombo;
  }

  // Action bound to a combo in a scope, or null.
  findAction(scope, combo) {
    const normalized = normalizeCombo(combo);
    if (!normalized) return null;
    return this.getActions(scope).find((action) => this._bindings.get(action.id) === normalized)?.id ?? null;
  }

  // Action triggered by a native event on a node of the given scope, or null.
  resolve(scope, event) {
    const combo = comboFromEvent(event);
    return combo ? this.findAction(scope, combo) : null;
  }

  // True when a DoubleClick with the same modifiers as this single-click event is bound in the
  // scope. The caller then has to wait before running the single-click action, otherwise both
  // would fire on a double-click.
  hasDoubleClickVariant(scope, event) {
    if (event.type !== "click") return false;
    const combo = buildCombo({ ctrl: !!event.ctrlKey, shift: !!event.shiftKey, alt: !!event.altKey, gesture: "DoubleClick" });
    return this.findAction(scope, combo) !== null;
  }

  // ---------------------------------------------------------------------
  // Mutations (each one persists and notifies subscribers)
  // ---------------------------------------------------------------------

  // Binds an action to a combo. If another action of the same scope already uses it, that action
  // takes over the previous combo of this one (a swap). Returns {ok, error?, swappedWith?}.
  setBinding(actionId, combo) {
    const action = this.getAction(actionId);
    if (!action) return { ok: false, error: `Unknown action "${actionId}"` };

    const normalized = normalizeCombo(combo);
    if (!normalized) return { ok: false, error: `Invalid shortcut "${combo}"` };
    if (normalized === RESERVED_COMBO) return { ok: false, error: "Plain click is reserved for highlighting connections" };

    const previous = this.getBinding(actionId);
    if (previous === normalized) return { ok: true, swappedWith: null };

    const other = this.findAction(action.scope, normalized);
    if (other) this._bindings.set(other, previous);
    this._bindings.set(actionId, normalized);
    this._commit();
    return { ok: true, swappedWith: other };
  }

  clearBinding(actionId) {
    if (!this.getAction(actionId) || this.getBinding(actionId) === null) return;
    this._bindings.set(actionId, null);
    this._commit();
  }

  // Restores one action's default combo (swapping with whoever currently holds it).
  resetBinding(actionId) {
    const action = this.getAction(actionId);
    if (!action) return { ok: false, error: `Unknown action "${actionId}"` };
    return this.setBinding(actionId, action.defaultCombo);
  }

  resetToDefaults() {
    this._bindings = this._defaultBindings();
    this._commit();
  }

  // Calls listener() after every change. Returns an unsubscribe function.
  subscribe(listener) {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  // ---------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------

  _defaultBindings() {
    return new Map(ACTIONS.map((action) => [action.id, action.defaultCombo]));
  }

  _commit() {
    this._saveOverrides();
    this._listeners.forEach((listener) => listener());
  }

  _loadOverrides() {
    try {
      const raw = this.storage?.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
      return this._migrateLegacy(this.storage?.getItem(LEGACY_STORAGE_KEY));
    } catch {
      return {};
    }
  }

  // Previous format: {action: {trigger: "click"|"dblclick"|"contextmenu", ctrl, shift, alt}},
  // with every action stored (defaults included). Older entries had no trigger: they meant click.
  _migrateLegacy(raw) {
    if (!raw) return {};
    const overrides = {};
    Object.entries(JSON.parse(raw)).forEach(([actionId, old]) => {
      const gesture = LEGACY_TRIGGERS[old?.trigger ?? "click"];
      if (!gesture) return;
      overrides[actionId] = buildCombo({ ctrl: !!old.ctrl, shift: !!old.shift, alt: !!old.alt, gesture });
    });
    return overrides;
  }

  // Applies stored overrides one by one through the same rules as the UI, so corrupted or
  // conflicting data can never produce an inconsistent state.
  _applyOverrides(overrides) {
    if (!overrides || typeof overrides !== "object") return;
    Object.entries(overrides).forEach(([actionId, combo]) => {
      const action = this.getAction(actionId);
      if (!action) return;
      if (combo === null) {
        this._bindings.set(actionId, null);
        return;
      }
      const normalized = normalizeCombo(combo);
      if (!normalized || normalized === RESERVED_COMBO) return;
      const holder = this.findAction(action.scope, normalized);
      if (holder && holder !== actionId) this._bindings.set(holder, this._bindings.get(actionId));
      this._bindings.set(actionId, normalized);
    });
  }

  _saveOverrides() {
    const overrides = {};
    ACTIONS.forEach((action) => {
      const combo = this._bindings.get(action.id);
      if (combo !== action.defaultCombo) overrides[action.id] = combo;
    });
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(overrides));
    } catch {
      // Not fatal: the bindings just won't survive a reload.
    }
  }
}

// App-wide instance shared by the graph renderer and the legend editor, so a rebind made in one
// place is immediately effective everywhere.
let sharedInstance = null;
export function getSharedShortcutManager() {
  sharedInstance ??= new ShortcutManager();
  return sharedInstance;
}
