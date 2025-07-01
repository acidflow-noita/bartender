---
title: "Reactions Finder"
draft: false
---

<script src="https://cdn.jsdelivr.net/npm/choices.js/public/assets/scripts/choices.min.js"></script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/choices.js/public/assets/styles/choices.min.css"/>
<link href="custom.css" rel="stylesheet"></link>

<h1 id="acidTitle" class="bartender-heading-decrypted">Reactions Finder</h1>
<h2>Ever wanted to make <a href="#" id="ambrosia-link" class="local-link"><code class="bigger-number-better"><span class="material-type-liquid">Ambrosia</span></code></a>? Is <a href="#" id="flum-link" class="local-link"><code class="bigger-number-better"><span class="material-type-liquid">Flummoxium</span></code></a> even useful? Mixing <a href="#" id="frog-whiskey-link" class="local-link"><code class="bigger-number-better"><span class="material-type-solid">frog meat</span> and <span class="material-type-liquid">whiskey</span></code></a> does something!? Noita has <code class="bigger-number-better">${reactions.length}</code> fixed material reactions, and two secret reactions for each seed. When you select the first igredient the list autoupdates, showing only materials that can react with the selected.</h2>

```js
import { initializeTitleAnimation } from "./components/titleAnimation.js";
initializeTitleAnimation();
```

```js
const getRowCount = (width) => {
  if (width > 1400) return 33;
  if (width > 1170) return 13;
  if (width > 768) return 13;
  return 10;
};
const isBigScreen = getRowCount(width);
const isMobile = width < 500;
const marginLeft = isMobile ? 50 : 60;
const marginRight = isMobile ? 20 : 30;
const marginBottom = isMobile ? 50 : 40;
const fontSize = isMobile ? 12 : 14;
```

```js
const materials = await FileAttachment("./data/FULL_MATERIALS_FINAL.json").json();
const reactions = await FileAttachment("./data/jsons/reactions.json").json();
```

```js
// Wait for DOM to be ready before accessing elements
const waitForElement = (id, timeout = 5000) => {
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

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Element ${id} not found within ${timeout}ms`));
    }, timeout);
  });
};
```

```js
if (Array.isArray(materials)) {
  const testAcidMaterial = materials.find((m) => m.id === "acid");
  console.log("DEBUG: 'acid' material object from materials.json:", JSON.parse(JSON.stringify(testAcidMaterial)));
  const testCactusMaterial = materials.find((m) => m.id === "cactus");
  console.log("DEBUG: 'cactus' material object from materials.json:", JSON.parse(JSON.stringify(testCactusMaterial)));
}

const getMaterialName = (id) => {
  if (!id) return "[No ID]";
  if (!Array.isArray(materials)) {
    console.error("[getMaterialName] Materials data is not an array.");
    return `[${id} - Materials N/A]`;
  }
  const material = materials.find((d) => d.id === id);
  if (!material) {
    console.warn(`[getMaterialName] Material with ID '${id}' not found in materials.json.`);
    return `[${id} - Not Found]`;
  }
  return `${material.name} (${material.id})`;
};

const getMaterialImageUrl = (id) => {
  if (!id) return "";
  if (!Array.isArray(materials)) {
    console.error("[getMaterialImageUrl] Materials data is not an array.");
    return "";
  }
  const material = materials.find((d) => d.id === id);
  if (!material) {
    return "";
  }
  const url = `https://noita-bartender-images.acidflow.stream/images/materials/Material_${id}.png`;
  return url;
};

const html = htl.html;

