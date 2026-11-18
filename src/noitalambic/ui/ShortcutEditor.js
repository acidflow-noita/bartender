// ============================================================================
// SHORTCUT EDITOR - Lists the graph mouse shortcuts and lets the user rebind them
// ============================================================================
// Each action shows its current shortcut on a button. Clicking that button starts recording:
// the next Click / Double-click / Right-click made on it (with any held modifiers) becomes the
// new shortcut. Escape or leaving the button cancels. A gesture already used by another action
// of the same node type swaps the two, and the notification says so.

import { SCOPE_LABELS, comboFromEvent, formatCombo, RESERVED_COMBO } from "../core/ShortcutManager.js";
import { UIHelper } from "./UIHelper.js";

// Delay used to tell a single click from the first click of a double-click while recording.
const DOUBLE_CLICK_DELAY = 300;

const modifiersOf = (event) => ({ ctrlKey: event.ctrlKey, shiftKey: event.shiftKey, altKey: event.altKey });

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export class ShortcutEditor {
  constructor(shortcutManager, { notify = (message) => UIHelper.showNotification(message) } = {}) {
    this.manager = shortcutManager;
    this.notify = notify;
    this.container = null;
    this._recording = null; // {actionId, button, timer}
    this._unsubscribe = null;
  }

  mount(container) {
    this.unmount();
    injectStyles();
    this.container = container;
    this._unsubscribe = this.manager.subscribe(() => this.render());
    this.render();
    return this;
  }

  unmount() {
    this._stopRecording();
    this._unsubscribe?.();
    this._unsubscribe = null;
    if (this.container) this.container.innerHTML = "";
    this.container = null;
  }

  render() {
    if (!this.container) return;
    this._stopRecording();

    const scopes = [...new Set(this.manager.getActions().map((action) => action.scope))];
    const groups = scopes
      .map((scope) => {
        const rows = this.manager.getActions(scope).map((action) => this._renderRow(action)).join("");
        return `<div class="shortcut-editor-group"><div class="shortcut-editor-scope">${escapeHtml(SCOPE_LABELS[scope] ?? scope)}</div>${rows}</div>`;
      })
      .join("");

    this.container.innerHTML = `
      <div class="shortcut-editor">
        ${groups}
        <div class="shortcut-editor-group">
          <div class="shortcut-editor-row"><kbd class="legend-kbd">${formatCombo(RESERVED_COMBO)}</kbd><span class="legend-text">Any node: highlight connections</span></div>
          <div class="shortcut-editor-row"><kbd class="legend-kbd">${formatCombo(RESERVED_COMBO)}</kbd><span class="legend-text">Background: reset highlighting</span></div>
        </div>
        <p class="shortcut-editor-hint legend-text">Click a shortcut, then perform the new gesture on it (Esc to cancel). Using a gesture taken by another action swaps them.</p>
        <button type="button" class="btn btn-outline theme-secondary" data-shortcut-reset-all ${this._allDefault() ? "disabled" : ""}>Reset all shortcuts</button>
      </div>`;

    this._bind();
  }

  _renderRow(action) {
    const combo = this.manager.getBinding(action.id);
    const isDefault = this.manager.isDefault(action.id);
    return `
      <div class="shortcut-editor-row" data-shortcut-action="${action.id}">
        <button type="button" class="legend-kbd shortcut-editor-combo${combo ? "" : " is-unassigned"}" data-role="record"
          title="Click, then perform the new gesture here">${escapeHtml(formatCombo(combo))}</button>
        <span class="legend-text shortcut-editor-label">${escapeHtml(action.label)}</span>
        <button type="button" class="shortcut-editor-icon" data-role="clear" title="Unassign" ${combo ? "" : "disabled"}>✕</button>
        <button type="button" class="shortcut-editor-icon" data-role="reset" title="Restore default (${escapeHtml(formatCombo(action.defaultCombo))})" ${isDefault ? "disabled" : ""}>↺</button>
      </div>`;
  }

  _allDefault() {
    return this.manager.getActions().every((action) => this.manager.isDefault(action.id));
  }

  _bind() {
    this.container.querySelectorAll("[data-shortcut-action]").forEach((row) => {
      const actionId = row.dataset.shortcutAction;
      const recordBtn = row.querySelector('[data-role="record"]');

      recordBtn.addEventListener("click", (event) => this._onRecordClick(event, actionId, recordBtn));
      recordBtn.addEventListener("contextmenu", (event) => {
        if (this._recording?.actionId !== actionId) return;
        event.preventDefault();
        this._commit(comboFromEvent(event));
      });
      recordBtn.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && this._recording) {
          event.preventDefault();
          this._stopRecording();
        }
      });
      recordBtn.addEventListener("blur", () => this._recording?.actionId === actionId && this._stopRecording());

      row.querySelector('[data-role="clear"]').addEventListener("click", () => this.manager.clearBinding(actionId));
      row.querySelector('[data-role="reset"]').addEventListener("click", () => this._report(actionId, this.manager.resetBinding(actionId)));
    });

    this.container.querySelector("[data-shortcut-reset-all]").addEventListener("click", () => this.manager.resetToDefaults());
  }

  _onRecordClick(event, actionId, button) {
    if (this._recording?.actionId !== actionId) {
      // Keyboard activation (Enter/Space) also lands here, with detail === 0.
      this._startRecording(actionId, button);
      return;
    }

    // Clicks are counted here rather than read from event.detail: the click that started
    // recording would otherwise make a quick follow-up single click look like a double-click.
    const recording = this._recording;
    const isSecondClick = recording.timer !== null;
    clearTimeout(recording.timer);
    if (isSecondClick) {
      this._commit(comboFromEvent({ ...modifiersOf(event), type: "click", detail: 2 }));
      return;
    }
    const combo = comboFromEvent({ ...modifiersOf(event), type: "click", detail: 1 });
    recording.timer = setTimeout(() => this._commit(combo), DOUBLE_CLICK_DELAY);
  }

  _startRecording(actionId, button) {
    this._stopRecording();
    this._recording = { actionId, button, timer: null, previousLabel: button.textContent };
    button.classList.add("is-recording");
    button.textContent = "Perform gesture…";
    button.focus();
  }

  _stopRecording() {
    if (!this._recording) return;
    const { button, timer, previousLabel } = this._recording;
    clearTimeout(timer);
    button.classList.remove("is-recording");
    button.textContent = previousLabel;
    this._recording = null;
  }

  _commit(combo) {
    if (!this._recording) return;
    const { actionId } = this._recording;
    this._stopRecording();
    this._report(actionId, this.manager.setBinding(actionId, combo));
  }

  _report(actionId, result) {
    if (!result.ok) {
      this.notify(result.error);
      return;
    }
    if (result.swappedWith) {
      const other = this.manager.getAction(result.swappedWith);
      this.notify(`"${other.label}" is now ${formatCombo(this.manager.getBinding(other.id))}`);
    }
  }
}


