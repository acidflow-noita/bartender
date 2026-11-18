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
import { iconMarkup } from "../../ui/icons.js";
import { downloadBlob } from "./download.js";
import { GROUP_MODES } from "../core/ReactionGroupTree.js";

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

// Compact square button showing only an icon; the label goes to the tooltip and screen readers.
function iconButton(action, iconName, label, { extraClass = "", attrs = "" } = {}) {
  return `<button type="button" class="rsp-icon-btn ${extraClass}" data-action="${action}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" ${attrs}>${iconMarkup(iconName)}</button>`;
}

// Button with an icon and a short visible label (title = longer explanation).
function labeledButton(action, iconName, label, title, { extraClass = "", attrs = "" } = {}) {
  return `<button type="button" class="rsp-labeled-btn ${extraClass}" data-action="${action}" title="${escapeHtml(title)}" ${attrs}>${iconMarkup(iconName)}<span>${escapeHtml(label)}</span></button>`;
}

const dragHandle = () =>
  `<span class="rsp-drag-handle" data-role="drag-handle" title="Drag to reorder or move into another group" aria-label="Drag to reorder">${iconMarkup("grip-vertical")}</span>`;

export class ReactionSetPanel {
  static _stylesInjected = false;

  constructor({ workspace, resolver, reactionFilter, dataRepo, eventBus, ChoicesLib, onSetsResolved, storage = null, hideable = true }) {
    this.workspace = workspace;
    this.resolver = resolver;
    this.reactionFilter = reactionFilter;
    this.dataRepo = dataRepo;
    this.eventBus = eventBus;
    this.Choices = ChoicesLib;
    this.onSetsResolved = onSetsResolved || (() => {});
    this.storage = storage || (typeof window !== "undefined" && window.localStorage ? window.localStorage : null);

    this.container = null;
    this._choicesInstances = new Map(); // setId -> { reagentChoices, productChoices }
    this._lastResult = null;
    // When the host page already controls the panel's visibility (e.g. a collapsible sidebar),
    // pass hideable: false to drop the panel's own hide/show tab.
    this.hideable = hideable;
    this._hidden = hideable && this._readHiddenPreference();
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
    this._bindTreeDropZone();
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
          ${this.hideable ? `<button type="button" class="rsp-btn" data-action="hide-panel" title="Hide this panel">Hide panel</button>` : ""}
        </div>


        <div class="rsp-bulk-actions">
          ${labeledButton("collapse-all", "arrows-collapse", "Collapse all", "Fold every set and group down to their header")}
          ${labeledButton("expand-all", "arrows-expand", "Expand all", "Unfold every set and group")}
        </div>

        <div id="reactionSetTree">
          ${this._renderNode(this.workspace.tree.root)}
        </div>

        ${this._renderExcluded()}

        <div class="rsp-summary" id="rsp-summary">No reactions yet</div>

        <section class="rsp-configs" aria-label="Configurations">
          <div class="rsp-configs-title">Configurations</div>
          <div class="rsp-configs-row">
            <select data-role="saved-configs" title="Saved configurations" aria-label="Saved configurations"></select>
            ${iconButton("load-config", "folder2-open", "Load the selected configuration")}
            ${iconButton("delete-config", "trash3", "Delete the selected configuration", { extraClass: "rsp-danger" })}
          </div>
          <div class="rsp-configs-toolbar">
            ${labeledButton("save-config", "floppy", "Save as…", "Save the current sets and groups under a name")}
            <label class="rsp-labeled-btn rsp-file-label" title="Import a configuration from a JSON file">
              ${iconMarkup("upload")}<span>Import</span>
              <input type="file" accept="application/json" data-role="import-file" hidden />
            </label>
            ${labeledButton("download-config", "download", "Download", "Download the current configuration as a JSON file")}
            ${labeledButton("export-csv", "filetype-csv", "CSV", "Export the current reaction list as CSV")}
            ${labeledButton("reset-all", "arrow-counterclockwise", "Reset", "Remove every set and group and start over", { extraClass: "rsp-danger rsp-push-end" })}
          </div>
        </section>
      </div>
    `;
  }

  // Reactions excluded from the result (right-click a reaction in the graph), each restorable.
  // Listed from their saved snapshot, so even one the current reaction source lacks shows up.
  _renderExcluded() {
    const excluded = [...this.workspace.excluded.entries()];
    if (!excluded.length) return "";
    const items = excluded
      .map(([key, reaction]) => `
        <li class="rsp-excluded-item">
          <span class="rsp-excluded-name">${escapeHtml(UIHelper.reactionTitle(reaction, this.dataRepo))}</span>
          <span class="rsp-group-count">speed ${escapeHtml(String(reaction.reactionRate ?? "?"))}</span>
          ${iconButton("restore-reaction", "arrow-counterclockwise", "Restore: put this reaction back in the result", { attrs: `data-key="${escapeHtml(key)}"` })}
        </li>`)
      .join("");
    // Laid out like a group card (header: name, count, actions), each reaction like a set row.
    return `
      <details class="rsp-group rsp-excluded" open>
        <summary class="rsp-group-header">
          <span class="rsp-group-name">Excluded reactions</span>
          <span class="rsp-group-count">${excluded.length} ${excluded.length > 1 ? "reactions" : "reaction"}</span>
          <span class="rsp-group-actions">
            ${labeledButton("restore-all-reactions", "arrow-counterclockwise", "Restore all", "Put every excluded reaction back in the result")}
          </span>
        </summary>
        <ul class="rsp-excluded-list">${items}</ul>
      </details>
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
          ${isRoot ? "" : dragHandle()}
          ${iconButton("toggle-collapse", group.collapsed ? "chevron-right" : "chevron-down", group.collapsed ? "Expand" : "Collapse", { extraClass: "rsp-collapse-btn" })}
          ${isRoot ? "" : `<input type="checkbox" data-role="group-enabled" ${group.enabled !== false ? "checked" : ""} title="Enable/disable this group" />`}
          <select data-role="group-mode" title="How the children of this group combine">${modeOptions}</select>
          ${
            isRoot
              ? `<span class="rsp-group-name">${escapeHtml(group.name || "All reactions")}</span>`
              : `<input type="text" data-role="group-name" value="${escapeHtml(group.name)}" class="rsp-group-name-input" />`
          }
          <span class="rsp-group-count" data-role="group-count">0 reactions</span>
          <div class="rsp-group-actions">
            ${isRoot ? `${labeledButton("add-set", "plus-lg", "Set", "Add a new set to this group")}${labeledButton("add-group", "folder-plus", "Group", "Add a nested sub-group here")}` : ""}
            ${
              isRoot
                ? ""
                : `${this._keyboardAccessible ? `${iconButton("move-up", "arrow-up", "Move up")}${iconButton("move-down", "arrow-down", "Move down")}` : ""}
                   ${iconButton("ungroup", "folder-minus", "Ungroup (keep its contents)")}
                   ${iconButton("delete-group", "trash3", "Delete this group and everything inside it", { extraClass: "rsp-danger" })}`
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
          ${dragHandle()}
          ${iconButton("toggle-set-collapse", set.collapsed ? "chevron-right" : "chevron-down", set.collapsed ? "Expand" : "Collapse", { extraClass: "rsp-collapse-btn" })}
          <input type="checkbox" data-role="enabled" ${set.enabled ? "checked" : ""} title="Enable/disable this set" />
          <input type="color" data-role="color" value="${set.color}" title="Set color" />
          <input type="text" data-role="name" value="${escapeHtml(set.name)}" class="rsp-set-name" title="Set name" />
          <span class="rsp-set-count" data-role="count">0 reactions</span>
          <div class="rsp-set-card-actions">
            ${this._keyboardAccessible ? `${iconButton("move-up", "arrow-up", "Move up")}${iconButton("move-down", "arrow-down", "Move down")}` : ""}
            ${iconButton("duplicate", "copy", "Duplicate this set")}
            ${iconButton("delete", "trash3", "Delete this set", { extraClass: "rsp-danger" })}
          </div>
        </div>
        ${bodyHtml}
      </div>
    `;
  }

  // -------------------------------------------------------------------
  // Global controls
  // -------------------------------------------------------------------

  _bindGlobalControls() {
    this.container.querySelector('[data-action="hide-panel"]')?.addEventListener("click", () => this._toggleHidden());

    this.container.querySelector('[data-role="keyboard-accessible"]').addEventListener("change", () => {
      this._toggleKeyboardAccessible();
    });

    this.container.querySelectorAll('[data-action="restore-reaction"]').forEach((button) => {
      button.addEventListener("click", () => {
        this.workspace.restoreReaction(button.dataset.key);
        this._rebuild();
      });
    });
    this.container.querySelector('[data-action="restore-all-reactions"]')?.addEventListener("click", (event) => {
      event.preventDefault(); // it sits in the section's <summary>: don't also fold it
      this.workspace.restoreAllReactions();
      this._rebuild();
    });

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
      if (name && window.confirm(`Delete the saved configuration "${name}"?`)) {
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
      if (!window.confirm("Remove every set, group and excluded reaction and start over?")) return;
      this.workspace.reset(true);
      this._rebuild();
    });
  }

  _refreshSavedConfigsSelect() {
    const select = this.container.querySelector('[data-role="saved-configs"]');
    if (!select) return;

    const configs = this.workspace.listSavedConfigs();
    const date = (iso) => {
      const d = new Date(iso);
      return Number.isNaN(d.getTime()) ? "" : ` · ${d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`;
    };
    select.innerHTML = configs.length
      ? configs.map((c) => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}${escapeHtml(date(c.savedAt))}</option>`).join("")
      : `<option value="">No saved configurations</option>`;
    // Nothing to load or delete without a saved configuration.
    this.container.querySelectorAll('[data-action="load-config"], [data-action="delete-config"]').forEach((button) => {
      button.disabled = configs.length === 0;
    });
  }

  _downloadConfig() {
    const data = this.workspace.serialize();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    downloadBlob(blob, `noitalambic-reaction-sets-${Date.now()}.json`);
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
    downloadBlob(blob, `noitalambic-reactions-${Date.now()}.csv`);
    UIHelper.showNotification("Reactions exported as CSV");
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
        // At least one set must remain: deleting the group that holds every set replaces them
        // with a single empty set instead of silently refusing.
        const lastSets = this.workspace.manager.sets.length - leafCount <= 0;
        const message = `Delete this group and its ${leafCount} set(s)?` + (lastSets ? "\nA new empty set will be created." : "");
        if (!window.confirm(message)) return;
        this.workspace.deleteGroup(group.id);
        if (lastSets) this.workspace.createSet(this.workspace.tree.rootId, { name: "Set 1" });
        this._rebuild();
        UIHelper.showNotification(lastSets ? "Group deleted, started over with an empty set" : "Group deleted");
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
      // The last set is cleared instead of deleted, since at least one set must remain.
      if (this.workspace.manager.sets.length <= 1) {
        if (!window.confirm("This is the last set: clear its selection and filters instead?")) return;
        this.workspace.deleteSet(set.id);
        this.workspace.createSet(this.workspace.tree.rootId, { name: set.name, color: set.color });
        this._rebuild();
        UIHelper.showNotification("Last set cleared");
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

  // -------------------------------------------------------------------
  // Drag and drop (sets and groups, by their grip handle)
  // -------------------------------------------------------------------
  // One delegated set of listeners on the tree (see _bindTreeDropZone) works out, from the
  // pointer position, where the dragged node would land - {parentId, index} - and shows a single
  // indicator: an insertion line in the gap it would fill, or a dashed frame around the group it
  // would go into. Invalid places (a group into itself or its own descendants, around the root)
  // and no-op places (where it already is) show nothing and accept no drop.

  _makeDraggable(handleEl, nodeId) {
    if (!handleEl) return;
    handleEl.setAttribute("draggable", "true");

    handleEl.addEventListener("dragstart", (event) => {
      this._draggedNodeId = nodeId;
      const cardEl = handleEl.closest(".rsp-set-card, .rsp-group");
      if (event.dataTransfer) {
        event.dataTransfer.setData("text/plain", nodeId);
        event.dataTransfer.effectAllowed = "move";
        // Drag the whole card, not just the small grip.
        if (cardEl && typeof event.dataTransfer.setDragImage === "function") {
          const rect = cardEl.getBoundingClientRect();
          event.dataTransfer.setDragImage(cardEl, event.clientX - rect.left, event.clientY - rect.top);
        }
      }
      // After the drag image snapshot: dim the card left behind.
      const dim = () => cardEl?.classList.add("rsp-dragging");
      if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(dim);
      else dim();
    });

    handleEl.addEventListener("dragend", () => {
      handleEl.closest(".rsp-set-card, .rsp-group")?.classList.remove("rsp-dragging");
      this._draggedNodeId = null;
      this._clearDropIndicators();
    });
  }

  _bindTreeDropZone() {
    const treeEl = this.container.querySelector("#reactionSetTree");
    if (!treeEl) return;

    treeEl.addEventListener("dragover", (event) => {
      if (!this._draggedNodeId) return;
      const target = this._dropTargetAt(event.target, event.clientY);
      if (!target || target.noop) {
        this._clearDropIndicators();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "none";
        return;
      }
      event.preventDefault(); // accept the drop here
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      this._showDropIndicator(treeEl, target);
    });

    treeEl.addEventListener("dragleave", (event) => {
      if (!treeEl.contains(event.relatedTarget)) this._clearDropIndicators();
    });

    treeEl.addEventListener("drop", (event) => {
      if (!this._draggedNodeId) return;
      const target = this._dropTargetAt(event.target, event.clientY);
      const draggedId = this._draggedNodeId;
      this._draggedNodeId = null;
      this._clearDropIndicators();
      if (!target || target.noop) return;
      event.preventDefault();
      this.workspace.tree.moveNode(draggedId, target.parentId, target.index);
      this._rebuild();
    });
  }

  // Where the dragged node would land if dropped with the pointer over `el` at height clientY:
  // {parentId, index, line: {el, edge} | null, intoEl | null, noop} or null when not allowed.
  // index counts the parent's children without the dragged node (what tree.moveNode expects).
  _dropTargetAt(el, clientY) {
    const draggedId = this._draggedNodeId;
    const tree = this.workspace.tree;
    const hit = el?.closest?.(".rsp-set-card, .rsp-group");
    if (!draggedId || !hit || !this.container.contains(hit)) return null;

    const nodeIdOf = (cardEl) => cardEl.dataset.setId ?? cardEl.dataset.groupId;
    const rect = (target) => target.getBoundingClientRect();

    let place = null; // {relativeTo, edge} or {into, index | "end"}
    const hitId = nodeIdOf(hit);
    if (hit.classList.contains("rsp-set-card")) {
      const r = rect(hit);
      place = { relativeTo: hit, edge: clientY < r.top + r.height / 2 ? "before" : "after" };
    } else {
      const isRoot = hitId === tree.rootId;
      const header = hit.querySelector(":scope > .rsp-group-header");
      const headerRect = rect(header);
      const groupRect = rect(hit);
      if (clientY <= headerRect.bottom) {
        // Top of a (non-root) group's header: before the group; the rest of it: into the group,
        // first if it is open (it then shows right under the header), last if it is folded.
        if (!isRoot && clientY < headerRect.top + headerRect.height * 0.3) place = { relativeTo: hit, edge: "before" };
        else place = { into: hit, index: tree.getNode(hitId)?.collapsed ? "end" : 0 };
      } else if (!isRoot && clientY > groupRect.bottom - 8) {
        place = { relativeTo: hit, edge: "after" };
      } else {
        // Between the group's children: the gap closest to the pointer.
        const children = [...(hit.querySelector(":scope > .rsp-group-children")?.children ?? [])]
          .filter((child) => child.matches(".rsp-set-card, .rsp-group") && nodeIdOf(child) !== draggedId);
        const next = children.find((child) => clientY < rect(child).top + rect(child).height / 2);
        if (next) place = { relativeTo: next, edge: "before" };
        else if (children.length) place = { relativeTo: children[children.length - 1], edge: "after" };
        else place = { into: hit, index: 0 };
      }
    }

    let parentId, index, line = null, intoEl = null;
    if (place.into) {
      parentId = nodeIdOf(place.into);
      const siblings = (tree.getNode(parentId)?.children ?? []).filter((id) => id !== draggedId);
      index = place.index === "end" ? siblings.length : place.index;
      intoEl = place.into;
      const first = place.into.querySelector(":scope > .rsp-group-children > .rsp-set-card, :scope > .rsp-group-children > .rsp-group");
      if (index === 0 && first && nodeIdOf(first) !== draggedId) line = { el: first, edge: "before" };
    } else {
      const targetId = nodeIdOf(place.relativeTo);
      if (targetId === draggedId) return null;
      const targetNode = tree.getNode(targetId);
      if (!targetNode?.parentId) return null; // the root has no siblings
      parentId = targetNode.parentId;
      const siblings = tree.getNode(parentId).children.filter((id) => id !== draggedId);
      index = siblings.indexOf(targetId) + (place.edge === "after" ? 1 : 0);
      line = { el: place.relativeTo, edge: place.edge };
    }

    // A group can't go into itself or anything nested in it.
    if (tree._isSameOrDescendant(parentId, draggedId)) return null;
    const dragged = tree.getNode(draggedId);
    const currentIndex = tree.getNode(dragged?.parentId)?.children.indexOf(draggedId);
    const noop = dragged?.parentId === parentId && currentIndex === index;
    return { parentId, index, line, intoEl, noop };
  }

  // One indicator at a time: an insertion line over the gap, and/or a frame on the target group.
  _showDropIndicator(treeEl, target) {
    this._clearDropIndicators();
    if (target.intoEl) target.intoEl.classList.add("rsp-drop-into");
    if (!target.line) return;
    const treeRect = treeEl.getBoundingClientRect();
    const r = target.line.el.getBoundingClientRect();
    const y = target.line.edge === "before" ? r.top - 4 : r.bottom + 2;
    const line = document.createElement("div");
    line.className = "rsp-drop-line";
    line.style.top = `${y - treeRect.top + treeEl.scrollTop}px`;
    line.style.left = `${r.left - treeRect.left}px`;
    line.style.width = `${r.width}px`;
    treeEl.appendChild(line);
  }

  _clearDropIndicators() {
    this.container?.querySelectorAll(".rsp-drop-line").forEach((el) => el.remove());
    this.container?.querySelectorAll(".rsp-drop-into").forEach((el) => el.classList.remove("rsp-drop-into"));
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
      const excluded = result.excludedCount ? ` (${result.excludedCount} excluded)` : "";
      summaryEl.textContent = `${result.totalCount} reactions shown in total${excluded}`;
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
        color: var(--fg-body);
        font-size: var(--font-size-sm);
        min-width: 0;
      }

      .reaction-set-panel :is(input[type="number"], input[type="text"], select) {
        background: var(--bg-body);
        color: var(--fg-body);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-3);
        padding: 3px 6px;
        font-size: inherit;
      }

      .reaction-set-panel :is(input, select):focus-visible {
        outline: 2px solid var(--primary-focus-ring);
        outline-offset: 1px;
      }

      .reaction-set-panel input[type="checkbox"] {
        accent-color: var(--slate-400);
      }

      /* Every button of the panel (and the Import file label) looks like the site's outline
         buttons (btn-outline theme-secondary): a visible border, a hover state and a focus ring,
         so anything clickable reads as such. Rules below only set each one's size. */
      .reaction-set-panel :is(button:not(.rsp-hidden-tab), .rsp-file-label) {
        cursor: pointer;
        color: var(--secondary-fg);
        background: transparent;
        border: 1px solid var(--secondary-border);
        border-radius: var(--radius-3);
        transition: color .15s ease-in-out, background-color .15s ease-in-out, border-color .15s ease-in-out;
      }

      .reaction-set-panel :is(button:not(.rsp-hidden-tab), .rsp-file-label):hover {
        color: var(--secondary-fg-emphasis);
        background: var(--secondary-bg-muted);
        border-color: var(--secondary-fg);
      }

      .reaction-set-panel :is(button:not(.rsp-hidden-tab), .rsp-file-label):focus-visible,
      .reaction-set-panel .rsp-file-label:focus-within {
        outline: 2px solid var(--secondary-focus-ring, var(--secondary-fg));
        outline-offset: 1px;
      }

      .reaction-set-panel button:disabled {
        cursor: default;
        opacity: .5;
        background: transparent;
        border-color: var(--secondary-border);
      }

      .rsp-hidden-tab {
        cursor: pointer;
        width: 44px;
        min-height: 200px;
        height: 100%;
        border: 1px solid var(--border-color);
        background: var(--bg-1);
        color: var(--fg-body);
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
        border-bottom: 1px solid var(--border-color);
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
        color: var(--fg-3);
        cursor: pointer;
      }

      .rsp-btn {
        padding: 6px 10px;
        font-size: 12px;
      }

      .rsp-bulk-actions {
        display: flex;
        gap: 6px;
      }

      /* Icon-only button (row actions): a compact square, the label in its tooltip. */
      .reaction-set-panel .rsp-icon-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        padding: 0;
        font-size: 13px;
        line-height: 1;
        flex-shrink: 0;
      }

      /* Icon + short label (section actions). */
      .reaction-set-panel .rsp-labeled-btn {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 4px 9px;
        font-size: 11px;
        line-height: 1.2;
        white-space: nowrap;
      }

      .reaction-set-panel .rsp-labeled-btn svg {
        font-size: 13px;
        flex-shrink: 0;
      }

      /* Destructive actions (delete, reset) turn red on hover. */
      .reaction-set-panel .rsp-danger:hover:not(:disabled) {
        color: #ff8a8a;
        border-color: #ff6b6b;
        background: rgba(255, 107, 107, 0.12);
      }

      /* A <span> (drag source, not a button), styled like the panel's buttons. */
      .rsp-drag-handle {
        cursor: grab;
        color: var(--secondary-fg);
        border: 1px solid var(--secondary-border);
        border-radius: var(--radius-3);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 24px;
        font-size: 13px;
        flex-shrink: 0;
        user-select: none;
      }

      .rsp-drag-handle:hover {
        color: var(--secondary-fg-emphasis);
        background: var(--secondary-bg-muted);
        border-color: var(--secondary-fg);
      }

      .rsp-drag-handle:active {
        cursor: grabbing;
      }

      .rsp-dragging {
        opacity: 0.4;
      }

      #reactionSetTree {
        position: relative; /* anchors the insertion line */
      }

