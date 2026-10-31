import {iconLabel} from "../../ui/icons.js";
import {setControlDisabled} from '../../ui/disabled.js';
import {numberText} from '../../ui/format.js';
// ============================================================================
// UI CONTROLLER - Manages UI controls and interactions
// ============================================================================

import { CONFIG } from "../config/config.js";
import { UIHelper } from "./UIHelper.js";

export class UIController {
  constructor(state, reactionFilter, graphRenderer, dataRepo) {
    this.state = state;
    this.reactionFilter = reactionFilter;
    this.graphRenderer = graphRenderer;
    this.dataRepo = dataRepo;
  }

  createUnusedMaterialsToggle(Inputs) {
    const toggle = Inputs.toggle({label: "Exclude unused materials (base game)", value: this.state.excludeUnusedMaterials});
    toggle.title = "Hides materials classified as unused in normal gameplay.";
    toggle.addEventListener("input", () => this.state.setExcludeUnusedMaterials(toggle.value));
    this.unusedMaterialsToggle = toggle;
    this.updateUnusedMaterialsToggle();
    return toggle;
  }

  updateUnusedMaterialsToggle() {
    const toggle = this.unusedMaterialsToggle;
    if (!toggle) return;
    toggle.value = this.state.excludeUnusedMaterials;
    setControlDisabled(toggle.querySelector("input"), this.state.reactionSource !== "base",
      'Material availability has only been audited for the base game.');
  }

  createExportButton(Inputs, htl) {
    this.exportButton = Inputs.button(iconLabel("download", "Export SVG"), {
      reduce: () => {
        this.exportGraphAsSVG();
        return null;
      },
    });
    this.updateExportButton();
    return this.exportButton;
  }

  updateExportButton() {
    if (this.exportButton) setControlDisabled(this.exportButton.querySelector('button'), !document.querySelector('#graphContainer svg'),
      'Choose filters that produce a graph before exporting.');
  }

  exportGraphAsSVG() {
    const svgElement = document.querySelector("#graphContainer svg");

    if (!svgElement) {
      UIHelper.showNotification("No graph to export");
      return;
    }

    // Clone the SVG to avoid modifying the original
    const clonedSvg = svgElement.cloneNode(true);

    // Remove interactive elements that might interfere with display
    const removeElements = clonedSvg.querySelectorAll('.tag-visibility-icon');
    removeElements.forEach((el) => el.remove());

    // Ensure proper styling for export
    const style = document.createElement("style");
    style.textContent = `
      .node-label { font-family: Arial, sans-serif; }
      .material-image { image-rendering: optimizeQuality; }
    `;
    clonedSvg.insertBefore(style, clonedSvg.firstChild);

    // Serialize SVG
    const serializer = new XMLSerializer();
    let svgString = serializer.serializeToString(clonedSvg);

    // Add XML declaration and proper namespaces
    if (!svgString.includes("<?xml")) {
      svgString = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' + svgString;
    }

    // Create download link
    const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;

    // Generate filename with current selections
    let filename = "reactions_graph";
    if (this.state.selectedReagents.length > 0) {
      filename += `_reagents_${this.state.selectedReagents.join("_")}`;
    }
    if (this.state.selectedProduct) {
      filename += `_product_${this.state.selectedProduct}`;
    }
    filename += ".svg";

    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    UIHelper.showNotification("Graph exported as SVG");
  }

  updateChoicesOptions() {
    const availableReagents = this.reactionFilter.getAvailableReagents(
      this.state.selectedReagents,
      this.state.selectedProduct,
    );
    const availableProducts = this.reactionFilter.getAvailableProducts(this.state.selectedReagents);

    if (this.state.reagentChoices?.initialised) {
      this.state.reagentChoices.clearStore();
      this.state.reagentChoices.setChoices(availableReagents, "value", "label", true);
      this.state.selectedReagents.forEach((value) => {
        if (availableReagents.some((r) => r.value === value)) {
          this.state.reagentChoices.setChoiceByValue(value);
        }
      });
    }

    if (this.state.productChoices?.initialised) {
      this.state.productChoices.clearStore();
      this.state.productChoices.setChoices(availableProducts, "value", "label", true);
      if (this.state.selectedProduct && availableProducts.some((p) => p.value === this.state.selectedProduct)) {
        this.state.productChoices.setChoiceByValue(this.state.selectedProduct);
      }
    }
  }

  updateUI() {
    this.updateUnusedMaterialsToggle();
    const filteredReactions = this.reactionFilter.getFilteredReactions(
      this.state.selectedReagents,
      this.state.selectedProduct,
      this.state.minReactionSpeed,
    );

    const reactionsCountContainer = document.getElementById("reactionsCount");
    if (reactionsCountContainer) {
      const count = document.createElement('code');
      count.className = 'bigger-number-better';
      count.append(numberText(filteredReactions.length));
      reactionsCountContainer.replaceChildren('Reactions found: ', count);
    }

    this.graphRenderer.render(filteredReactions);
    this.updateExportButton();
    this.state.updateURL();
  }
}
