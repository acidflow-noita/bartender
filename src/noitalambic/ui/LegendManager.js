// ============================================================================
// LEGEND MANAGER - Creates and manages the graph legend
// ============================================================================

import { CONFIG } from "../config/config.js";

export class LegendManager {
  static create() {
    const existingLegend = document.getElementById("graph-legend");
    if (existingLegend) existingLegend.remove();

    const legendContainer = document.createElement("div");
    legendContainer.id = "graph-legend";
    legendContainer.className = "card";
    legendContainer.style.cssText =
      "margin-top:10px;padding:15px;background-color:rgba(0,0,0,0.7);border-radius:8px;color:#fff;font-size:14px;max-width:100%;";

    legendContainer.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;border-bottom:1px solid #555;padding-bottom:10px;">
        <h3 style="margin:0;font-size:16px;">Graph Legend</h3>
        <div id="legend-toggle" style="cursor:pointer;font-size:18px;padding:0 8px;background:#555;border-radius:4px;">−</div>
      </div>
      <div id="legend-content">
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:15px;min-width:0;">
          ${this._getNodesSection()}
          ${this._getConnectionsSection()}
          ${this._getInteractionsSection()}
        </div>
      </div>
    `;

    const tableContainer = document.getElementById("graphContainer");
    if (tableContainer?.parentNode) {
      tableContainer.parentNode.appendChild(legendContainer);
      this._setupToggle();
    }
  }

  static _getNodesSection() {
    return `
      <div style="min-width:0;">
        <h4 style="margin:0 0 10px 0;color:#45b7d1;">NODES</h4>
        <div style="display:flex;align-items:center;margin-bottom:8px;min-width:0;">
          <svg width="24" height="24" style="flex-shrink:0;">
            <circle cx="12" cy="12" r="10" fill="${CONFIG.graph.colors.materialNodeOutput}" stroke="${CONFIG.graph.colors.nodeStroke}" stroke-width="2"></circle>
          </svg>
          <span style="margin-left:10px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="Material">Material</span>
        </div>
        <div style="display:flex;align-items:center;margin-bottom:8px;min-width:0;">
          <svg width="24" height="24" style="flex-shrink:0;">
            <circle cx="12" cy="12" r="8" fill="${CONFIG.graph.colors.reactionNode}" stroke="${CONFIG.graph.colors.nodeStroke}" stroke-width="2"></circle>
            <text x="12" y="16" text-anchor="middle" fill="#fff" font-size="10" font-weight="bold">5</text>
          </svg>
          <span style="margin-left:10px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="Reaction (number = speed)">Reaction (number = speed)</span>
        </div>
        <div style="display:flex;align-items:center;margin-bottom:8px;min-width:0;">
          <svg width="24" height="24" style="flex-shrink:0;">
            <circle cx="12" cy="12" r="8" fill="${CONFIG.graph.colors.tagNode}" stroke="${CONFIG.graph.colors.tagVisible}" stroke-width="2" stroke-dasharray="4,2"></circle>
            <image x="8" y="8" width="8" height="8" xlink:href="${CONFIG.urls.imageBase}/images/icons/eye-open.svg"></image>
          </svg>
          <span style="margin-left:10px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="Tag (group of materials)">Tag (group of materials)</span>
        </div>
      </div>
    `;
  }

  static _getConnectionsSection() {
    return `
      <div style="min-width:0;">
        <h4 style="margin:0 0 10px 0;color:#45b7d1;">CONNECTIONS</h4>
        <div style="display:flex;align-items:center;margin-bottom:8px;min-width:0;">
          <svg width="24" height="24" style="flex-shrink:0;">
            <line x1="2" y1="12" x2="22" y2="12" stroke="${CONFIG.graph.colors.inputArrow}" stroke-width="2" stroke-dasharray="5,5"></line>
          </svg>
          <span style="margin-left:10px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="Input/Reagent → reaction">Input/Reagent → reaction</span>
        </div>
        <div style="display:flex;align-items:center;margin-bottom:8px;min-width:0;">
          <svg width="24" height="24" style="flex-shrink:0;">
            <line x1="2" y1="12" x2="22" y2="12" stroke="${CONFIG.graph.colors.outputArrow}" stroke-width="2"></line>
          </svg>
          <span style="margin-left:10px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="reaction → Output/Product">reaction → Output/Product</span>
        </div>
        <div style="display:flex;align-items:center;margin-bottom:8px;min-width:0;">
          <svg width="24" height="24" style="flex-shrink:0;">
            <line x1="2" y1="12" x2="22" y2="12" stroke="${CONFIG.graph.colors.tagNode}" stroke-width="1.5" stroke-opacity="0.7"></line>
          </svg>
          <span style="margin-left:10px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="Tag association">Tag association</span>
        </div>
      </div>
    `;
  }

  static _getInteractionsSection() {
    const interactions = [
      { keys: "Dbl Click", description: "Tag: Show/hide all materials in tag" },
      { keys: "Ctrl+Click", description: "Material: Set as reagent" },
      { keys: "Shift+Click", description: "Material: Set as product" },
      { keys: "Ctrl+Shift+Click", description: "Material: Open wiki page" },
      { keys: "Click", description: "Background: Reset highlighting" },
    ];

    const rows = interactions
      .map(
        (item) => `
    <div style="display:flex;gap:12px;align-items:center;margin-bottom:8px;min-width:0;">        
      <kbd style="
        background:#555;
        border:1px solid #777;
        border-radius:4px;
        padding:4px 8px;
        font-family:monospace;
        font-size:11px;
        font-weight:bold;
        white-space:nowrap;
        box-shadow:0 2px 0 #333;
        flex-shrink:0;
      " title="${item.keys}">${item.keys}</kbd>
      <span style="
        font-size:13px;
        color:#ddd;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
        min-width:0;
      " title="${item.description}">${item.description}</span>
    </div>
    `,
      )
      .join("");

    return `
    <div style="padding:8px 0;min-width:0;">
      <h4 style="margin:0 0 10px 0;color:#45b7d1;">INTERACTIONS</h4>
      ${rows}
    </div>
  `;
  }

  static _setupToggle() {
    const legendToggle = document.getElementById("legend-toggle");
    const legendContent = document.getElementById("legend-content");
    const legendContainer = document.getElementById("graph-legend");

    if (!legendToggle || !legendContent || !legendContainer) return;

    let isVisible = true;
    legendToggle.addEventListener("click", () => {
      isVisible = !isVisible;
      legendContent.style.display = isVisible ? "block" : "none";
      legendToggle.textContent = isVisible ? "−" : "+";
      legendContainer.style.padding = isVisible ? "15px" : "10px 15px";
    });
  }
}