// Dynamic filtering
const getAvailableReagents = (selectedReagents, selectedProduct) => {
  if (!selectedProduct && selectedReagents.length === 0) {
    return Array.isArray(materials)
      ? materials.map((d) => ({
          value: d.id,
          label: `${d.name} (${d.id})`,
          name: d.name,
          type: d.type || "",
        }))
      : [];
  }

  const relevantReactions = reactions.filter((reaction) => {
    let productMatch = true;
    if (selectedProduct) {
      const outputs = [reaction.output_cell1, reaction.output_cell2, reaction.output_cell3].filter(Boolean);
      productMatch = outputs.includes(selectedProduct);
    }

    let reagentsMatch = true;
    if (selectedReagents.length > 0) {
      const inputs = [reaction.input_cell1, reaction.input_cell2, reaction.input_cell3].filter(Boolean);
      reagentsMatch = selectedReagents.every((reagent) => inputs.includes(reagent));
    }

    return productMatch && reagentsMatch;
  });

  const availableReagentIds = new Set();
  relevantReactions.forEach((reaction) => {
    [reaction.input_cell1, reaction.input_cell2, reaction.input_cell3]
      .filter(Boolean)
      .forEach((id) => availableReagentIds.add(id));
  });

  return Array.isArray(materials)
    ? materials
        .filter((m) => availableReagentIds.has(m.id))
        .map((m) => ({
          value: m.id,
          label: `${m.name} (${m.id})`,
          name: m.name,
          type: m.type || "",
        }))
    : [];
};

const getAvailableProducts = (selectedReagents, selectedProduct) => {
  if (!selectedProduct && selectedReagents.length === 0) {
    const uniqueProducts = Array.isArray(reactions)
      ? [...new Set(reactions.flatMap((r) => [r.output_cell1, r.output_cell2, r.output_cell3].filter(Boolean)))]
      : [];
    return uniqueProducts.map((id) => {
      let name = id;
      let type = "";
      let label = `${id} (${id})`;
      if (Array.isArray(materials)) {
        const material = materials.find((m) => m.id === id);
        if (material) {
          name = material.name;
          type = material.type || "";
          label = `${material.name} (${id})`;
        }
      }
      return { value: id, label: label, name: name, type: type };
    });
  }

  const relevantReactions = reactions.filter((reaction) => {
    if (selectedReagents.length === 0) return true;

    const inputs = [reaction.input_cell1, reaction.input_cell2, reaction.input_cell3].filter(Boolean);
    return selectedReagents.every((reagent) => inputs.includes(reagent));
  });

  const availableProductIds = new Set();
  relevantReactions.forEach((reaction) => {
    [reaction.output_cell1, reaction.output_cell2, reaction.output_cell3]
      .filter(Boolean)
      .forEach((id) => availableProductIds.add(id));
  });

  return Array.isArray(materials)
    ? materials
        .filter((m) => availableProductIds.has(m.id))
        .map((m) => ({
          value: m.id,
          label: `${m.name} (${m.id})`,
          name: m.name,
          type: m.type || "",
        }))
    : [];
};

