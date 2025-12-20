// ============================================================================
// CHOICES INITIALIZER - Sets up and manages Choices.js selectors
// ============================================================================

import { CONFIG } from '../config/config.js';
import { UIHelper } from './UIHelper.js';
import { LegendManager } from './LegendManager.js';

export class ChoicesInitializer {
    constructor(state, uiController, reactionFilter, eventBus, dataRepo) {
        this.state = state;
        this.uiController = uiController;
        this.reactionFilter = reactionFilter;
        this.eventBus = eventBus;
        this.dataRepo = dataRepo;
    }

    async waitForElement(id, timeout = 5000) {
        return new Promise((resolve, reject) => {
            const element = document.getElementById(id);
            if (element) {
                resolve(element);
                return;
            }

            const observer = new MutationObserver((mutations, obs) => {
                const element = document.getElementById(id);
                if (element) {
                    obs.disconnect();
                    resolve(element);
                }
            });

            observer.observe(document.body, { childList: true, subtree: true });
            setTimeout(() => {
                observer.disconnect();
                reject(new Error(`Element ${id} not found within ${timeout}ms`));
            }, timeout);
        });
    }

    createChoicesTemplates(strToEl) {
        return {
            choice: ({ classNames }, data) => {
                if (!data) {
                    return strToEl(`<div class="${classNames.item} ${classNames.itemChoice} ${classNames.itemSelectable}">Invalid Data</div>`);
                }

                const imageUrl = UIHelper.getMaterialImageUrl(data.value || "", this.dataRepo);
                const nameForDisplay = data.name || (data.label ? data.label.split(" (")[0] : data.value || "Unknown");
                const typeForDisplay = (data.type || "").toLowerCase();
                const safeValue = data.value || "";
                const safeId = data.id || "";

                return strToEl(`<div class="${classNames.item} ${classNames.itemChoice} ${classNames.itemSelectable}" data-choice data-choice-selectable data-id="${safeId}" data-value="${safeValue}" role="option">
          <img src="${imageUrl}" style="height:24px;display:inline-block;vertical-align:middle;margin-right:8px;" alt="${nameForDisplay}" />
          <span class="material-name-text">${nameForDisplay}</span>
          (<span class="material-type-${typeForDisplay}">${safeValue}</span>)
        </div>`);
            },

            item: ({ classNames }, data) => {
                if (!data) return strToEl(`<div class="${classNames.item}">Invalid Data</div>`);

                const imageUrl = UIHelper.getMaterialImageUrl(data.value || "", this.dataRepo);
                const nameForDisplay = data.name || (data.label ? data.label.split(" (")[0] : data.value || "Unknown");
                const typeForDisplay = (data.type || "").toLowerCase();
                const safeValue = data.value || "";
                const safeId = data.id || "";

                return strToEl(`<div class="${classNames.item}" data-item data-id="${safeId}" data-value="${safeValue}" aria-selected="true" role="option" data-deletable>
          <img src="${imageUrl}" style="height:24px;display:inline-block;vertical-align:middle;margin:8px;" alt="${nameForDisplay}" />
          <span class="material-name-text">${nameForDisplay}</span>
          (<span class="material-type-${typeForDisplay}"><code>${safeValue}</code></span>)
          <button type="button" class="${classNames.button}" aria-label="Remove item: ${nameForDisplay}" data-button>Remove item</button>
        </div>`);
            },
        };
    }

    async initialize(Choices) {
        try {
            const [reagentSelectorElement, productSelectorElement] = await Promise.all([
                this.waitForElement("choicesSelector"),
                this.waitForElement("productChoicesSelector"),
            ]);

            if (reagentSelectorElement.classList.contains("choices__input")) return;

            // Initialize reagent choices
            const reagentChoices = new Choices(reagentSelectorElement, {
                silent: false,
                maxItemCount: CONFIG.ui.maxReagentSelection,
                allowHTML: true,
                placeholder: true,
                placeholderValue: "Search Reagents",
                removeItemButton: true,
                choices: this.reactionFilter.getAvailableReagents(this.state.selectedReagents, this.state.selectedProduct),
                searchEnabled: true,
                renderSelectedChoices: "auto",
                callbackOnCreateTemplates: this.createChoicesTemplates.bind(this),
                noChoicesText: "There are no reactions with one more ingredient",
            });

            // Initialize product choices
            const productChoices = new Choices(productSelectorElement, {
                silent: false,
                maxItemCount: CONFIG.ui.maxProductSelection,
                allowHTML: true,
                placeholder: true,
                placeholderValue: "Search Products",
                removeItemButton: true,
                choices: this.reactionFilter.getAvailableProducts(this.state.selectedReagents),
                searchEnabled: true,
                renderSelectedChoices: "always",
                maxItemText: () => "You can only search for one product at a time",
                callbackOnCreateTemplates: this.createChoicesTemplates.bind(this),
            });

            // Store choices instances
            this.state.update({
                reagentChoices,
                productChoices
            });

            // Setup event handlers
            this.setupEventHandlers(reagentSelectorElement, productSelectorElement);

            // Initial UI update
            this.uiController.updateUI();

            // Create legend
            LegendManager.create();

        } catch (error) {
            console.error("Failed to initialize app:", error);
        }
    }

    setupEventHandlers(reagentSelectorElement, productSelectorElement) {
        // Reagent change handler
        reagentSelectorElement.addEventListener("change", () => {
            if (this.state.reagentChoices?.initialised && !this.state.isResetting) {
                this.state.visibleTagMaterials.clear();
                this.state.update({
                    selectedReagents: this.state.reagentChoices.getValue(true)
                });
            }
        });

        // Product change handler
        productSelectorElement.addEventListener("change", () => {
            if (this.state.productChoices?.initialised && !this.state.isResetting) {
                const selectedValues = this.state.productChoices.getValue(true);
                this.state.visibleTagMaterials.clear();
                this.state.update({
                    selectedProduct: Array.isArray(selectedValues) && selectedValues.length > 0 ? selectedValues[0] : ""
                });
            }
        });

        // State change handler
        this.eventBus.on("stateChanged", () => {
            this.uiController.updateChoicesOptions();
            this.uiController.updateUI();
        });
    }
}