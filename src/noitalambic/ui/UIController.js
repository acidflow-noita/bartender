// ============================================================================
// UI CONTROLLER - Manages UI controls and interactions
// ============================================================================

import { CONFIG } from '../config/config.js';
import { UIHelper } from './UIHelper.js';

export class UIController {
    constructor(state, reactionFilter, graphRenderer, dataRepo) {
        this.state = state;
        this.reactionFilter = reactionFilter;
        this.graphRenderer = graphRenderer;
        this.dataRepo = dataRepo;
    }

    createShareButton(Inputs, htl) {
        return Inputs.button(
            htl.html`<img src="${CONFIG.urls.imageBase}/images/icons/copy.svg" />Share`,
            {
                value: null,
                reduce: () => {
                    const url = new URL(window.location.href);
                    url.search = "";

                    if (this.state.selectedReagents.length > 0) {
                        url.searchParams.set("reagents", this.state.selectedReagents.join(","));
                    }
                    if (this.state.selectedProduct) {
                        url.searchParams.set("product", this.state.selectedProduct);
                    }
                    if (this.state.minReactionSpeed > 0) {
                        url.searchParams.set("minSpeed", this.state.minReactionSpeed.toString());
                    }

                    const shareUrl = url.toString();
                    navigator.clipboard
                        .writeText(shareUrl)
                        .then(() => UIHelper.showNotification("URL copied to clipboard"))
                        .catch(() => {
                            const textArea = document.createElement("textarea");
                            textArea.value = shareUrl;
                            document.body.appendChild(textArea);
                            textArea.select();
                            document.execCommand("copy");
                            document.body.removeChild(textArea);
                            UIHelper.showNotification("URL copied to clipboard");
                        });

                    return shareUrl;
                },
            }
        );
    }

    createResetButton(Inputs, htl) {
        return Inputs.button(
            htl.html`<img src="${CONFIG.urls.imageBase}/images/icons/arrow-counterclockwise.svg" />Reset`,
            {
                reduce: () => {
                    this.state.reset();

                    // Reset speed slider
                    const speedSlider = document.getElementById("speedSlider");
                    if (speedSlider) speedSlider.value = 0;
                    const speedValue = document.getElementById("speedValue");
                    if (speedValue) speedValue.textContent = "0";

                    this.updateChoicesOptions();
                    this.updateUI();
                    return null;
                },
            }
        );
    }

    createExportButton(Inputs, htl) {
        return Inputs.button(
            htl.html`<img src="${CONFIG.urls.imageBase}/images/icons/download.svg" />Export SVG`,
            {
                reduce: () => {
                    this.exportGraphAsSVG();
                    return null;
                },
            }
        );
    }

    exportGraphAsSVG() {
        const svgElement = document.querySelector("#tableContainer svg");

        if (!svgElement) {
            UIHelper.showNotification("No graph to export");
            return;
        }

        // Clone the SVG to avoid modifying the original
        const clonedSvg = svgElement.cloneNode(true);

        // Remove interactive elements that might interfere with display
        const removeElements = clonedSvg.querySelectorAll('.tag-visibility-icon, image[href*="icons/"]');
        removeElements.forEach(el => el.remove());

        // Ensure proper styling for export
        const style = document.createElement('style');
        style.textContent = `
      .node-label { font-family: Arial, sans-serif; }
      .material-image { image-rendering: optimizeQuality; }
    `;
        clonedSvg.insertBefore(style, clonedSvg.firstChild);

        // Serialize SVG
        const serializer = new XMLSerializer();
        let svgString = serializer.serializeToString(clonedSvg);

        // Add XML declaration and proper namespaces
        if (!svgString.includes('<?xml')) {
            svgString = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' + svgString;
        }

        // Create download link
        const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;

        // Generate filename with current selections
        let filename = 'reactions_graph';
        if (this.state.selectedReagents.length > 0) {
            filename += `_reagents_${this.state.selectedReagents.join('_')}`;
        }
        if (this.state.selectedProduct) {
            filename += `_product_${this.state.selectedProduct}`;
        }
        filename += '.svg';

        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        UIHelper.showNotification("Graph exported as SVG");
    }

