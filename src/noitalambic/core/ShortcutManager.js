// ============================================================================
// SHORTCUT MANAGER - Configurable graph node interactions
// ============================================================================
// Every interaction a graph node responds to (besides a plain click, which always highlights
// connections and is not itself reassignable) is defined here as a named action with a default
// binding, and can be rebound to any other combination. A binding has:
//   - trigger: "click" (single click), "dblclick" (double click), or "contextmenu" (right click)
//   - ctrl / shift / alt: modifier keys held during that trigger (ignored/false for dblclick and
//     contextmenu bindings in practice, but supported uniformly so any action can in principle be
//     bound to any trigger+modifier combination)
// No two actions may share the same trigger+modifier combination at once; setBinding() enforces
// this.

const DEFAULT_BINDINGS = {
  selectAsReagent: { trigger: "click", ctrl: true, shift: false, alt: false },
  selectAsProduct: { trigger: "click", ctrl: false, shift: true, alt: false },
  openMaterialWiki: { trigger: "click", ctrl: true, shift: true, alt: false },
  addReagentToNewSet: { trigger: "click", ctrl: false, shift: false, alt: true },
  addProductToNewSet: { trigger: "click", ctrl: false, shift: true, alt: true },
  openTagMenu: { trigger: "contextmenu", ctrl: false, shift: false, alt: false },
};

const ACTION_LABELS = {
  selectAsReagent: "Set clicked material as the reagent",
  selectAsProduct: "Set clicked material as the product",
  openMaterialWiki: "Open the clicked material's wiki page",
  addReagentToNewSet: "Add clicked material as reagent to a new set",
  addProductToNewSet: "Add clicked material as product to a new set",
  openTagMenu: "Open a tag's show/hide materials menu",
};

const TRIGGERS = ["click", "dblclick", "contextmenu"];

function sameCombo(a, b) {
  return a.trigger === b.trigger && !!a.ctrl === !!b.ctrl && !!a.shift === !!b.shift && !!a.alt === !!b.alt;
}

export class ShortcutManager {
  constructor(storage = null, storageKey = "noitalambic.shortcuts") {
    this.storage = storage || (typeof window !== "undefined" && window.localStorage ? window.localStorage : null);
    this.storageKey = storageKey;
    this.bindings = this._load();
  }

  getAllActions() {
    return Object.keys(DEFAULT_BINDINGS);
  }

  getLabel(action) {
    return ACTION_LABELS[action] || action;
  }

  getBinding(action) {
    return this.bindings[action] || DEFAULT_BINDINGS[action];
  }

  // Rebinds an action to a new trigger+combo. Refuses (without changing anything) if another
  // configurable action already uses the exact same trigger+combo.
  setBinding(action, combo) {
    if (!DEFAULT_BINDINGS[action]) return { ok: false, error: "Unknown action" };
    if (!TRIGGERS.includes(combo.trigger)) return { ok: false, error: "Unknown trigger" };

    const normalized = { trigger: combo.trigger, ctrl: !!combo.ctrl, shift: !!combo.shift, alt: !!combo.alt };

    const conflict = this.getAllActions().find((other) => other !== action && sameCombo(this.getBinding(other), normalized));
    if (conflict) return { ok: false, error: `Already used by "${this.getLabel(conflict)}"` };

    this.bindings[action] = normalized;
    this._save();
    return { ok: true };
  }

  resetToDefaults() {
    this.bindings = { ...DEFAULT_BINDINGS };
    this._save();
  }

  // Matches a native event (click/dblclick/contextmenu) against an action's configured binding.
  matchesEvent(action, event) {
    const combo = this.getBinding(action);
    if (!combo) return false;

    if (combo.trigger === "contextmenu") {
      if (event.type !== "contextmenu") return false;
    } else {
      if (event.type === "contextmenu") return false;
      const isDoubleClick = event.detail === 2;
      if (combo.trigger === "dblclick" && !isDoubleClick) return false;
      if (combo.trigger === "click" && isDoubleClick) return false;
    }

    return !!event.ctrlKey === !!combo.ctrl && !!event.shiftKey === !!combo.shift && !!event.altKey === !!combo.alt;
  }

  static formatCombo(combo) {
    const parts = [];
    if (combo.ctrl) parts.push("Ctrl");
    if (combo.shift) parts.push("Shift");
    if (combo.alt) parts.push("Alt");
    const triggerLabel = { click: "Click", dblclick: "Double-click", contextmenu: "Right-click" }[combo.trigger] || "Click";
    parts.push(triggerLabel);
    return parts.join("+");
  }

  _load() {
    try {
      const raw = this.storage?.getItem(this.storageKey);
      if (!raw) return { ...DEFAULT_BINDINGS };
      const parsed = JSON.parse(raw);
      // Older saved bindings (before the "trigger" field existed) default to "click", the
      // trigger every one of them implicitly meant at the time.
      const migrated = {};
      Object.entries(parsed).forEach(([action, combo]) => {
        migrated[action] = { trigger: "click", ...combo };
      });
      return { ...DEFAULT_BINDINGS, ...migrated };
    } catch (error) {
      return { ...DEFAULT_BINDINGS };
    }
  }

  _save() {
    try {
      this.storage?.setItem(this.storageKey, JSON.stringify(this.bindings));
    } catch (error) {
      // Not fatal: bindings just won't persist across reloads.
    }
  }
}
