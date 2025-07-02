---
title: "Reactions Finder"
draft: false
---

<script src="https://cdn.jsdelivr.net/npm/choices.js/public/assets/scripts/choices.min.js"></script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/choices.js/public/assets/styles/choices.min.css"/>
<link href="custom.css" rel="stylesheet"></link>

<h1 id="acidTitle" class="bartender-heading-decrypted">Reactions Finder</h1>
<h2>Ever wanted to make <code><span class="material-type-liquid">Ambrosia</span></code>? Is <code><span class="material-type-liquid">Flummoxium</span></code> even useful? Mixing <code><span class="material-type-solid">frog meat</span> and <span class="material-type-liquid">whiskey</span></code> does something!? Noita has <code class="bigger-number-better">${reactions.length}</code> fixed material reactions, and two secret reactions for each seed. When you select the first igredient the list autoupdates, showing only materials that can react with the selected.</h2>

```js
import { initializeTitleAnimation } from "./components/titleAnimation.js";
initializeTitleAnimation();
```

```ts
/**

 * Creates a notification element with a fade-in and fade-out effect.

 *

 * @param {string} text - The notification text.

 * @param {string} [notifID="share-notification"] - The ID of the notification element.

 * @param {string} [parentID="observablehq-main"] - The ID of the parent element.

 */

const createNotification = (text, notifID = "share-notification", parentID = "observablehq-main") => {
  const parentElement = document.getElementById(parentID);

  if (!parentElement) {
    console.error(`Parent element with ID ${parentID} not found.`);

    return;
  }

  const existsNotification = document.getElementById(notifID);

  if (existsNotification) {
    return;
  }

  const notification = document.createElement("p");

  notification.id = notifID;

  notification.textContent = text;

  notification.classList.add("notification");

  parentElement.appendChild(notification);

  // Fade-in and fade-out animation

  const fadeIn = () => {
    notification.style.opacity = 1;
  };

  const fadeOut = () => {
    notification.style.opacity = 0;

    setTimeout(() => {
      parentElement.removeChild(notification);
    }, 500); // Wait for fade-out animation to complete
  };

  setTimeout(fadeIn, 100);

  setTimeout(fadeOut, 2500);
};

// Add CSS class for styling

const notificationStyle = document.createElement("style");

notificationStyle.textContent = `

  .notification {

    /* Positioning and Layout */

    position: fixed;

    z-index: 9999;

    inset: 5% 0 0 50%;

    translate: -50% 0;

    width: max-content;

    height: max-content;


    /* Visual Styling */

    background-color: oklch(39.3% 0.095 152.535);

    background-repeat: repeat;

    background-position-y: bottom;

    border-radius: 1rem;

    padding: 1rem;


    /* Text Styling */

    font-weight: bold;

    font-size: large;

    color: oklch(92.5% 0.084 155.995);

    font-family: -apple-system, BlinkMacSystemFont, "avenir next", avenir, helvetica, "helvetica neue", ubuntu, roboto, noto, "segoe ui", arial, sans-serif;




    /* Animation and Transitions */

    transition: opacity 500ms;

    opacity: 0;

    animation: slideInDown 500ms ease-out;


    /* User Interaction */

    user-select: none;

  }


  @keyframes slideInDown {

    0% {

      transform: translateY(-100%);

      opacity: 0;

    }

    100% {

      transform: translateY(0);

      opacity: 1;

    }

  }

`;

document.head.appendChild(notificationStyle);

const shareButton = Inputs.button(
  htl.html`<img src="https://noita-bartender-images.acidflow.stream/images/icons/copy.svg" />Share`,

  {
    value: null,

    reduce: () => {
      const url = new URL(window.location.href);

      url.search = "";

      const reagents = window.appState.selectedReagents || [];

      const product = window.appState.selectedProduct || "";

      if (reagents.length > 0) url.searchParams.set("reagents", reagents.join(","));

      if (product) url.searchParams.set("product", product);

      const shareUrl = url.toString();

      navigator.clipboard

        .writeText(shareUrl)

        .then(() => {
          console.log("URL copied to clipboard: %s", shareUrl);

          createNotification("URL copied to clipboard");
        })

        .catch((err) => {
          console.error("Failed to copy URL to clipboard:", err);

          const textArea = document.createElement("textarea");

          textArea.value = shareUrl;

          document.body.appendChild(textArea);

          textArea.select();

          try {
            document.execCommand("copy");

            createNotification("URL copied to clipboard");

            console.log("URL copied using fallback method");
          } catch (fallbackErr) {
            console.error("Fallback copy also failed:", fallbackErr);
          }

          document.body.removeChild(textArea);
        });

      return shareUrl;
    },
  }
);
```

