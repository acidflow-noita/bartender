// ============================================================================
// REACTION SET PANEL - Right-hand panel: groups/leaves tree, collapse, hide/show
// ============================================================================
// Renders and wires the UI for the multi-selection feature on top of a ReactionSetWorkspace
// (sets + group tree): a recursive tree of groups (each with its own union/intersection/
// difference/symmetric-difference mode, arbitrarily nested) and leaves (individual reaction
// sets, each with its own reagents/product/speed range/advanced filters).
//
// Two independent collapse mechanisms address "long list to scroll through":
//   - each set card and each group can be folded to just its header (per-node "collapsed" flag)
//   - the whole panel can be hidden down to a slim tab (panel-level, persisted in localStorage
//     under CONFIG.reactionSets.panelHiddenStorageKey so it survives a reload)
//
// Design note: like the previous version, this panel manages its own DOM imperatively and only
// does a full rebuild after structural actions (add/remove/duplicate/move/ungroup/load/import/
// reset). Field-level edits (typing a name, dragging a slider, ticking a checkbox) update the
// model directly without a full rebuild, so the user never loses focus while editing.

import { ChoicesInitializer } from "./ChoicesInitializer.js";
import { UIHelper } from "./UIHelper.js";
import { GROUP_MODES } from "../core/ReactionGroupTree.js";
import { ShortcutManager } from "../core/ShortcutManager.js";

const GROUP_MODE_LABELS = {
  union: "Union - any child",
  intersection: "Intersection - every child",
  difference: "Difference - first child minus the rest",
  symmetricDifference: "Symmetric difference - unique to one child",
};

const PANEL_HIDDEN_STORAGE_KEY = "noitalambic.reactionSetPanel.hidden";
const PANEL_KEYBOARD_A11Y_STORAGE_KEY = "noitalambic.reactionSetPanel.keyboardAccessible";

