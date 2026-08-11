// ============================================================================
// CHOICES INITIALIZER - Sets up and manages Choices.js selectors
// ============================================================================

import { CONFIG } from "../config/config.js";
import { UIHelper } from "./UIHelper.js";
import { LegendManager } from "./LegendManager.js";

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
          return strToEl(
            `<div class="${classNames.item} ${classNames.itemChoice} ${classNames.itemSelectable}">Invalid Data</div>`,
          );
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

      const { reagentChoices, productChoices } = this.createChoicesPair(
        Choices,
        reagentSelectorElement,
        productSelectorElement,
        this.state.selectedReagents,
        this.state.selectedProduct,
      );

      // Store choices instances
      this.state.update({
        reagentChoices,
        productChoices,
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

  // Reusable factory that instantiates a bound reagent+product pair of Choices.js selectors on
  // arbitrary <select> elements. Used both for the legacy top-of-page selectors (single
  // selection mode, see initialize() above) and for each row of the ReactionSetPanel (multi-set
  // mode), so both share the same look, templates, and narrowing behavior.
  createChoicesPair(Choices, reagentEl, productEl, initialReagents = [], initialProduct = "", options = {}) {
    const {
      maxReagentSelection = CONFIG.ui.maxReagentSelection,
      maxProductSelection = CONFIG.ui.maxProductSelection,
      availableReagents = this.reactionFilter.getAvailableReagents(initialReagents, initialProduct),
      availableProducts = this.reactionFilter.getAvailableProducts(initialReagents),
    } = options;

    const reagentChoices = new Choices(reagentEl, {
      silent: false,
      maxItemCount: maxReagentSelection,
      allowHTML: true,
      placeholder: true,
      placeholderValue: "Search Reagents",
      removeItemButton: true,
      choices: availableReagents,
      searchEnabled: true,
      renderSelectedChoices: "auto",
      callbackOnCreateTemplates: this.createChoicesTemplates.bind(this),
      noChoicesText: "There are no reactions with one more ingredient",
    });

    const productChoices = new Choices(productEl, {
      silent: false,
      maxItemCount: maxProductSelection,
      allowHTML: true,
      placeholder: true,
      placeholderValue: "Search Products",
      removeItemButton: true,
      choices: availableProducts,
      searchEnabled: true,
      renderSelectedChoices: "always",
      maxItemText: () => "You can only search for one product at a time",
      callbackOnCreateTemplates: this.createChoicesTemplates.bind(this),
    });

    initialReagents.forEach((id) => reagentChoices.setChoiceByValue(id));
    if (initialProduct) productChoices.setChoiceByValue(initialProduct);

    return { reagentChoices, productChoices };
  }

  // Refreshes the option list of an existing Choices.js instance in place (used whenever the
  // set of available reagents/products narrows because of another selection change), while
  // preserving currently selected values that are still valid.
  static refreshChoices(choicesInstance, availableChoices, selectedValues = []) {
    if (!choicesInstance?.initialised) return;
    choicesInstance.clearStore();
    choicesInstance.setChoices(availableChoices, "value", "label", true);
    selectedValues.forEach((value) => {
      if (availableChoices.some((c) => c.value === value)) {
        choicesInstance.setChoiceByValue(value);
      }
    });
  }

  setupEventHandlers(reagentSelectorElement, productSelectorElement) {
    // Reagent change handler
    reagentSelectorElement.addEventListener("change", () => {
      if (this.state.reagentChoices?.initialised && !this.state.isResetting) {
        this.state.visibleTagMaterials.clear();
        this.state.update({
          selectedReagents: this.state.reagentChoices.getValue(true),
        });
      }
    });

    // Product change handler
    productSelectorElement.addEventListener("change", () => {
      if (this.state.productChoices?.initialised && !this.state.isResetting) {
        const selectedValues = this.state.productChoices.getValue(true);
        this.state.visibleTagMaterials.clear();
        this.state.update({
          selectedProduct: Array.isArray(selectedValues) && selectedValues.length > 0 ? selectedValues[0] : "",
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