```js
window.appState = {
  selectedReagents: [],
  selectedProduct: "",
  reagentChoices: null,
  productChoices: null,
  updateChoicesOptions: null,
  updateUI: null,
  isResetting: false,
};

const urlParams = new URLSearchParams(window.location.search);
window.appState.selectedReagents = urlParams.get("reagents")?.split(",") || [];
window.appState.selectedProduct = urlParams.get("product") || "";

const resetButton = Inputs.button(
  htl.html`<img src="https://noita-bartender-images.acidflow.stream/images/icons/arrow-counterclockwise.svg" />Reset`,
  {
    label: "",
    reduce: () => {
      window.appState.isResetting = true;

      const url = new URL(window.location.href);
      url.search = "";
      window.history.replaceState({}, "", url.toString());

      window.appState.selectedReagents = [];
      window.appState.selectedProduct = "";

      const { reagentChoices, productChoices, updateChoicesOptions, updateUI } = window.appState;

      if (reagentChoices && reagentChoices.initialised) {
        reagentChoices.removeActiveItems();
      }
      if (productChoices && productChoices.initialised) {
        productChoices.removeActiveItems();
      }

      if (typeof updateChoicesOptions === "function") {
        updateChoicesOptions();
      }
      if (typeof updateUI === "function") {
        updateUI();
      }

      window.appState.isResetting = false;

      return null;
    },
  }
);
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

const getReactionMaterials = () => {
  const reactionMaterialIds = new Set();
  reactions.forEach((reaction) => {
    [
      reaction.input_cell1,
      reaction.input_cell2,
      reaction.input_cell3,
      reaction.output_cell1,
      reaction.output_cell2,
      reaction.output_cell3,
    ]
      .filter(Boolean)
      .forEach((id) => reactionMaterialIds.add(id));
  });
  return reactionMaterialIds;
};

const reactionMaterialIds = getReactionMaterials();

const getAvailableReagents = (currentSelectedReagents, currentSelectedProduct) => {
  if (!currentSelectedProduct && currentSelectedReagents.length === 0) {
    return Array.isArray(materials)
      ? materials
          .filter((d) => reactionMaterialIds.has(d.id))
          .map((d) => ({
            value: d.id,
            label: `${d.name} (${d.id})`,
            name: d.name,
            type: d.type || "",
          }))
      : [];
  }

  const relevantReactions = reactions.filter((reaction) => {
    let productMatch = true;
    if (currentSelectedProduct) {
      const outputs = [reaction.output_cell1, reaction.output_cell2, reaction.output_cell3].filter(Boolean);
      productMatch = outputs.includes(currentSelectedProduct);
    }

    let reagentsMatch = true;
    if (currentSelectedReagents.length > 0) {
      const inputs = [reaction.input_cell1, reaction.input_cell2, reaction.input_cell3].filter(Boolean);
      reagentsMatch = currentSelectedReagents.every((reagent) => inputs.includes(reagent));
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

const getAvailableProducts = (currentSelectedReagents, currentSelectedProduct) => {
  if (!currentSelectedProduct && currentSelectedReagents.length === 0) {
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
    if (currentSelectedReagents.length === 0) return true;

    const inputs = [reaction.input_cell1, reaction.input_cell2, reaction.input_cell3].filter(Boolean);
    return currentSelectedReagents.every((reagent) => inputs.includes(reagent));
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
  let reagentChoices = null;
  let productChoices = null;

  const initializeApp = async () => {
    try {
      const [reagentSelectorElement, productSelectorElement, tableContainer, reactionsCountContainer] =
        await Promise.all([
          waitForElement("choicesSelector"),
          waitForElement("productChoicesSelector"),
          waitForElement("tableContainer"),
          waitForElement("reactionsCount"),
        ]);

      if (reagentSelectorElement.classList.contains("choices__input")) {
        return;
      }

      const createChoicesTemplates = (strToEl) => {
        return {
          choice: ({ classNames }, data) => {
            if (!data) {
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
            return false;
          }
          return operation();
        } catch (error) {
          console.error("Error in choices operation:", error);
          return false;
        }
      };

      const updateChoicesOptions = () => {
        const availableReagents = getAvailableReagents(
          window.appState.selectedReagents,
          window.appState.selectedProduct
        );
        const availableProducts = getAvailableProducts(
          window.appState.selectedReagents,
          window.appState.selectedProduct
        );

        safeChoicesOperation(reagentChoices, () => {
          reagentChoices.clearStore();
          reagentChoices.setChoices(availableReagents, "value", "label", true);
          window.appState.selectedReagents.forEach((value) => {
            if (availableReagents.some((r) => r.value === value)) {
              reagentChoices.setChoiceByValue(value);
            }
          });
          return true;
        });

        safeChoicesOperation(productChoices, () => {
          productChoices.clearStore();
          productChoices.setChoices(availableProducts, "value", "label", true);
          if (
            window.appState.selectedProduct &&
            availableProducts.some((p) => p.value === window.appState.selectedProduct)
          ) {
            productChoices.setChoiceByValue(window.appState.selectedProduct);
          }
          return true;
        });
      };

      reagentChoices = new Choices(reagentSelectorElement, {
        silent: false,
        maxItemCount: 3,
        allowHTML: true,
        placeholder: true,
        placeholderValue: "Search Reagents",
        removeItemButton: true,
        choices: getAvailableReagents(window.appState.selectedReagents, window.appState.selectedProduct),
        searchEnabled: true,
        renderSelectedChoices: "auto",
        callbackOnCreateTemplates: createChoicesTemplates,
        noChoicesText: "There are no reactions with one more ingredient",
      });

      productChoices = new Choices(productSelectorElement, {
        silent: false,
        maxItemCount: 1,
        allowHTML: true,
        placeholder: true,
        placeholderValue: "Search Products",
        removeItemButton: true,
        choices: getAvailableProducts(window.appState.selectedReagents, window.appState.selectedProduct),
        searchEnabled: true,
        renderSelectedChoices: "always",
        maxItemText: (maxItemCount) => {
          return `You can only search for one product at a time`;
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
          if (window.appState.selectedReagents.length > 0) {
            const reactionInputs = [reaction.input_cell1, reaction.input_cell2, reaction.input_cell3].filter(Boolean);
            if (!window.appState.selectedReagents.every((reagent) => reactionInputs.includes(reagent))) {
              return false;
            }
          }

          if (window.appState.selectedProduct) {
            const reactionOutputs = [reaction.output_cell1, reaction.output_cell2, reaction.output_cell3].filter(
              Boolean
            );
            if (!reactionOutputs.includes(window.appState.selectedProduct)) {
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
            reactionsCountContainer.innerHTML = `Reactions found: <code class="bigger-number-better">${filteredReactions.length}</code>`;
          }

          if (!window.appState.isResetting) {
            updateURL();
          }
        } catch (error) {
          console.error("Error updating UI:", error);
        }
      }

      function updateURL() {
        try {
          const url = new URL(window.location.href);
          url.search = "";

          if (window.appState.selectedReagents.length > 0) {
            url.searchParams.set("reagents", window.appState.selectedReagents.join(","));
          }
          if (window.appState.selectedProduct) {
            url.searchParams.set("product", window.appState.selectedProduct);
          }

          window.history.replaceState({}, "", url.toString());
        } catch (error) {
          console.error("Error updating URL:", error);
        }
      }

      let updateTimeout;
      const debouncedUpdate = () => {
        clearTimeout(updateTimeout);
        updateTimeout = setTimeout(() => {
          updateChoicesOptions();
          updateUI();
        }, 100);
      };

      reagentSelectorElement.addEventListener("change", () => {
        try {
          if (reagentChoices && reagentChoices.initialised && !window.appState.isResetting) {
            window.appState.selectedReagents = reagentChoices.getValue(true);
            debouncedUpdate();
          }
        } catch (error) {
          console.error("Error in reagent change handler:", error);
        }
      });

      productSelectorElement.addEventListener("change", () => {
        try {
          if (productChoices && productChoices.initialised && !window.appState.isResetting) {
            const selectedValues = productChoices.getValue(true);
            window.appState.selectedProduct =
              Array.isArray(selectedValues) && selectedValues.length > 0 ? selectedValues[0] : "";
            debouncedUpdate();
          }
        } catch (error) {
          console.error("Error in product change handler:", error);
        }
      });

      window.appState.reagentChoices = reagentChoices;
      window.appState.productChoices = productChoices;
      window.appState.updateChoicesOptions = updateChoicesOptions;
      window.appState.updateUI = updateUI;

      // Initial state setup and UI update
      if (window.appState.selectedReagents.length > 0 || window.appState.selectedProduct) {
        requestAnimationFrame(() => {
          updateChoicesOptions(); // Update available options for dropdowns based on initial selections
          updateUI(); // Initial UI update based on URL params
        });
      } else {
        // Initial UI update if no URL parameters are present
        updateUI();
      }
    } catch (error) {
      console.error("Failed to initialize app:", error);
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeApp);
  } else {
    initializeApp();
  }
}
```

<div class="grid grid-cols-4">
  <div class="card grid-colspan-2">
    <select id="choicesSelector" multiple></select>
  </div>
  <div class="card grid-colspan-1">
    <select id="productChoicesSelector" multiple></select>
  </div>
  <div class="card grid-colspan-1"><h2 id="reactionsCount">Reactions found: <code class="bigger-number-better">5589</code></h2></div>
</div>
<div class="grid grid-cols-4">
  <div class="card grid-colspan-1">${resetButton}</div>
  <div class="card grid-colspan-1">${shareButton}</div>
</div>
<div class="grid grid-cols-1 grid-rowspan-1" style="grid-auto-rows: auto">
  <div class="card grid-colspan-1 grid-rowspan-1" style="padding: 0" id="tableContainer"></div>
</div>