function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export class ReactionSetPanel {
  static _stylesInjected = false;

  constructor({ workspace, resolver, reactionFilter, dataRepo, eventBus, ChoicesLib, onSetsResolved, storage = null, shortcutManager = null }) {
    this.workspace = workspace;
    this.resolver = resolver;
    this.reactionFilter = reactionFilter;
    this.dataRepo = dataRepo;
    this.eventBus = eventBus;
    this.Choices = ChoicesLib;
    this.onSetsResolved = onSetsResolved || (() => {});
    this.storage = storage || (typeof window !== "undefined" && window.localStorage ? window.localStorage : null);
    this.shortcutManager = shortcutManager;

    this.container = null;
    this._choicesInstances = new Map(); // setId -> { reagentChoices, productChoices }
    this._lastResult = null;
    this._hidden = this._readHiddenPreference();
    // Off by default: the drag handles already cover reordering for mouse/touch users, and most
    // people prefer the less cluttered header. Turning this on brings back plain <button>
    // "Move up"/"Move down" controls (native, Tab + Enter/Space, screen-reader friendly) as a
    // full keyboard-operable alternative to dragging.
    this._keyboardAccessible = this._readKeyboardAccessiblePreference();
    this._draggedNodeId = null;

    this._injectStyles();
  }

  mount(container) {
    this.container = container;
    if (this.workspace.manager.sets.length === 0) {
      this.workspace.createSet(this.workspace.tree.rootId, { name: "Set 1" });
    }
    this.rebuild();
  }

  rebuild() {
    this._rebuild();
  }

  // -------------------------------------------------------------------
  // Panel-level hide/show
  // -------------------------------------------------------------------

  _readHiddenPreference() {
    try {
      return this.storage?.getItem(PANEL_HIDDEN_STORAGE_KEY) === "true";
    } catch (error) {
      return false;
    }
  }

  _writeHiddenPreference() {
    try {
      this.storage?.setItem(PANEL_HIDDEN_STORAGE_KEY, this._hidden ? "true" : "false");
    } catch (error) {
      // Not fatal: the panel just won't remember its hidden state across reloads.
    }
  }

  _toggleHidden() {
    this._hidden = !this._hidden;
    this._writeHiddenPreference();
    this._rebuild();
  }

  // -------------------------------------------------------------------
  // Keyboard accessibility toggle (off by default)
  // -------------------------------------------------------------------

  _readKeyboardAccessiblePreference() {
    try {
      return this.storage?.getItem(PANEL_KEYBOARD_A11Y_STORAGE_KEY) === "true";
    } catch (error) {
      return false;
    }
  }

  _writeKeyboardAccessiblePreference() {
    try {
      this.storage?.setItem(PANEL_KEYBOARD_A11Y_STORAGE_KEY, this._keyboardAccessible ? "true" : "false");
    } catch (error) {
      // Not fatal: the panel just won't remember this preference across reloads.
    }
  }

  _toggleKeyboardAccessible() {
    this._keyboardAccessible = !this._keyboardAccessible;
    this._writeKeyboardAccessiblePreference();
    this._rebuild();
  }

  // -------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------

  _rebuild() {
    if (!this.container) return;

    this._destroyChoicesInstances();

    if (this._hidden) {
      this.container.innerHTML = this._renderHiddenTab();
      this.container.querySelector('[data-action="show-panel"]').addEventListener("click", () => this._toggleHidden());
      return;
    }

    this.container.innerHTML = this._renderShell();
    this._bindGlobalControls();
    this._bindNode(this.workspace.tree.root);
    this._recompute();
  }

  _renderHiddenTab() {
    const count = this.workspace.manager.sets.length;
    return `
      <button type="button" class="rsp-hidden-tab" data-action="show-panel" title="Show the reaction sets panel">
        <span class="rsp-hidden-tab-text">Reaction sets (${count})</span>
      </button>
    `;
  }

  _renderShell() {
    return `
      <div class="reaction-set-panel">
        <div class="rsp-header">
          <h3>Reaction Sets</h3>
          <label class="rsp-a11y-toggle" title="Show Move up/down buttons as a keyboard-operable alternative to dragging">
            <input type="checkbox" data-role="keyboard-accessible" ${this._keyboardAccessible ? "checked" : ""} />
            Keyboard accessibility
          </label>
          <button type="button" class="rsp-btn" data-action="hide-panel" title="Hide this panel">Hide panel</button>
        </div>

        ${this._renderShortcutsSection()}

        <div class="rsp-bulk-actions">
          <button type="button" data-action="collapse-all" title="Fold every set and group down to their header">Collapse all</button>
          <button type="button" data-action="expand-all" title="Unfold every set and group">Expand all</button>
        </div>

        <div id="reactionSetTree">
          ${this._renderNode(this.workspace.tree.root)}
        </div>

        <div class="rsp-summary" id="rsp-summary">No reactions yet</div>

        <div class="rsp-config-actions">
          <button type="button" data-action="save-config" title="Save the current sets and groups under a name">Save</button>
          <select data-role="saved-configs" title="Saved configurations"></select>
          <button type="button" data-action="load-config" title="Load the selected configuration">Load</button>
          <button type="button" data-action="delete-config" title="Delete the selected configuration">Delete</button>
          <button type="button" data-action="download-config" title="Download the current configuration as a JSON file">Download</button>
          <label class="rsp-file-label" title="Import a configuration from a JSON file">
            Import
            <input type="file" accept="application/json" data-role="import-file" hidden />
          </label>
          <button type="button" data-action="export-csv" title="Export the current reaction list as CSV">Export CSV</button>
          <button type="button" data-action="reset-all" title="Remove everything and start over">Reset all</button>
        </div>
      </div>
    `;
  }

  // Dispatches to the right renderer depending on node type.
  _renderNode(node) {
    if (!node) return "";
    if (node.type === "leaf") {
      const set = this.workspace.manager.getSet(node.setId);
      return set ? this._renderSetCard(set) : "";
    }
    return this._renderGroupCard(node);
  }

  _renderGroupCard(group) {
    const isRoot = group.id === this.workspace.tree.rootId;
    const modeOptions = GROUP_MODES.map(
      (mode) => `<option value="${mode}" ${group.mode === mode ? "selected" : ""}>${GROUP_MODE_LABELS[mode]}</option>`,
    ).join("");

    const childrenHtml = group.collapsed
      ? ""
      : `<div class="rsp-group-children">${group.children.map((childId) => this._renderNode(this.workspace.tree.getNode(childId))).join("")}</div>`;

    return `
      <div class="rsp-group ${isRoot ? "rsp-group-root" : ""}" data-group-id="${group.id}">
        <div class="rsp-group-header">
          ${isRoot ? "" : `<span class="rsp-drag-handle" data-role="drag-handle" title="Drag to reorder or move into another group">Move</span>`}
          <button type="button" class="rsp-collapse-btn" data-action="toggle-collapse" title="${group.collapsed ? "Expand" : "Collapse"}">${group.collapsed ? "+" : "-"}</button>
          ${isRoot ? "" : `<input type="checkbox" data-role="group-enabled" ${group.enabled !== false ? "checked" : ""} title="Enable/disable this group" />`}
          <select data-role="group-mode" title="How the children of this group combine">${modeOptions}</select>
          ${
            isRoot
              ? `<span class="rsp-group-name">${escapeHtml(group.name || "All reactions")}</span>`
              : `<input type="text" data-role="group-name" value="${escapeHtml(group.name)}" class="rsp-group-name-input" />`
          }
          <span class="rsp-group-count" data-role="group-count">0 reactions</span>
          <div class="rsp-group-actions">
            ${isRoot ? `<button type="button" data-action="add-set" title="Add a new set to this group">+ Set</button><button type="button" data-action="add-group" title="Add a nested sub-group here">+ Group</button>` : ""}
            ${
              isRoot
                ? ""
                : `${this._keyboardAccessible ? `<button type="button" data-action="move-up" title="Move up">Move up</button><button type="button" data-action="move-down" title="Move down">Move down</button>` : ""}
                   <button type="button" data-action="ungroup" title="Remove this grouping, keep its contents">Ungroup</button>
                   <button type="button" data-action="delete-group" title="Delete this group and everything inside it">delete</button>`
            }
          </div>
        </div>
        ${childrenHtml}
      </div>
    `;
  }

  _renderSetCard(set) {
    const f = set.advancedFilters;
    const bodyHtml = set.collapsed
      ? ""
      : `
      <div class="rsp-set-card-body">
        <div class="rsp-field">
          <label>Reagents (up to 3)</label>
          <select data-role="reagents" multiple></select>
        </div>
        <div class="rsp-field">
          <label>Product</label>
          <select data-role="product" multiple></select>
        </div>

        <div class="rsp-speed-row">
          <label>Min speed
            <input type="number" data-role="min-speed" min="0" max="100" step="5" value="${set.minSpeed}" />
          </label>
          <label>Max speed
            <input type="number" data-role="max-speed" min="0" max="100" step="5" value="${set.maxSpeed}" placeholder="no limit" />
          </label>
        </div>

        <details class="rsp-advanced">
          <summary>Advanced filters</summary>
          <div class="rsp-advanced-body">
            <label class="rsp-checkbox-row">
              <input type="checkbox" data-role="exclude-catalysts" ${f.excludeCatalysts ? "checked" : ""} />
              Exclude catalyst reactions (element is both input and output)
            </label>
            <label class="rsp-checkbox-row">
              <input type="checkbox" data-role="only-catalysts" ${f.onlyCatalysts ? "checked" : ""} />
              Only catalyst reactions
            </label>

            <div class="rsp-count-range">
              <label>Reagent count
                <input type="number" data-role="min-reagent-count" min="0" max="3" value="${f.minReagentCount}" />
                to
                <input type="number" data-role="max-reagent-count" min="0" max="3" value="${f.maxReagentCount}" />
              </label>
            </div>
            <div class="rsp-count-range">
              <label>Product count
                <input type="number" data-role="min-product-count" min="0" max="3" value="${f.minProductCount}" />
                to
                <input type="number" data-role="max-product-count" min="0" max="3" value="${f.maxProductCount}" />
              </label>
            </div>

            <label>Require tags (comma separated)
              <input type="text" data-role="require-tags" value="${escapeHtml(f.requireTags.join(", "))}" placeholder="e.g. organic, gas" />
            </label>
            <label>Exclude tags (comma separated)
              <input type="text" data-role="exclude-tags" value="${escapeHtml(f.excludeTags.join(", "))}" placeholder="e.g. gas" />
            </label>
            <label>Name search
              <input type="text" data-role="name-search" value="${escapeHtml(f.nameSearch)}" placeholder="e.g. acid" />
            </label>
          </div>
        </details>
      </div>
    `;

    return `
      <div class="rsp-set-card" data-set-id="${set.id}" style="--set-color:${set.color}">
        <div class="rsp-set-card-header">
          <span class="rsp-drag-handle" data-role="drag-handle" title="Drag to reorder or move into another group">Move</span>
          <button type="button" class="rsp-collapse-btn" data-action="toggle-set-collapse" title="${set.collapsed ? "Expand" : "Collapse"}">${set.collapsed ? "+" : "-"}</button>
          <input type="checkbox" data-role="enabled" ${set.enabled ? "checked" : ""} title="Enable/disable this set" />
          <input type="color" data-role="color" value="${set.color}" title="Set color" />
          <input type="text" data-role="name" value="${escapeHtml(set.name)}" class="rsp-set-name" title="Set name" />
          <span class="rsp-set-count" data-role="count">0 reactions</span>
          <div class="rsp-set-card-actions">
            ${this._keyboardAccessible ? `<button type="button" data-action="move-up" title="Move up">Move up</button><button type="button" data-action="move-down" title="Move down">Move down</button>` : ""}
            <button type="button" data-action="duplicate" title="Duplicate this set">copy</button>
            <button type="button" data-action="delete" title="Delete this set">delete</button>
          </div>
        </div>
        ${bodyHtml}
      </div>
    `;
  }

  // Only rendered when a ShortcutManager was provided to the constructor (optional feature).
  _renderShortcutsSection() {
    if (!this.shortcutManager) return "";

    const triggerOptions = [
      ["click", "Click"],
      ["dblclick", "Double-click"],
      ["contextmenu", "Right-click"],
    ];

    const rows = this.shortcutManager
      .getAllActions()
      .map((action) => {
        const combo = this.shortcutManager.getBinding(action);
        const options = triggerOptions
          .map(([value, label]) => `<option value="${value}" ${combo.trigger === value ? "selected" : ""}>${label}</option>`)
          .join("");
        return `
          <div class="rsp-shortcut-row" data-shortcut-action="${action}">
            <span class="rsp-shortcut-label">${escapeHtml(this.shortcutManager.getLabel(action))}</span>
            <select data-role="trigger">${options}</select>
            <label><input type="checkbox" data-role="mod-ctrl" ${combo.ctrl ? "checked" : ""} /> Ctrl</label>
            <label><input type="checkbox" data-role="mod-shift" ${combo.shift ? "checked" : ""} /> Shift</label>
            <label><input type="checkbox" data-role="mod-alt" ${combo.alt ? "checked" : ""} /> Alt</label>
            <span class="rsp-shortcut-combo" data-role="combo-label">${ShortcutManager.formatCombo(combo)}</span>
          </div>
        `;
      })
      .join("");

    return `
      <details class="rsp-shortcuts">
        <summary>Keyboard shortcuts</summary>
        <div class="rsp-shortcuts-body">
          <p class="rsp-shortcuts-hint">Every graph node interaction below can be reassigned to any trigger and modifier combination. No two actions can share the same one.</p>
          ${rows}
          <button type="button" data-action="reset-shortcuts">Reset to defaults</button>
        </div>
      </details>
    `;
  }

  // -------------------------------------------------------------------
  // Global controls
  // -------------------------------------------------------------------

  _bindGlobalControls() {
    this.container.querySelector('[data-action="hide-panel"]').addEventListener("click", () => this._toggleHidden());

    this.container.querySelector('[data-role="keyboard-accessible"]').addEventListener("change", () => {
      this._toggleKeyboardAccessible();
    });

    this._bindShortcutsSection();

    this.container.querySelector('[data-action="collapse-all"]').addEventListener("click", () => {
      this.workspace.collapseAll();
      this._rebuild();
    });
    this.container.querySelector('[data-action="expand-all"]').addEventListener("click", () => {
      this.workspace.expandAll();
      this._rebuild();
    });

    this.container.querySelector('[data-action="save-config"]').addEventListener("click", () => {
      const name = window.prompt("Name this configuration:");
      if (name && this.workspace.saveNamedConfig(name)) {
        this._refreshSavedConfigsSelect();
        UIHelper.showNotification(`Saved configuration "${name}"`);
      }
    });

    this._refreshSavedConfigsSelect();

    this.container.querySelector('[data-action="load-config"]').addEventListener("click", () => {
      const select = this.container.querySelector('[data-role="saved-configs"]');
      const name = select.value;
      if (name && this.workspace.loadNamedConfig(name)) {
        this._rebuild();
        UIHelper.showNotification(`Loaded configuration "${name}"`);
      }
    });

    this.container.querySelector('[data-action="delete-config"]').addEventListener("click", () => {
      const select = this.container.querySelector('[data-role="saved-configs"]');
      const name = select.value;
      if (name) {
        this.workspace.deleteNamedConfig(name);
        this._refreshSavedConfigsSelect();
      }
    });

    this.container.querySelector('[data-action="download-config"]').addEventListener("click", () => {
      this._downloadConfig();
    });

    const fileInput = this.container.querySelector('[data-role="import-file"]');
    fileInput.addEventListener("change", (event) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          if (this.workspace.loadFromObject(data)) {
            this._rebuild();
            UIHelper.showNotification("Configuration imported");
          } else {
            UIHelper.showNotification("Invalid configuration file");
          }
        } catch (error) {
          console.error("Failed to import reaction set configuration", error);
          UIHelper.showNotification("Failed to read configuration file");
        }
      };
      reader.readAsText(file);
      fileInput.value = "";
    });

    this.container.querySelector('[data-action="export-csv"]').addEventListener("click", () => {
      if (this._lastResult) this._exportResultsCSV(this._lastResult);
    });

    this.container.querySelector('[data-action="reset-all"]').addEventListener("click", () => {
      this.workspace.reset(true);
      this._rebuild();
    });
  }

  // Only wired when a ShortcutManager was provided to the constructor (optional feature).
  _bindShortcutsSection() {
    if (!this.shortcutManager) return;

    this.container.querySelectorAll(".rsp-shortcut-row").forEach((row) => {
      const action = row.dataset.shortcutAction;
      const triggerEl = row.querySelector('[data-role="trigger"]');
      const ctrlEl = row.querySelector('[data-role="mod-ctrl"]');
      const shiftEl = row.querySelector('[data-role="mod-shift"]');
      const altEl = row.querySelector('[data-role="mod-alt"]');
      const comboLabel = row.querySelector('[data-role="combo-label"]');

      const applyChange = () => {
        const combo = { trigger: triggerEl.value, ctrl: ctrlEl.checked, shift: shiftEl.checked, alt: altEl.checked };
        const result = this.shortcutManager.setBinding(action, combo);
        if (!result.ok) {
          UIHelper.showNotification(result.error);
          const current = this.shortcutManager.getBinding(action);
          triggerEl.value = current.trigger;
          ctrlEl.checked = current.ctrl;
          shiftEl.checked = current.shift;
          altEl.checked = current.alt;
        }
        comboLabel.textContent = ShortcutManager.formatCombo(this.shortcutManager.getBinding(action));
      };

      [triggerEl, ctrlEl, shiftEl, altEl].forEach((el) => el.addEventListener("change", applyChange));
    });

    const resetBtn = this.container.querySelector('[data-action="reset-shortcuts"]');
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        this.shortcutManager.resetToDefaults();
        this._rebuild();
      });
    }
  }

  _refreshSavedConfigsSelect() {
    const select = this.container.querySelector('[data-role="saved-configs"]');
    if (!select) return;

    const configs = this.workspace.listSavedConfigs();
    select.innerHTML = configs.length
      ? configs.map((c) => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join("")
      : `<option value="">No saved configurations</option>`;
  }

  _downloadConfig() {
    const data = this.workspace.serialize();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    this._triggerDownload(blob, `noitalambic-reaction-sets-${Date.now()}.json`);
    UIHelper.showNotification("Configuration downloaded");
  }

  _exportResultsCSV(result) {
    const headers = ["reagent1", "reagent2", "reagent3", "product1", "product2", "product3", "reactionRate", "sets"];
    const rows = result.entries.map((entry) => {
      const r = entry.reaction;
      return [r.reagent1, r.reagent2, r.reagent3, r.product1, r.product2, r.product3, r.reactionRate, entry.names.join("|")]
        .map((value) => `"${(value ?? "").toString().replace(/"/g, '""')}"`)
        .join(",");
    });

    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    this._triggerDownload(blob, `noitalambic-reactions-${Date.now()}.csv`);
    UIHelper.showNotification("Reactions exported as CSV");
  }

  _triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // -------------------------------------------------------------------
  // Recursive node binding
  // -------------------------------------------------------------------

  _bindNode(node) {
    if (!node) return;
    if (node.type === "leaf") {
      const set = this.workspace.manager.getSet(node.setId);
      if (set) this._bindSetCard(set);
      return;
    }

    this._bindGroupCard(node);
    if (!node.collapsed) {
      node.children.forEach((childId) => this._bindNode(this.workspace.tree.getNode(childId)));
    }
  }

  _bindGroupCard(group) {
    const isRoot = group.id === this.workspace.tree.rootId;
    const cardEl = this.container.querySelector(`.rsp-group[data-group-id="${group.id}"]`);
    if (!cardEl) return;
    const headerEl = cardEl.querySelector(":scope > .rsp-group-header");

    headerEl.querySelector('[data-action="toggle-collapse"]').addEventListener("click", () => {
      this.workspace.tree.toggleCollapsed(group.id);
      this._rebuild();
    });

    if (!isRoot) {
      const enabledEl = headerEl.querySelector('[data-role="group-enabled"]');
      enabledEl.addEventListener("change", () => {
        this.workspace.tree.toggleEnabled(group.id);
        this._recompute();
      });
    }

    headerEl.querySelector('[data-role="group-mode"]').addEventListener("change", (e) => {
      this.workspace.tree.setGroupMode(group.id, e.target.value);
      this._recompute();
    });

    if (!isRoot) {
      const nameInput = headerEl.querySelector('[data-role="group-name"]');
      nameInput.addEventListener("change", () => {
        this.workspace.tree.renameGroup(group.id, nameInput.value.trim() || group.name);
      });

      headerEl.querySelector('[data-action="ungroup"]').addEventListener("click", () => {
        this.workspace.ungroup(group.id);
        this._rebuild();
      });

      headerEl.querySelector('[data-action="delete-group"]').addEventListener("click", () => {
        const leafCount = this.workspace.tree.collectLeafSetIds(group.id).length;
        if (this.workspace.manager.sets.length - leafCount <= 0) {
          UIHelper.showNotification("At least one set is required");
          return;
        }
        const confirmed = window.confirm(`Delete this group and its ${leafCount} set(s)?`);
        if (!confirmed) return;
        this.workspace.deleteGroup(group.id);
        this._rebuild();
      });

      if (this._keyboardAccessible) {
        headerEl.querySelector('[data-action="move-up"]').addEventListener("click", () => {
          this.workspace.tree.moveWithinParent(group.id, -1);
          this._rebuild();
        });
        headerEl.querySelector('[data-action="move-down"]').addEventListener("click", () => {
          this.workspace.tree.moveWithinParent(group.id, 1);
          this._rebuild();
        });
      }

      this._makeDraggable(headerEl.querySelector('[data-role="drag-handle"]'), group.id);
    }

    // Any group (including root) is a drop target: dropping directly into its children area
    // (not onto a specific sibling card) appends the dragged node at the end of this group.
    const childrenEl = cardEl.querySelector(":scope > .rsp-group-children");
    if (childrenEl) this._makeContainerDropTarget(childrenEl, group.id);

    // The header is also a sibling-relative drop target (before/after), plus a middle "into
    // this group" zone - the only way to drop into a collapsed or currently empty group, since
    // there is no children area rendered/reachable in that case.
    this._makeSiblingDropTarget(headerEl, group.id, { supportsInto: true });

    // + Set / + Group only exist on the root: create there, then drag into any nested group -
    // repeating them on every group just adds clutter now that drag and drop covers moving
    // things around.
    if (isRoot) {
      headerEl.querySelector('[data-action="add-set"]').addEventListener("click", () => {
        this.workspace.createSet(group.id, {});
        this._rebuild();
      });
      headerEl.querySelector('[data-action="add-group"]').addEventListener("click", () => {
        this.workspace.createGroup(group.id, "union", "Group");
        this._rebuild();
      });
    }
  }

  _bindSetCard(set) {
    const cardEl = this.container.querySelector(`.rsp-set-card[data-set-id="${set.id}"]`);
    if (!cardEl) return;

    cardEl.querySelector('[data-action="toggle-set-collapse"]').addEventListener("click", () => {
      this.workspace.manager.toggleSetCollapsed(set.id);
      this._rebuild();
    });

    if (this._keyboardAccessible) {
      cardEl.querySelector('[data-action="move-up"]').addEventListener("click", () => {
        this.workspace.tree.moveWithinParent(set.id, -1);
        this._rebuild();
      });
      cardEl.querySelector('[data-action="move-down"]').addEventListener("click", () => {
        this.workspace.tree.moveWithinParent(set.id, 1);
        this._rebuild();
      });
    }

    this._makeDraggable(cardEl.querySelector('[data-role="drag-handle"]'), set.id);
    const setHeaderEl = cardEl.querySelector(":scope > .rsp-set-card-header");
    this._makeSiblingDropTarget(setHeaderEl, set.id, { supportsInto: false });

    const enabledCheckbox = cardEl.querySelector('[data-role="enabled"]');
    enabledCheckbox.addEventListener("change", () => {
      this.workspace.manager.updateSet(set.id, { enabled: enabledCheckbox.checked });
      this._recompute();
    });

    const colorInput = cardEl.querySelector('[data-role="color"]');
    colorInput.addEventListener("input", () => {
      this.workspace.manager.updateSet(set.id, { color: colorInput.value });
      cardEl.style.setProperty("--set-color", colorInput.value);
      this._recompute();
    });

    const nameInput = cardEl.querySelector('[data-role="name"]');
    nameInput.addEventListener("change", () => {
      this.workspace.manager.updateSet(set.id, { name: nameInput.value.trim() || set.name });
    });

    cardEl.querySelector('[data-action="duplicate"]').addEventListener("click", () => {
      this.workspace.duplicateSet(set.id);
      this._rebuild();
    });

    cardEl.querySelector('[data-action="delete"]').addEventListener("click", () => {
      if (this.workspace.manager.sets.length <= 1) {
        UIHelper.showNotification("At least one set is required");
        return;
      }
      this.workspace.deleteSet(set.id);
      this._rebuild();
    });

    if (!set.collapsed) {
      this._bindChoices(cardEl, set);
      this._bindSpeedInputs(cardEl, set);
      this._bindAdvancedFilters(cardEl, set);
    }
  }

  _bindChoices(cardEl, set) {
    const reagentEl = cardEl.querySelector('[data-role="reagents"]');
    const productEl = cardEl.querySelector('[data-role="product"]');

    const choicesInitializer = new ChoicesInitializer(null, null, this.reactionFilter, this.eventBus, this.dataRepo);
    const { reagentChoices, productChoices } = choicesInitializer.createChoicesPair(
      this.Choices,
      reagentEl,
      productEl,
      set.reagents,
      set.product,
    );

    this._choicesInstances.set(set.id, { reagentChoices, productChoices });

    reagentEl.addEventListener("change", () => {
      const values = reagentChoices.getValue(true);
      this.workspace.manager.updateSet(set.id, { reagents: values });
      ChoicesInitializer.refreshChoices(
        productChoices,
        this.reactionFilter.getAvailableProducts(values),
        set.product ? [set.product] : [],
      );
      this._recompute();
    });

    productEl.addEventListener("change", () => {
      const values = productChoices.getValue(true);
      const product = Array.isArray(values) && values.length > 0 ? values[0] : "";
      this.workspace.manager.updateSet(set.id, { product });
      ChoicesInitializer.refreshChoices(reagentChoices, this.reactionFilter.getAvailableReagents(set.reagents, product), set.reagents);
      this._recompute();
    });
  }

  _bindSpeedInputs(cardEl, set) {
    const minSpeedInput = cardEl.querySelector('[data-role="min-speed"]');
    minSpeedInput.addEventListener("input", () => {
      this.workspace.manager.updateSet(set.id, { minSpeed: parseInt(minSpeedInput.value, 10) || 0 });
      this._recompute();
    });

    const maxSpeedInput = cardEl.querySelector('[data-role="max-speed"]');
    maxSpeedInput.addEventListener("input", () => {
      this.workspace.manager.updateSet(set.id, { maxSpeed: parseInt(maxSpeedInput.value, 10) || 0 });
      this._recompute();
    });
  }

  _bindAdvancedFilters(cardEl, set) {
    const excludeCatalystsEl = cardEl.querySelector('[data-role="exclude-catalysts"]');
    const onlyCatalystsEl = cardEl.querySelector('[data-role="only-catalysts"]');

    excludeCatalystsEl.addEventListener("change", () => {
      const changes = { excludeCatalysts: excludeCatalystsEl.checked };
      if (excludeCatalystsEl.checked) {
        changes.onlyCatalysts = false;
        onlyCatalystsEl.checked = false;
      }
      this.workspace.manager.updateSetFilters(set.id, changes);
      this._recompute();
    });

    onlyCatalystsEl.addEventListener("change", () => {
      const changes = { onlyCatalysts: onlyCatalystsEl.checked };
      if (onlyCatalystsEl.checked) {
        changes.excludeCatalysts = false;
        excludeCatalystsEl.checked = false;
      }
      this.workspace.manager.updateSetFilters(set.id, changes);
      this._recompute();
    });

    const bindNumber = (role, key) => {
      const el = cardEl.querySelector(`[data-role="${role}"]`);
      el.addEventListener("input", () => {
        this.workspace.manager.updateSetFilters(set.id, { [key]: parseInt(el.value, 10) || 0 });
        this._recompute();
      });
    };
    bindNumber("min-reagent-count", "minReagentCount");
    bindNumber("max-reagent-count", "maxReagentCount");
    bindNumber("min-product-count", "minProductCount");
    bindNumber("max-product-count", "maxProductCount");

    const bindTagList = (role, key) => {
      const el = cardEl.querySelector(`[data-role="${role}"]`);
      el.addEventListener("change", () => {
        const tags = el.value
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
        this.workspace.manager.updateSetFilters(set.id, { [key]: tags });
        this._recompute();
      });
    };
    bindTagList("require-tags", "requireTags");
    bindTagList("exclude-tags", "excludeTags");

    const nameSearchEl = cardEl.querySelector('[data-role="name-search"]');
    nameSearchEl.addEventListener("input", () => {
      this.workspace.manager.updateSetFilters(set.id, { nameSearch: nameSearchEl.value });
      this._recompute();
    });
  }

  // -------------------------------------------------------------------
  // Drag and drop (reorder within a group, or move into a different group)
  // -------------------------------------------------------------------
  // Only the small "Move" handle in a header is draggable="true" (not the whole card), so
  // starting a drag never interferes with clicking a checkbox/button or editing a text field.
  //
  // Every header is a drop target, hit-tested against ITS OWN bounding box (not the whole card,
  // which could be very tall once a set/group is expanded with children):
  //  - set headers only support "before"/"after" (top half / bottom half): a set cannot contain
  //    other nodes.
  //  - group headers support three zones: top 25% = before, bottom 25% = after, middle 50% =
  //    "into this group" (appended at the end). This is what makes it possible to drop directly
  //    into a group even while it is collapsed or currently empty (no children area to target).
  // A group's children container (when visible) is a second, more spacious "into this group"
  // target, with a minimum height and an empty-state hint so an empty group is never a zero-size,
  // impossible-to-hit drop zone.

  _makeDraggable(handleEl, nodeId) {
    if (!handleEl) return;
    handleEl.setAttribute("draggable", "true");

    handleEl.addEventListener("dragstart", (event) => {
      this._draggedNodeId = nodeId;
      event.dataTransfer?.setData("text/plain", nodeId);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
      handleEl.closest(".rsp-set-card, .rsp-group")?.classList.add("rsp-dragging");
    });

    handleEl.addEventListener("dragend", () => {
      handleEl.closest(".rsp-set-card, .rsp-group")?.classList.remove("rsp-dragging");
      this._draggedNodeId = null;
      this._clearDropIndicators();
    });
  }

  // headerEl: the element used both to hit-test the pointer position and to show the drop
  // indicator. targetNodeId: the set or group this header belongs to. supportsInto: whether a
  // middle-zone drop should be interpreted as "move into this node" (only meaningful for groups).
  _makeSiblingDropTarget(headerEl, targetNodeId, { supportsInto = false } = {}) {
    headerEl.addEventListener("dragover", (event) => {
      if (!this._draggedNodeId || this._draggedNodeId === targetNodeId) return;
      event.preventDefault();
      event.stopPropagation();
      const zone = this._getDropZone(headerEl, event.clientY, supportsInto);
      this._clearDropIndicators();
      headerEl.classList.add(`rsp-drop-${zone}`);
    });

    headerEl.addEventListener("dragleave", () => {
      headerEl.classList.remove("rsp-drop-before", "rsp-drop-after", "rsp-drop-into");
    });

    headerEl.addEventListener("drop", (event) => {
      if (!this._draggedNodeId || this._draggedNodeId === targetNodeId) return;
      event.preventDefault();
      event.stopPropagation();
      const zone = this._getDropZone(headerEl, event.clientY, supportsInto);
      const draggedId = this._draggedNodeId;
      this._draggedNodeId = null;
      this._clearDropIndicators();
      if (zone === "into") {
        this._performDropIntoGroup(draggedId, targetNodeId);
      } else {
        this._performSiblingDrop(draggedId, targetNodeId, zone);
      }
    });
  }

  _makeContainerDropTarget(containerEl, groupId) {
    containerEl.addEventListener("dragover", (event) => {
      if (!this._draggedNodeId) return;
      event.preventDefault();
      event.stopPropagation();
      this._clearDropIndicators();
      containerEl.classList.add("rsp-drop-into");
    });

    containerEl.addEventListener("dragleave", () => {
      containerEl.classList.remove("rsp-drop-into");
    });

    containerEl.addEventListener("drop", (event) => {
      if (!this._draggedNodeId) return;
      event.preventDefault();
      event.stopPropagation();
      const draggedId = this._draggedNodeId;
      this._draggedNodeId = null;
      this._clearDropIndicators();
      this._performDropIntoGroup(draggedId, groupId);
    });
  }

  // Splits el's own bounding box into before/after (2 zones) or before/into/after (3 zones,
  // when supportsInto is true) based on where clientY falls.
  _getDropZone(el, clientY, supportsInto) {
    const rect = typeof el.getBoundingClientRect === "function" ? el.getBoundingClientRect() : null;
    if (!rect || rect.height === 0) return supportsInto ? "into" : "before";

    const ratio = (clientY - rect.top) / rect.height;
    if (!supportsInto) return ratio < 0.5 ? "before" : "after";
    if (ratio < 0.25) return "before";
    if (ratio > 0.75) return "after";
    return "into";
  }

  // Inserts draggedId as a sibling of targetNodeId (in targetNodeId's own parent), before or
  // after it. Works whether draggedId already lives in that parent (pure reorder) or comes from
  // elsewhere in the tree (reparent + position in one move).
  _performSiblingDrop(draggedId, targetNodeId, position) {
    if (draggedId === targetNodeId) return;
    const targetNode = this.workspace.tree.getNode(targetNodeId);
    if (!targetNode) return;
    const parent = this.workspace.tree.getNode(targetNode.parentId);
    if (!parent) return;

    const siblingsWithoutDragged = parent.children.filter((id) => id !== draggedId);
    let index = siblingsWithoutDragged.indexOf(targetNodeId);
    if (index === -1) return;
    if (position === "after") index += 1;

    this.workspace.tree.moveNode(draggedId, parent.id, index);
    this._rebuild();
  }

  _performDropIntoGroup(draggedId, groupId) {
    if (draggedId === groupId) return;
    this.workspace.tree.moveNode(draggedId, groupId);
    this._rebuild();
  }

  _clearDropIndicators() {
    this.container?.querySelectorAll(".rsp-drop-before, .rsp-drop-after, .rsp-drop-into").forEach((el) => {
      el.classList.remove("rsp-drop-before", "rsp-drop-after", "rsp-drop-into");
    });
  }

  _destroyChoicesInstances() {
    this._choicesInstances.forEach(({ reagentChoices, productChoices }) => {
      try {
        reagentChoices?.destroy();
        productChoices?.destroy();
      } catch (error) {
        // Choices.js can throw if the underlying element was already removed from the DOM;
        // safe to ignore since we are tearing everything down anyway.
      }
    });
    this._choicesInstances.clear();
  }

  // -------------------------------------------------------------------
  // Recompute and live counters
  // -------------------------------------------------------------------

  _recompute() {
    const result = this.resolver.resolve(this.workspace);
    this._lastResult = result;
    this._updateCounts(result);
    this.onSetsResolved(result);
  }

  // Re-renders the graph from the last resolved result without re-running the resolver. Safe to
  // call whenever something that affects how the graph looks - but not which reactions are
  // included, so no need to re-resolve the reaction sets - changes elsewhere, e.g. a tag's
  // visibility being toggled from the graph itself (a "stateChanged" event unrelated to any
  // set's reagents/product/filters).
  refreshGraphOnly() {
    if (this._lastResult) this.onSetsResolved(this._lastResult);
  }

  _updateCounts(result) {
    this.workspace.manager.sets.forEach((set) => {
      const el = this.container.querySelector(`.rsp-set-card[data-set-id="${set.id}"] [data-role="count"]`);
      if (el) el.textContent = `${result.perSetCounts[set.id] || 0} reactions`;
    });

    this.workspace.tree.nodes.forEach((node) => {
      if (node.type !== "group") return;
      const headerEl = this.container.querySelector(`.rsp-group[data-group-id="${node.id}"] > .rsp-group-header`);
      if (!headerEl) return;
      const countEl = headerEl.querySelector('[data-role="group-count"]');
      if (!countEl) return;
      const total = node.id === this.workspace.tree.rootId ? result.totalCount : this.resolver.resolve(this.workspace, node.id).totalCount;
      countEl.textContent = `${total} reactions`;
    });

    const summaryEl = this.container.querySelector("#rsp-summary");
    if (summaryEl) {
      summaryEl.textContent = `${result.totalCount} reactions shown in total`;
    }
  }

  // -------------------------------------------------------------------
  // Styles (self-contained, following the same pattern as LegendManager)
  // -------------------------------------------------------------------

  _injectStyles() {
    if (ReactionSetPanel._stylesInjected) return;

    const style = document.createElement("style");
    style.id = "reaction-set-panel-styles";
    style.textContent = `
      .reaction-set-panel {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 15px;
        background-color: rgba(0, 0, 0, 0.7);
        border-radius: 8px;
        color: #fff;
        font-size: 13px;
        width: 400px;
        box-sizing: border-box;
        max-height: 90vh;
        overflow-y: auto;
      }

      .rsp-hidden-tab {
        cursor: pointer;
        width: 44px;
        min-height: 200px;
        height: 100%;
        border: 1px solid #555;
        background: rgba(0, 0, 0, 0.7);
        color: #fff;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 10px 0;
      }

      .rsp-hidden-tab-text {
        writing-mode: vertical-rl;
        text-orientation: mixed;
        font-size: 12px;
        white-space: nowrap;
      }

      .rsp-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
        border-bottom: 1px solid #555;
        padding-bottom: 10px;
      }

      .rsp-header h3 {
        margin: 0;
        font-size: 16px;
      }

      .rsp-a11y-toggle {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 11px;
        color: #ccc;
        cursor: pointer;
      }

      .rsp-btn {
        cursor: pointer;
        border: 1px solid #555;
        background: #2a2a2a;
        color: #fff;
        border-radius: 4px;
        padding: 6px 10px;
        font-size: 12px;
      }

      .rsp-btn:hover {
        background: #3a3a3a;
      }

      .rsp-bulk-actions {
        display: flex;
        gap: 6px;
      }

      .rsp-shortcuts summary {
        cursor: pointer;
        font-size: 12px;
        color: #45b7d1;
      }

      .rsp-shortcuts-body {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-top: 8px;
      }

      .rsp-shortcuts-hint {
        margin: 0;
        font-size: 11px;
        color: #999;
      }

      .rsp-shortcut-row {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        font-size: 11px;
        border: 1px solid #444;
        border-radius: 4px;
        padding: 6px;
      }

      .rsp-shortcut-label {
        flex: 1;
        min-width: 140px;
        color: #ccc;
      }

      .rsp-shortcut-row label {
        display: flex;
        align-items: center;
        gap: 3px;
        white-space: nowrap;
      }

      .rsp-shortcut-row select[data-role="trigger"] {
        background: #2a2a2a;
        color: #fff;
        border: 1px solid #555;
        border-radius: 4px;
        padding: 3px;
        font-size: 11px;
      }

      .rsp-shortcut-combo {
        font-weight: bold;
        color: #ffd93d;
        white-space: nowrap;
      }

      .rsp-shortcuts-body button {
        align-self: flex-start;
        cursor: pointer;
        border: 1px solid #555;
        background: #2a2a2a;
        color: #fff;
        border-radius: 4px;
        padding: 4px 8px;
        font-size: 11px;
      }

      .rsp-bulk-actions button {
        cursor: pointer;
        border: 1px solid #555;
        background: #2a2a2a;
        color: #fff;
        border-radius: 4px;
        padding: 4px 8px;
        font-size: 11px;
      }

      .rsp-collapse-btn {
        cursor: pointer;
        border: 1px solid #555;
        background: #2a2a2a;
        color: #fff;
        border-radius: 4px;
        width: 22px;
        height: 22px;
        font-size: 13px;
        line-height: 1;
        flex-shrink: 0;
      }

      .rsp-drag-handle {
        cursor: grab;
        border: 1px solid #555;
        background: #2a2a2a;
        color: #999;
        border-radius: 4px;
        padding: 3px 6px;
        font-size: 10px;
        flex-shrink: 0;
        user-select: none;
      }

      .rsp-drag-handle:active {
        cursor: grabbing;
      }

      .rsp-dragging {
        opacity: 0.4;
      }

      .rsp-drop-before {
        box-shadow: inset 0 3px 0 0 #45b7d1;
      }

      .rsp-drop-after {
        box-shadow: inset 0 -3px 0 0 #45b7d1;
      }

      .rsp-drop-into {
        outline: 2px dashed #45b7d1;
        outline-offset: -2px;
        background: rgba(69, 183, 209, 0.08);
      }

      .rsp-group {
        border: 1px solid #555;
        border-radius: 6px;
        padding: 8px;
        background: rgba(255, 255, 255, 0.02);
      }

      .rsp-group-root {
        border: none;
        background: none;
        padding: 0;
      }

      .rsp-group-header {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
      }

      .rsp-group-name,
      .rsp-group-name-input {
        font-weight: bold;
        font-size: 12px;
      }

      .rsp-group-name-input {
        background: #1a1a1a;
        color: #fff;
        border: 1px solid #555;
        border-radius: 4px;
        padding: 3px 6px;
        min-width: 60px;
      }

      .rsp-group-count {
        font-size: 11px;
        color: #aaa;
        white-space: nowrap;
      }

      .rsp-group-actions {
        display: flex;
        gap: 4px;
        flex-wrap: wrap;
      }

      .rsp-group-actions button {
        cursor: pointer;
        border: 1px solid #555;
        background: #2a2a2a;
        color: #fff;
        border-radius: 4px;
        padding: 2px 6px;
        font-size: 11px;
      }

      .rsp-group-children {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-top: 8px;
        padding-left: 12px;
        border-left: 2px solid #444;
        min-height: 28px;
      }

      .rsp-group-children:empty {
        border-left-style: dashed;
      }

      .rsp-group-children:empty::before {
        content: "Drop a set or group here";
        display: block;
        font-size: 10px;
        font-style: italic;
        color: #666;
        padding: 6px 0;
      }

      select[data-role="group-mode"] {
        background: #2a2a2a;
        color: #fff;
        border: 1px solid #555;
        border-radius: 4px;
        padding: 3px;
        font-size: 11px;
        max-width: 160px;
      }

      .rsp-set-card {
        border: 2px solid var(--set-color, #555);
        border-radius: 6px;
        padding: 10px;
        background: rgba(255, 255, 255, 0.03);
      }

      .rsp-set-card-header {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
      }

      .rsp-set-name {
        flex: 1;
        min-width: 60px;
        background: #1a1a1a;
        color: #fff;
        border: 1px solid #555;
        border-radius: 4px;
        padding: 4px 6px;
      }

      .rsp-set-count {
        font-size: 11px;
        color: #aaa;
        white-space: nowrap;
      }

      .rsp-set-card-actions {
        display: flex;
        gap: 4px;
      }

      .rsp-set-card-actions button {
        cursor: pointer;
        border: 1px solid #555;
        background: #2a2a2a;
        color: #fff;
        border-radius: 4px;
        padding: 2px 6px;
        font-size: 11px;
      }

      .rsp-set-card-body {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-top: 8px;
      }

      .rsp-field label {
        display: block;
        font-size: 11px;
        color: #ccc;
        margin-bottom: 2px;
      }

      .rsp-speed-row {
        display: flex;
        gap: 12px;
      }

      .rsp-speed-row label {
        display: flex;
        flex-direction: column;
        font-size: 11px;
        color: #ccc;
        gap: 2px;
      }

      .rsp-speed-row input {
        width: 70px;
      }

      .rsp-advanced summary {
        cursor: pointer;
        font-size: 12px;
        color: #45b7d1;
        margin: 4px 0;
      }

      .rsp-advanced-body {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 6px 0 0 4px;
        font-size: 11px;
        color: #ccc;
      }

      .rsp-checkbox-row {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .rsp-count-range label {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .rsp-count-range input {
        width: 45px;
      }

      .rsp-advanced-body input[type="text"] {
        width: 100%;
        box-sizing: border-box;
        background: #1a1a1a;
        color: #fff;
        border: 1px solid #555;
        border-radius: 4px;
        padding: 4px 6px;
        margin-top: 2px;
      }

      .rsp-summary {
        font-size: 12px;
        color: #ffd93d;
        font-weight: bold;
        border-top: 1px solid #555;
        padding-top: 8px;
      }

      .rsp-config-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        border-top: 1px solid #555;
        padding-top: 10px;
      }

      .rsp-config-actions button,
      .rsp-file-label {
        cursor: pointer;
        border: 1px solid #555;
        background: #2a2a2a;
        color: #fff;
        border-radius: 4px;
        padding: 6px 8px;
        font-size: 11px;
      }

      .rsp-config-actions select {
        background: #2a2a2a;
        color: #fff;
        border: 1px solid #555;
        border-radius: 4px;
        padding: 6px;
        font-size: 11px;
        max-width: 140px;
      }
    `;
    document.head.appendChild(style);
    ReactionSetPanel._stylesInjected = true;
  }
}