      /* Where a dragged set/group would land: a line in the gap, with a dot at its start... */
      .rsp-drop-line {
        position: absolute;
        height: 2px;
        background: #45b7d1;
        border-radius: 1px;
        pointer-events: none;
        z-index: 2;
      }

      .rsp-drop-line::before {
        content: "";
        position: absolute;
        left: -4px;
        top: -3px;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #45b7d1;
      }

      /* ...or the group it would go into. */
      .rsp-drop-into {
        outline: 2px dashed #45b7d1;
        outline-offset: 2px;
        background: rgba(69, 183, 209, 0.08);
      }

      .rsp-group {
        border: 1px solid var(--border-color);
        border-radius: var(--radius-4);
        padding: 8px;
        background: var(--bg-1);
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
        background: var(--bg-body);
        color: var(--fg-body);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-3);
        padding: 3px 6px;
        min-width: 60px;
      }

      .rsp-group-count {
        font-size: 11px;
        color: var(--fg-3);
        white-space: nowrap;
      }

      .rsp-group-actions {
        display: flex;
        gap: 4px;
        flex-wrap: wrap;
      }

      .rsp-group-actions button,
      .rsp-excluded-item button {
        padding: 2px 6px;
        font-size: 11px;
      }

      .rsp-group-children {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-top: 8px;
        padding-left: 12px;
        border-left: 2px solid var(--border-color);
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
        color: var(--fg-3);
        padding: 6px 0;
      }

      select[data-role="group-mode"] {
        background: var(--bg-body);
        color: var(--fg-body);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-3);
        padding: 3px;
        font-size: 11px;
        max-width: 160px;
      }

      .rsp-set-card {
        border: 2px solid var(--set-color, var(--border-color));
        border-radius: var(--radius-4);
        padding: 10px;
        background: var(--bg-body);
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
        background: var(--bg-body);
        color: var(--fg-body);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-3);
        padding: 4px 6px;
      }

      .rsp-set-count {
        font-size: 11px;
        color: var(--fg-3);
        white-space: nowrap;
      }

      .rsp-set-card-actions {
        display: flex;
        gap: 4px;
      }

      .rsp-set-card-actions button {
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
        color: var(--fg-3);
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
        color: var(--fg-3);
        gap: 2px;
      }

      .rsp-speed-row input {
        width: 70px;
      }

      .rsp-advanced summary {
        cursor: pointer;
        font-size: 12px;
        color: var(--fg-1);
        margin: 4px 0;
      }

      .rsp-advanced-body {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 6px 0 0 4px;
        font-size: 11px;
        color: var(--fg-3);
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
        background: var(--bg-body);
        color: var(--fg-body);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-3);
        padding: 4px 6px;
        margin-top: 2px;
      }

      .rsp-excluded > summary {
        cursor: pointer;
      }

      .rsp-excluded .rsp-group-actions {
        margin-left: auto;
      }

      .rsp-excluded-list {
        list-style: none;
        margin: 8px 0 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .rsp-excluded-item {
        display: flex;
        align-items: center;
        gap: 6px;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-3);
        padding: 4px 6px;
        background: var(--bg-body);
        font-size: 12px;
      }

      .rsp-excluded-name {
        flex: 1;
        min-width: 0;
        overflow-wrap: anywhere;
      }

      .rsp-summary {
        font-size: 12px;
        color: var(--fg-1);
        font-weight: bold;
        border-top: 1px solid var(--border-color);
        padding-top: 8px;
      }

      .rsp-configs {
        display: flex;
        flex-direction: column;
        gap: 8px;
        border-top: 1px solid var(--border-color);
        padding-top: 10px;
      }

      .rsp-configs-title {
        font-size: 11px;
        font-weight: bold;
        text-transform: uppercase;
        letter-spacing: .04em;
        color: var(--fg-3);
      }

      .rsp-configs-row {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .rsp-configs-row select {
        flex: 1;
        min-width: 0;
        height: 26px;
        padding: 2px 6px;
        font-size: 12px;
      }

      .rsp-configs-toolbar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
      }

      .reaction-set-panel .rsp-push-end {
        margin-left: auto;
      }
    `;
    document.head.appendChild(style);
    ReactionSetPanel._stylesInjected = true;
  }
}