const baseTableOptions = {
  rows: isBigScreen,
  width: { reaction_rate: 55 },
  align: {
    reaction_rate: "right",
    input_cell1: "left",
    input_cell2: "left",
    input_cell3: "left",
    output_cell1: "left",
    output_cell2: "left",
    output_cell3: "left",
  },
  sort: "reaction_rate",
  reverse: true,
  select: false,
  multiple: true,
  layout: "fixed",
  columns: [
    "reaction_rate",
    "input_cell1",
    "input_cell2",
    "input_cell3",
    "output_cell1",
    "output_cell2",
    "output_cell3",
  ],
  header: {
    reaction_rate: "Speed",
    input_cell1: "1ˢᵗ ingredient",
    input_cell2: "2ⁿᵈ ingredient",
    input_cell3: "3ʳᵈ ingredient",
    output_cell1: "1ˢᵗ Product",
    output_cell2: "2ⁿᵈ Product",
    output_cell3: "3ʳᵈ Product",
  },
};
```

```js
{
  let selectedReagents = [];
  let selectedProduct = "";
  let reagentChoices = null;
  let productChoices = null;
  let isInitialized = false;

  // Wait for all required elements to be available
  const initializeApp = async () => {
    try {
      console.log("Waiting for DOM elements...");

      const [
        reagentSelectorElement,
        productSelectorElement,
        tableContainer,
        reactionsCountContainer,
        ambrosiaLink,
        flummoxiumLink,
        frogWhiskeyLink,
      ] = await Promise.all([
        waitForElement("choicesSelector"),
        waitForElement("productChoicesSelector"),
        waitForElement("tableContainer"),
        waitForElement("reactionsCount"),
        waitForElement("ambrosia-link"),
        waitForElement("flum-link"),
        waitForElement("frog-whiskey-link"),
      ]);
      if (reagentSelectorElement.classList.contains("choices__input")) {
        return;
      }
      console.log("All DOM elements found, initializing...");

      const createChoicesTemplates = (strToEl) => {
        return {
          choice: ({ classNames }, data) => {
            if (!data) {
              console.warn("[Template Choice] Data is null/undefined");
              return strToEl(
                `<div class="${classNames.item} ${classNames.itemChoice} ${classNames.itemSelectable}">Invalid Data</div>`
              );
            }

            const imageUrl = getMaterialImageUrl(data.value || "");
            const nameForDisplay = data.name || (data.label ? data.label.split(" (")[0] : data.value || "Unknown");
            const typeForDisplay = (data.type || "").toLowerCase();
            const safeValue = data.value || "";
            const safeId = data.id || "";

            return strToEl(
              `<div class="${classNames.item} ${classNames.itemChoice} ${classNames.itemSelectable}" data-choice data-choice-selectable data-id="${safeId}" data-value="${safeValue}" role="option">
                <img src="${imageUrl}" style="height: 24px; display: inline-block; vertical-align: middle; margin-right: 8px;" alt="${nameForDisplay}" />
                <span class="material-name-text">${nameForDisplay}</span>
                (<span class="material-type-${typeForDisplay}">${safeValue}</span>)
              </div>`
            );
          },
          item: ({ classNames }, data) => {
            if (!data) {
              console.warn("[Template Item] Data is null/undefined");
              return strToEl(`<div class="${classNames.item}">Invalid Data</div>`);
            }

            const imageUrl = getMaterialImageUrl(data.value || "");
            const nameForDisplay = data.name || (data.label ? data.label.split(" (")[0] : data.value || "Unknown");
            const typeForDisplay = (data.type || "").toLowerCase();
            const safeValue = data.value || "";
            const safeId = data.id || "";

            return strToEl(
              `<div class="${classNames.item}" data-item data-id="${safeId}" data-value="${safeValue}" aria-selected="true" role="option" data-deletable>
                <img src="${imageUrl}" style="height: 24px; display: inline-block; vertical-align: middle; margin: 8px;" alt="${nameForDisplay}" />
                <span class="material-name-text">${nameForDisplay}</span>
                (<span class="material-type-${typeForDisplay}"><code>${safeValue}</code></span>)
                <button type="button" class="${classNames.button}" aria-label="Remove item: ${nameForDisplay}" data-button>Remove item</button>
              </div>`
            );
          },
        };
      };

      const safeChoicesOperation = (choicesInstance, operation) => {
        try {
          if (!choicesInstance || !choicesInstance.initialised) {
            console.warn("Choices instance not initialized, skipping operation");
            return false;
          }
          return operation();
        } catch (error) {
          console.error("Error in choices operation:", error);
          return false;
        }
      };

      const updateChoicesOptions = () => {
        const availableReagents = getAvailableReagents(selectedReagents, selectedProduct);
        const availableProducts = getAvailableProducts(selectedReagents, selectedProduct);

        // Update reagent choices with error handling
        safeChoicesOperation(reagentChoices, () => {
          reagentChoices.clearStore();
          reagentChoices.setChoices(availableReagents, "value", "label", true);

          // Restore selected reagents that are still available
          const stillAvailableReagents = selectedReagents.filter((reagent) =>
            availableReagents.some((r) => r.value === reagent)
          );
          stillAvailableReagents.forEach((reagent) => {
            reagentChoices.setChoiceByValue(reagent);
          });
          selectedReagents = stillAvailableReagents;
          return true;
        });

        // Update product choices with error handling
        safeChoicesOperation(productChoices, () => {
          productChoices.clearStore();
          productChoices.setChoices(availableProducts, "value", "label", true);

          // Restore selected product if still available
          if (selectedProduct && availableProducts.some((p) => p.value === selectedProduct)) {
            productChoices.setChoiceByValue(selectedProduct);
          } else if (selectedProduct) {
            selectedProduct = "";
          }
          return true;
        });
      };

      // Initialize Choices.js instances
      reagentChoices = new Choices(reagentSelectorElement, {
        silent: false,
        maxItemCount: 3,
        allowHTML: true,
        placeholder: true,
        placeholderValue: "Search Reagents",
        removeItemButton: true,
        choices: getAvailableReagents([], ""),
        searchEnabled: true,
        renderSelectedChoices: "auto",
        callbackOnCreateTemplates: createChoicesTemplates,
      });

      productChoices = new Choices(productSelectorElement, {
        silent: false,
        maxItemCount: 1,
        allowHTML: true,
        placeholder: true,
        placeholderValue: "Search Products",
        removeItemButton: true,
        choices: getAvailableProducts([], ""),
        searchEnabled: true,
        renderSelectedChoices: "always",
        maxItemText: (maxItemCount) => {
          return `Searching for only ${maxItemCount} product at a time is allowed`;
        },
        callbackOnCreateTemplates: createChoicesTemplates,
      });

      const formatMaterialCellInTable = (id) => {
        if (!id) return html`<div></div>`;
        let nameInCell = id;
        let typeInCell = "";
        let fullDisplayName = id;
        let wikiUrl = "";

        if (Array.isArray(materials)) {
          const material = materials.find((m) => m.id === id);
          if (material) {
            nameInCell = material.name;
            typeInCell = material.type ? material.type.toLowerCase() : "";
            fullDisplayName = `${material.name} (${id})`;
            wikiUrl = material.wikipage ? `https://noita.wiki.gg/wiki/${encodeURIComponent(material.wikipage)}` : "";
          } else {
            fullDisplayName = `[${id} - Not Found]`;
          }
        } else {
          fullDisplayName = `[${id} - Materials N/A]`;
        }

        const imageUrl = getMaterialImageUrl(id);

        const materialNameContent = wikiUrl
          ? html`<a
              href="${wikiUrl}"
              target="_blank"
            >
              <span class="material-name-text">${nameInCell}</span>
              <span class="material-name-text"><br />(</span
              ><span class="material-type-${typeInCell}"><code>${id}</code></span
              ><span class="material-name-text">)</span>
            </a>`
          : html`<span class="material-name-text">${nameInCell}</span> <span class="material-name-text"><br />(</span
              ><span class="material-type-${typeInCell}"><code>${id}</code></span
              ><span class="material-name-text">)</span>`;

        return html` <div
          class="material"
          style="display: flex; align-items: center; height: 30px; padding: 2px 0;"
        >
          ${imageUrl
            ? html`<div
                class="material-image"
                style="height: 48px; margin-right: 5px; flex-shrink: 0;"
              >
                <img
                  src="${imageUrl}"
                  alt="${nameInCell}"
                  style="width: 100%; height: 100%; object-fit: contain; image-rendering: pixelated;"
                  onerror="this.style.display='none'"
                />
              </div>`
            : html`<div
                style="width:48px; height:48px; margin-right:5px; flex-shrink:0; border:1px dashed #ccc; font-size:9px; display:flex; align-items:center; justify-content:center; color: #ccc;"
              >
                N/I
              </div>`}
          <span
            class="material-name"
            style="white-space: normal; line-height: 1.2;"
          >
            ${materialNameContent}
          </span>
        </div>`;
      };

      const currentTableOptions = { ...baseTableOptions, format: {} };
      ["input_cell1", "input_cell2", "input_cell3", "output_cell1", "output_cell2", "output_cell3"].forEach((col) => {
        currentTableOptions.format[col] = formatMaterialCellInTable;
      });

      function getFilteredReactions() {
        if (!Array.isArray(reactions) || reactions.length === 0) {
          return [];
        }

        const result = reactions.filter((reaction) => {
          if (selectedReagents.length > 0) {
            const reactionInputs = [reaction.input_cell1, reaction.input_cell2, reaction.input_cell3].filter(Boolean);
            if (!selectedReagents.every((reagent) => reactionInputs.includes(reagent))) {
              return false;
            }
          }

          if (selectedProduct) {
            const reactionOutputs = [reaction.output_cell1, reaction.output_cell2, reaction.output_cell3].filter(
              Boolean
            );
            if (!reactionOutputs.includes(selectedProduct)) {
              return false;
            }
          }

          return true;
        });

        return result;
      }

      function updateUI() {
        try {
          const filteredReactions = getFilteredReactions();

          if (tableContainer) {
            const newTable = Inputs.table(filteredReactions, currentTableOptions);
            tableContainer.innerHTML = "";
            tableContainer.appendChild(newTable);
          }

          if (reactionsCountContainer) {
            reactionsCountContainer.innerHTML = `There are ${filteredReactions.length} possible reactions`;
          }
        } catch (error) {
          console.error("Error updating UI:", error);
        }
      }

      // Add debounce to prevent rapid-fire updates
      let updateTimeout;
      const debouncedUpdate = () => {
        clearTimeout(updateTimeout);
        updateTimeout = setTimeout(() => {
          updateChoicesOptions();
          updateUI();
        }, 100); // 100ms delay
      };

      // Event listeners
      reagentSelectorElement.addEventListener("change", () => {
        try {
          if (reagentChoices && reagentChoices.initialised) {
            selectedReagents = reagentChoices.getValue(true);
            debouncedUpdate();
          }
        } catch (error) {
          console.error("Error in reagent change handler:", error);
        }
      });

      productSelectorElement.addEventListener("change", () => {
        try {
          if (productChoices && productChoices.initialised) {
            const selectedValues = productChoices.getValue(true);
            selectedProduct = Array.isArray(selectedValues) && selectedValues.length > 0 ? selectedValues[0] : "";
            debouncedUpdate();
          }
        } catch (error) {
          console.error("Error in product change handler:", error);
        }
      });

      ambrosiaLink.addEventListener("click", (e) => {
        e.preventDefault();
        try {
          selectedReagents = [];
          selectedProduct = "magic_liquid_protection_all";

          safeChoicesOperation(reagentChoices, () => reagentChoices.removeActiveItems());
          safeChoicesOperation(productChoices, () => productChoices.removeActiveItems());

          updateChoicesOptions();

          requestAnimationFrame(() => {
            safeChoicesOperation(productChoices, () => productChoices.setChoiceByValue("magic_liquid_protection_all"));
            updateUI();
          });
        } catch (error) {
          console.error("Error setting ambrosia:", error);
        }
      });

      flummoxiumLink.addEventListener("click", (e) => {
        e.preventDefault();
        try {
          selectedReagents = ["material_confusion"];
          selectedProduct = "";

          safeChoicesOperation(reagentChoices, () => reagentChoices.removeActiveItems());
          safeChoicesOperation(productChoices, () => productChoices.removeActiveItems());

          updateChoicesOptions();

          requestAnimationFrame(() => {
            safeChoicesOperation(reagentChoices, () => reagentChoices.setChoiceByValue("material_confusion"));
            updateUI();
          });
        } catch (error) {
          console.error("Error setting flummoxium:", error);
        }
      });

      frogWhiskeyLink.addEventListener("click", (e) => {
        e.preventDefault();
        try {
          selectedReagents = ["meat_frog", "alcohol"];
          selectedProduct = "";

          safeChoicesOperation(reagentChoices, () => reagentChoices.removeActiveItems());
          safeChoicesOperation(productChoices, () => productChoices.removeActiveItems());

          updateChoicesOptions();

          requestAnimationFrame(() => {
            safeChoicesOperation(reagentChoices, () => {
              reagentChoices.setChoiceByValue("meat_frog");
              reagentChoices.setChoiceByValue("alcohol");
            });
            updateUI();
          });
        } catch (error) {
          console.error("Error setting frog meat and whiskey:", error);
        }
      });

      // Initial UI update
      updateUI();
      isInitialized = true;
      console.log("App initialized successfully");
    } catch (error) {
      console.error("Failed to initialize app:", error);
    }
  };

  // Start initialization
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeApp);
  } else {
    initializeApp();
  }
}
```

<div class="grid grid-cols-4">
    <div class="card grid-colspan-3">
        <select id="choicesSelector" multiple></select>
    </div>
    <div class="card grid-colspan-1">
        <select id="productChoicesSelector" multiple></select>
    </div>
</div>
<div class="card grid-colspan-1">
    <h3 id="reactionsCount">There are 5589 possible reactions</h3>
</div>
<div class="grid grid-cols-1 grid-rowspan-1" style="grid-auto-rows: auto;">
    <div class="card grid-colspan-1 grid-rowspan-1" style="padding: 0;" id="tableContainer">
        </div>
</div>
