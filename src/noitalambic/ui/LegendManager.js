// ============================================================================
// LEGEND MANAGER - Creates and manages the graph legend
// ============================================================================

import { CONFIG } from "../config/config.js";

export class LegendManager {
  static #styleInjected = false;
  static #tooltipListeners = new Map();

  static create() {
    try {
      if (!CONFIG?.graph?.colors) {
        console.error("LegendManager: CONFIG not properly initialized");
        return;
      }

      this._injectStyles();
      const existingLegend = document.getElementById("graph-legend");
      if (existingLegend) {
        this._cleanupListeners(existingLegend);
        existingLegend.remove();
      }

      const legendContainer = document.createElement("div");
      legendContainer.id = "graph-legend";
      legendContainer.className = "card";
      legendContainer.setAttribute("role", "region");
      legendContainer.setAttribute("aria-label", "Graph Legend");
      legendContainer.style.cssText =
        "margin-top:10px;padding:15px;background-color:rgba(0,0,0,0.7);border-radius:8px;color:#fff;font-size:14px;max-width:100%;";

      legendContainer.innerHTML = `
        <div class="legend-header">
          <h3 class="legend-title">Graph Legend</h3>
          <div id="legend-toggle" class="legend-toggle" role="button" tabindex="0" aria-expanded="true">−</div>
        </div>
        <div id="legend-content" class="legend-content">
          <div class="legend-grid">
            ${this._getNodesSection()}
            ${this._getConnectionsSection()}
            ${this._getInteractionsSection()}
          </div>
        </div>
      `;

      const tableContainer = document.getElementById("graphContainer");
      if (tableContainer?.parentNode) {
        tableContainer.parentNode.appendChild(legendContainer);
        this._setupToggle(legendContainer);
        this._setupTooltips(legendContainer);
      }
    } catch (error) {
      console.error("LegendManager: Error creating legend", error);
    }
  }

  static _injectStyles() {
    if (this.#styleInjected) return;

    const style = document.createElement("style");
    style.id = "legend-styles";
    style.textContent = `
      .legend-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 15px;
        border-bottom: 1px solid #555;
        padding-bottom: 10px;
      }

      .legend-title {
        margin: 0;
        font-size: 16px;
        color: #fff;
      }

      .legend-toggle {
        cursor: pointer;
        font-size: 18px;
        padding: 0 8px;
        background: #555;
        border-radius: 4px;
        user-select: none;
        transition: background-color 0.2s;
      }

      .legend-toggle:hover {
        background-color: #666;
      }

      .legend-toggle:focus {
        outline: 2px solid #45b7d1;
        outline-offset: 2px;
      }

      .legend-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
        gap: 15px;
        min-width: 0;
      }

      .legend-section {
        min-width: 0;
      }

      .legend-section-title {
        margin: 0 0 10px 0;
        color: #45b7d1;
        font-size: 14px;
        font-weight: 600;
      }

      .legend-item {
        display: flex;
        align-items: center;
        margin-bottom: 8px;
        min-width: 0;
        gap: 10px;
      }

      .legend-icon {
        flex-shrink: 0;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .legend-text {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        min-width: 0;
        font-size: 13px;
        color: #ddd;
      }

      .legend-kbd {
        background: #555;
        border: 1px solid #777;
        border-radius: 4px;
        padding: 4px 8px;
        font-family: monospace;
        font-size: 11px;
        font-weight: bold;
        white-space: nowrap;
        box-shadow: 0 2px 0 #333;
        flex-shrink: 0;
      }

      .legend-interactions {
        padding: 8px 0;
        min-width: 0;
      }

      .legend-interaction-item {
        display: flex;
        gap: 12px;
        align-items: center;
        margin-bottom: 8px;
        min-width: 0;
      }
    `;
    document.head.appendChild(style);
    this.#styleInjected = true;
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
                <image x="8" y="8" width="8" height="8" xlink:href="${CONFIG.urls.imageBase}/images/icons/eye-open.svg"></image>`,
        label: "Tag (group of materials)",
      },
    ];

    const items = nodes
      .map(
        (node) => `
      <div class="legend-item">
        <svg class="legend-icon">${node.icon}</svg>
        <span class="legend-text">${node.label}</span>
      </div>
    `,
      )
      .join("");

    return `
      <div class="legend-section">
        <h4 class="legend-section-title">NODES</h4>
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
      <div class="legend-item">
        <svg class="legend-icon">${conn.icon}</svg>
        <span class="legend-text">${conn.label}</span>
      </div>
    `,
      )
      .join("");

    return `
      <div class="legend-section">
        <h4 class="legend-section-title">CONNECTIONS</h4>
        ${items}
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
      <div class="legend-interaction-item">
        <kbd class="legend-kbd legend-text">${item.keys}</kbd>
        <span class="legend-text">${item.description}</span>
      </div>
    `,
      )
      .join("");

    return `
      <div class="legend-section legend-interactions">
        <h4 class="legend-section-title">INTERACTIONS</h4>
        ${rows}
      </div>
    `;
  }

  static _setupToggle(container) {
    const legendToggle = container.querySelector("#legend-toggle");
    const legendContent = container.querySelector("#legend-content");

    if (!legendToggle || !legendContent) return;

    let isVisible = true;

    const handleToggle = () => {
      isVisible = !isVisible;
      legendContent.style.display = isVisible ? "block" : "none";
      legendToggle.textContent = isVisible ? "−" : "+";
      legendToggle.setAttribute("aria-expanded", isVisible);
      container.style.padding = isVisible ? "15px" : "10px 15px";
    };

    legendToggle.addEventListener("click", handleToggle);
    legendToggle.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleToggle();
      }
    });

    // Stocker les listeners pour nettoyage ultérieur
    if (!this.#tooltipListeners.has(container)) {
      this.#tooltipListeners.set(container, []);
    }
    const listeners = this.#tooltipListeners.get(container);
    listeners.push({ element: legendToggle, event: "click", handler: handleToggle });
  }

  static _setupTooltips(container) {
    const textElements = container.querySelectorAll(".legend-text");
    const listeners = this.#tooltipListeners.get(container) || [];

    textElements.forEach((el) => {
      const handleMouseEnter = () => {
        if (el.scrollWidth > el.clientWidth) {
          el.title = el.textContent.trim();
        }
      };

      const handleMouseLeave = () => {
        el.title = "";
      };

      el.addEventListener("mouseenter", handleMouseEnter);
      el.addEventListener("mouseleave", handleMouseLeave);

      listeners.push(
        { element: el, event: "mouseenter", handler: handleMouseEnter },
        { element: el, event: "mouseleave", handler: handleMouseLeave },
      );
    });

    this.#tooltipListeners.set(container, listeners);
  }

  static _cleanupListeners(container) {
    const listeners = this.#tooltipListeners.get(container);
    if (listeners) {
      listeners.forEach(({ element, event, handler }) => {
        element.removeEventListener(event, handler);
      });
      this.#tooltipListeners.delete(container);
    }
  }
}