function injectStyles() {
  if (typeof document === "undefined" || document.getElementById("shortcut-editor-styles")) return;
  const style = document.createElement("style");
  style.id = "shortcut-editor-styles";
  style.textContent = `
    .shortcut-editor { display: flex; flex-direction: column; gap: 10px; }
    .shortcut-editor-group { display: flex; flex-direction: column; gap: 4px; }
    .shortcut-editor-scope { font-size: 11px; text-transform: uppercase; opacity: 0.7; }
    .shortcut-editor-row { display: flex; align-items: center; gap: 8px; }
    .shortcut-editor-label { flex: 1; }
    .shortcut-editor-combo { min-width: 9em; text-align: center; cursor: pointer; border: 1px solid var(--secondary-border, #555); border-radius: var(--radius-3, 4px); background: transparent; color: inherit; }
    .shortcut-editor-combo:hover { border-color: currentColor; background: var(--secondary-bg-muted, transparent); }
    .shortcut-editor-combo.is-unassigned { opacity: 0.5; font-style: italic; }
    .shortcut-editor-combo.is-recording { border-color: #ffd93d; color: #ffd93d; }
    .shortcut-editor-icon { background: none; border: none; color: inherit; cursor: pointer; padding: 0 4px; opacity: 0.7; }
    .shortcut-editor-icon:hover:not(:disabled) { opacity: 1; }
    .shortcut-editor-icon:disabled { opacity: 0.2; cursor: default; }
    .shortcut-editor-hint { margin: 0; font-size: 11px; opacity: 0.7; }
    .shortcut-editor > button { align-self: flex-start; }
  `;
  document.head.appendChild(style);
}