    createSpeedSlider() {
        const container = document.createElement("div");
        container.style.cssText = "display:flex;flex-direction:column;gap:8px;";

        const labelRow = document.createElement("div");
        labelRow.style.cssText = "display:flex;justify-content:space-between;align-items:center;";

        const label = document.createElement("label");
        label.textContent = "Min Reaction Speed:";
        label.style.cssText = "font-weight:bold;font-size:0.9rem;";

        const valueDisplay = document.createElement("span");
        valueDisplay.id = "speedValue";
        valueDisplay.textContent = this.state.minReactionSpeed.toString();
        valueDisplay.style.cssText = "font-weight:bold;color:#45b7d1;font-size:0.9rem;min-width:30px;text-align:right;";

        labelRow.appendChild(label);
        labelRow.appendChild(valueDisplay);

        const slider = document.createElement("input");
        slider.type = "range";
        slider.id = "speedSlider";
        slider.min = "0";
        slider.max = "100";
        slider.value = this.state.minReactionSpeed.toString();
        slider.step = "5";
        slider.style.cssText = "width:100%;cursor:pointer;";

        slider.addEventListener("input", (e) => {
            const value = parseInt(e.target.value);
            valueDisplay.textContent = value.toString();
            this.state.setMinReactionSpeed(value);
        });

        container.appendChild(labelRow);
        container.appendChild(slider);

        return container;
    }

    createSourceSelector() {
        const container = document.createElement("div");
        container.style.cssText = "display:flex;flex-direction:column;gap:8px;";

        const label = document.createElement("label");
        label.textContent = "Reaction Source:";
        label.style.cssText = "font-weight:bold;font-size:0.9rem;";

        const select = document.createElement("select");
        select.id = "sourceSelector";
        select.style.cssText = "width:100%;padding:8px;border-radius:4px;border:1px solid #555;background:#2a2a2a;color:#fff;cursor:pointer;font-size:0.9rem;";

        const sources = this.dataRepo.getAvailableSources();
        sources.forEach(source => {
            const option = document.createElement("option");
            option.value = source.id;
            option.textContent = `${source.name} (${source.count} reactions)`;
            option.selected = source.id === this.state.reactionSource;
            select.appendChild(option);
        });

        select.addEventListener("change", (e) => {
            const sourceId = e.target.value;
            UIHelper.showNotification(`Loading ${sources.find(s => s.id === sourceId)?.name}...`);
            this.state.setReactionSource(sourceId);
        });

        container.appendChild(label);
        container.appendChild(select);

        return container;
    }

    updateChoicesOptions() {
        const availableReagents = this.reactionFilter.getAvailableReagents(
            this.state.selectedReagents,
            this.state.selectedProduct
        );
        const availableProducts = this.reactionFilter.getAvailableProducts(
            this.state.selectedReagents
        );

        if (this.state.reagentChoices?.initialised) {
            this.state.reagentChoices.clearStore();
            this.state.reagentChoices.setChoices(availableReagents, "value", "label", true);
            this.state.selectedReagents.forEach(value => {
                if (availableReagents.some(r => r.value === value)) {
                    this.state.reagentChoices.setChoiceByValue(value);
                }
            });
        }

        if (this.state.productChoices?.initialised) {
            this.state.productChoices.clearStore();
            this.state.productChoices.setChoices(availableProducts, "value", "label", true);
            if (this.state.selectedProduct && availableProducts.some(p => p.value === this.state.selectedProduct)) {
                this.state.productChoices.setChoiceByValue(this.state.selectedProduct);
            }
        }
    }

    updateUI() {
        const filteredReactions = this.reactionFilter.getFilteredReactions(
            this.state.selectedReagents,
            this.state.selectedProduct,
            this.state.minReactionSpeed
        );

        const reactionsCountContainer = document.getElementById("reactionsCount");
        if (reactionsCountContainer) {
            reactionsCountContainer.innerHTML = `Reactions found: <code class="bigger-number-better">${filteredReactions.length}</code>`;
        }

        this.graphRenderer.render(filteredReactions);
        this.state.updateURL();
    }
}