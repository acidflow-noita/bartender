import {CONFIG} from "../config/config.js";
import {iconPaths} from '../../generated/bootstrap-icons.js';
import {getSharedShortcutManager} from "../core/ShortcutManager.js";
import {ShortcutEditor} from "./ShortcutEditor.js";

export class LegendManager {
  static _editor = null;

  static create(shortcutManager = getSharedShortcutManager()) {
    this._editor?.unmount();
    document.getElementById('graph-legend')?.remove();
    const legend = document.createElement('div');
    legend.id = 'graph-legend'; legend.className = 'accordion mt-4';
    legend.innerHTML = `<details class="accordion-item"><summary class="accordion-header">Graph legend and controls</summary><div class="accordion-body"><div class="row g-4">${this._getNodesSection()}${this._getConnectionsSection()}${this._getInteractionsSection()}</div></div></details>`;
    document.getElementById('graphContainer')?.parentElement.append(legend);
    this._editor = new ShortcutEditor(shortcutManager).mount(legend.querySelector('[data-role="shortcut-editor"]'));
  }
  static _getNodesSection() {
    const nodes = [
      {
        icon: `<circle cx="12" cy="12" r="10" fill="${CONFIG.graph.colors.materialNodeOutput}" stroke="${CONFIG.graph.colors.nodeStroke}" stroke-width="2"></circle>`,
        label: "Material",
      },
      {
        icon: `<circle cx="12" cy="12" r="8" fill="${CONFIG.graph.colors.reactionNode}" stroke="${CONFIG.graph.colors.nodeStroke}" stroke-width="2"></circle>
                <text x="12" y="16" text-anchor="middle" fill="#fff" font-size="10" font-weight="bold">5</text>`,
        label: "Reaction (number = speed)",
      },
      {
        icon: `<circle cx="12" cy="12" r="8" fill="${CONFIG.graph.colors.tagNode}" stroke="${CONFIG.graph.colors.tagVisible}" stroke-width="2" stroke-dasharray="4,2"></circle>
                <svg x="6" y="6" width="12" height="12" viewBox="0 0 16 16" fill="var(--bg-body)">${iconPaths.eye}</svg>`,
        label: "Tag (group of materials)",
      },
      {
        icon: `<circle cx="12" cy="12" r="6" fill="${CONFIG.graph.colors.reactionNode}" stroke="${CONFIG.graph.colors.nodeStroke}" stroke-width="1"></circle>
                <circle cx="12" cy="12" r="10" fill="none" stroke="#c77dff" stroke-width="3"></circle>`,
        label: "Colored ring = originating reaction set(s)",
      },
    ];

    const items = nodes
      .map(
        (node) => `
      <div class="d-flex align-items-center gap-2 mb-2">
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">${node.icon}</svg>
        <span class="legend-text">${node.label}</span>
      </div>
    `,
      )
      .join("");

    return `
      <div class="col-12 lg:col-4">
        <h4 class="fs-6">NODES</h4>
        ${items}
      </div>
    `;
  }

  static _getConnectionsSection() {
    const connections = [
      {
        icon: `<line x1="2" y1="12" x2="22" y2="12" stroke="${CONFIG.graph.colors.inputArrow}" stroke-width="2" stroke-dasharray="5,5"></line>`,
        label: "Input/Reagent → reaction",
      },
      {
        icon: `<line x1="2" y1="12" x2="22" y2="12" stroke="${CONFIG.graph.colors.outputArrow}" stroke-width="2"></line>`,
        label: "reaction → Output/Product",
      },
      {
        icon: `<line x1="2" y1="12" x2="22" y2="12" stroke="${CONFIG.graph.colors.tagNode}" stroke-width="1.5" stroke-opacity="0.7"></line>`,
        label: "Tag association",
      },
    ];

    const items = connections
      .map(
        (conn) => `
      <div class="d-flex align-items-center gap-2 mb-2">
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">${conn.icon}</svg>
        <span class="legend-text">${conn.label}</span>
      </div>
    `,
      )
      .join("");

    return `
      <div class="col-12 lg:col-4">
        <h4 class="fs-6">CONNECTIONS</h4>
        ${items}
      </div>
    `;
  }

  // Filled by ShortcutEditor: lists the current shortcuts and lets the user rebind them.
  static _getInteractionsSection() {
    return `
      <div class="col-12 lg:col-4">
        <h4 class="fs-6">INTERACTIONS</h4>
        <p class="small fg-3 mb-2">Left-drag the background to select nodes (Shift adds), then drag one to move them all. Right- or middle-drag to pan, wheel to zoom. Click the background or press Escape to clear the selection.</p>
        <div data-role="shortcut-editor"></div>
      </div>
    `;
  }
}
