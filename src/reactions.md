---
title: "Reactions Finder"
draft: false
---

<!-- Facebook Meta Tags -->
<meta property="og:url" content="https://bartender.runfast.stream">
<meta property="og:type" content="website">
<meta property="og:title" content="Noita Bartender">
<meta property="og:description" content="Noita Materials Exploration Tool">
<meta property="og:image" content="https://noita-bartender-images.acidflow.stream/images/logo/BARTENDER_SOCIALS.png">

<!-- Twitter Meta Tags -->
<meta name="twitter:card" content="summary_large_image">
<meta property="twitter:domain" content="bartender.runfast.stream">
<meta property="twitter:url" content="https://bartender.runfast.stream">
<meta name="twitter:title" content="Noita Bartender">
<meta name="twitter:description" content="Noita Materials Exploration Tool">
<meta name="twitter:image" content="https://noita-bartender-images.acidflow.stream/images/logo/BARTENDER_SOCIALS.png">

<script src="https://cdn.jsdelivr.net/npm/choices.js/public/assets/scripts/choices.min.js"></script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/choices.js/public/assets/styles/choices.min.css"/>
<link href="custom.css" rel="stylesheet"></link>

<h1 id="acidTitle" class="bartender-heading-decrypted">Reactions Finder</h1>
<h2>Ever wanted to make <code><span class="material-type-liquid">Ambrosia</span></code>? Is <code><span class="material-type-liquid">Flummoxium</span></code> even useful? Mixing <code><span class="material-type-solid">frog meat</span> and <span class="material-type-liquid">whiskey</span></code> does something!? Noita has <code class="bigger-number-better">${reactions.length}</code> fixed material reactions, and two secret reactions for each seed. When you select the first ingredient the list autoupdates, showing only materials that can react with the selected.</h2>

```js
import { initializeTitleAnimation } from "./components/titleAnimation.js";
initializeTitleAnimation();
```

```js
// Load data
const materials = await FileAttachment("./data/FULL_MATERIALS_FINAL.json").json();
const reactions = await FileAttachment("./data/jsons/reactions.json").json();
```

```js
const materialsMap = new Map(materials.map((m) => [m.id, m]));

// Build indexes for faster filtering
const reactionInputsIndex = new Map();
const reactionOutputsIndex = new Map();

reactions.forEach((reaction, index) => {
  // Index inputs
  [reaction.input_cell1, reaction.input_cell2, reaction.input_cell3].filter(Boolean).forEach((input) => {
    if (!reactionInputsIndex.has(input)) {
      reactionInputsIndex.set(input, []);
    }
    reactionInputsIndex.get(input).push(index);
  });

  // Index outputs
  [reaction.output_cell1, reaction.output_cell2, reaction.output_cell3].filter(Boolean).forEach((output) => {
    if (!reactionOutputsIndex.has(output)) {
      reactionOutputsIndex.set(output, []);
    }
    reactionOutputsIndex.get(output).push(index);
  });
});
```

```js
// Global state
window.appState = {
  selectedReagents: [],
  selectedProduct: "",
  reagentChoices: null,
  productChoices: null,
  isResetting: false,
  excludeSpecialMaterials: false,
  onlyPracticalReactions: false,
};

// Parse URL parameters
const urlParams = new URLSearchParams(window.location.search);
window.appState.selectedReagents = urlParams.get("reagents")?.split(",").filter(Boolean) || [];
window.appState.selectedProduct = urlParams.get("product") || "";
window.appState.excludeSpecialMaterials = urlParams.get("excludeSpecial") === "true";
window.appState.onlyPracticalReactions = urlParams.get("onlyPractical") === "true";
```

```js
// Special materials to exclude
const specialMaterials = new Set(["mimic_liquid", "midas_precursor", "midas"]);

// Optimized functions using indexes
const getAvailableReagents = (selectedReagents = [], selectedProduct = "") => {
  if (!selectedProduct && selectedReagents.length === 0) {
    // Return all materials that appear as inputs in reactions
    let availableIds = Array.from(reactionInputsIndex.keys());

    // Filter out special materials if needed
    if (window.appState.excludeSpecialMaterials) {
      availableIds = availableIds.filter((id) => !specialMaterials.has(id));
    }

    return availableIds
      .map((id) => {
        const material = materialsMap.get(id);
        return material
          ? {
              value: id,
              label: `${material.name} (${id})`,
              name: material.name,
              type: material.type || "",
            }
          : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  // Get relevant reaction indices using indexes
  let relevantReactionIndices = new Set();

  if (selectedProduct) {
    const productReactions = reactionOutputsIndex.get(selectedProduct) || [];
    relevantReactionIndices = new Set(productReactions);
  } else {
    relevantReactionIndices = new Set(Array.from({ length: reactions.length }, (_, i) => i));
  }

  if (selectedReagents.length > 0) {
    selectedReagents.forEach((reagent) => {
      const reagentReactions = new Set(reactionInputsIndex.get(reagent) || []);
      relevantReactionIndices = new Set([...relevantReactionIndices].filter((x) => reagentReactions.has(x)));
    });
  }

  // Apply filters to reactions
  if (window.appState.excludeSpecialMaterials || window.appState.onlyPracticalReactions) {
    relevantReactionIndices = new Set(
      [...relevantReactionIndices].filter((index) => {
        const reaction = reactions[index];

        // Filter out low-speed reactions
        if (window.appState.onlyPracticalReactions && reaction.reaction_rate <= 5) {
          return false;
        }

        // Filter out reactions with special materials
        if (window.appState.excludeSpecialMaterials) {
          const allMaterials = [
            reaction.input_cell1,
            reaction.input_cell2,
            reaction.input_cell3,
            reaction.output_cell1,
            reaction.output_cell2,
            reaction.output_cell3,
          ].filter(Boolean);

          if (allMaterials.some((id) => specialMaterials.has(id))) {
            return false;
          }
        }

        return true;
      })
    );
  }

  // Collect all input materials from relevant reactions
  const availableReagentIds = new Set();
  relevantReactionIndices.forEach((index) => {
    const reaction = reactions[index];
    [reaction.input_cell1, reaction.input_cell2, reaction.input_cell3]
      .filter(Boolean)
      .forEach((id) => availableReagentIds.add(id));
  });

  return Array.from(availableReagentIds)
    .map((id) => {
      const material = materialsMap.get(id);
      return material
        ? {
            value: id,
            label: `${material.name} (${id})`,
            name: material.name,
            type: material.type || "",
          }
        : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
};

const getAvailableProducts = (selectedReagents = []) => {
  if (selectedReagents.length === 0) {
    // Return all products from all reactions
    let availableIds = Array.from(reactionOutputsIndex.keys());

    // Filter out special materials if needed
    if (window.appState.excludeSpecialMaterials) {
      availableIds = availableIds.filter((id) => !specialMaterials.has(id));
    }

    return availableIds
      .map((id) => {
        const material = materialsMap.get(id);
        return {
          value: id,
          label: material ? `${material.name} (${id})` : `${id} (${id})`,
          name: material ? material.name : id,
          type: material ? material.type || "" : "",
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  // Get relevant reaction indices using indexes
  let relevantReactionIndices = new Set(Array.from({ length: reactions.length }, (_, i) => i));

  selectedReagents.forEach((reagent) => {
    const reagentReactions = new Set(reactionInputsIndex.get(reagent) || []);
    relevantReactionIndices = new Set([...relevantReactionIndices].filter((x) => reagentReactions.has(x)));
  });

  // Apply filters to reactions
  if (window.appState.excludeSpecialMaterials || window.appState.onlyPracticalReactions) {
    relevantReactionIndices = new Set(
      [...relevantReactionIndices].filter((index) => {
        const reaction = reactions[index];

        // Filter out low-speed reactions
        if (window.appState.onlyPracticalReactions && reaction.reaction_rate <= 5) {
          return false;
        }

        // Filter out reactions with special materials
        if (window.appState.excludeSpecialMaterials) {
          const allMaterials = [
            reaction.input_cell1,
            reaction.input_cell2,
            reaction.input_cell3,
            reaction.output_cell1,
            reaction.output_cell2,
            reaction.output_cell3,
          ].filter(Boolean);

          if (allMaterials.some((id) => specialMaterials.has(id))) {
            return false;
          }
        }

        return true;
      })
    );
  }

  // Collect all output materials from relevant reactions
  const availableProductIds = new Set();
  relevantReactionIndices.forEach((index) => {
    const reaction = reactions[index];
    [reaction.output_cell1, reaction.output_cell2, reaction.output_cell3]
      .filter(Boolean)
      .forEach((id) => availableProductIds.add(id));
  });

  return Array.from(availableProductIds)
    .map((id) => {
      const material = materialsMap.get(id);
      return material
        ? {
            value: id,
            label: `${material.name} (${id})`,
            name: material.name,
            type: material.type || "",
          }
        : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
};

const getFilteredReactions = (selectedReagents = [], selectedProduct = "") => {
  // Use indexes for faster filtering
  let relevantReactionIndices = new Set(Array.from({ length: reactions.length }, (_, i) => i));

  if (selectedProduct) {
    const productReactions = new Set(reactionOutputsIndex.get(selectedProduct) || []);
    relevantReactionIndices = new Set([...relevantReactionIndices].filter((x) => productReactions.has(x)));
  }

  if (selectedReagents.length > 0) {
    selectedReagents.forEach((reagent) => {
      const reagentReactions = new Set(reactionInputsIndex.get(reagent) || []);
      relevantReactionIndices = new Set([...relevantReactionIndices].filter((x) => reagentReactions.has(x)));
    });
  }

  // Apply filters to reactions
  if (window.appState.excludeSpecialMaterials || window.appState.onlyPracticalReactions) {
    relevantReactionIndices = new Set(
      [...relevantReactionIndices].filter((index) => {
        const reaction = reactions[index];

        // Filter out low-speed reactions
        if (window.appState.onlyPracticalReactions && reaction.reaction_rate <= 5) {
          return false;
        }

        // Filter out reactions with special materials
        if (window.appState.excludeSpecialMaterials) {
          const allMaterials = [
            reaction.input_cell1,
            reaction.input_cell2,
            reaction.input_cell3,
            reaction.output_cell1,
            reaction.output_cell2,
            reaction.output_cell3,
          ].filter(Boolean);

          if (allMaterials.some((id) => specialMaterials.has(id))) {
            return false;
          }
        }

        return true;
      })
    );
  }

  // Get filtered reactions
  return Array.from(relevantReactionIndices)
    .map((index) => reactions[index])
    .sort((a, b) => b.reaction_rate - a.reaction_rate);
};
```

```js
// Utility functions
const getMaterialImageUrl = (id) => {
  if (!id) return "";
  return `https://noita-bartender-images.acidflow.stream/images/materials/Material_${id}.png`;
};

const createNotification = (text, notifID = "share-notification", parentID = "observablehq-main") => {
  const parentElement = document.getElementById(parentID);
  if (!parentElement || document.getElementById(notifID)) return;

  const notification = document.createElement("p");
  notification.id = notifID;
  notification.textContent = text;
  notification.classList.add("notification");
  parentElement.appendChild(notification);

  setTimeout(() => (notification.style.opacity = 1), 100);
  setTimeout(() => {
    notification.style.opacity = 0;
    setTimeout(() => parentElement.removeChild(notification), 500);
  }, 2500);
};

// Add notification styles
const notificationStyle = document.createElement("style");
notificationStyle.textContent = `
  .notification {
    position: fixed; z-index: 9999; inset: 5% 0 0 50%; translate: -50% 0;
    width: max-content; height: max-content;
    background-color: oklch(39.3% 0.095 152.535); border-radius: 1rem; padding: 1rem;
    font-weight: bold; font-size: large; color: oklch(92.5% 0.084 155.995);
    font-family: -apple-system, BlinkMacSystemFont, "avenir next", avenir, helvetica, "helvetica neue", ubuntu, roboto, noto, "segoe ui", arial, sans-serif;
    transition: opacity 500ms; opacity: 0; animation: slideInDown 500ms ease-out; user-select: none;
  }
  @keyframes slideInDown {
    0% { transform: translateY(-100%); opacity: 0; }
    100% { transform: translateY(0); opacity: 1; }
  }
`;
document.head.appendChild(notificationStyle);
```

```js
// Share button
const shareButton = Inputs.button(
  htl.html`<img src="https://noita-bartender-images.acidflow.stream/images/icons/copy.svg" />Share`,
  {
    value: null,
    reduce: () => {
      const url = new URL(window.location.href);
      url.search = "";

      if (window.appState.selectedReagents.length > 0) {
        url.searchParams.set("reagents", window.appState.selectedReagents.join(","));
      }
      if (window.appState.selectedProduct) {
        url.searchParams.set("product", window.appState.selectedProduct);
      }
      if (window.appState.excludeSpecialMaterials) {
        url.searchParams.set("excludeSpecial", "true");
      }
      if (window.appState.onlyPracticalReactions) {
        url.searchParams.set("onlyPractical", "true");
      }

      const shareUrl = url.toString();
      navigator.clipboard
        .writeText(shareUrl)
        .then(() => createNotification("URL copied to clipboard"))
        .catch(() => {
          const textArea = document.createElement("textarea");
          textArea.value = shareUrl;
          document.body.appendChild(textArea);
          textArea.select();
          document.execCommand("copy");
          document.body.removeChild(textArea);
          createNotification("URL copied to clipboard");
        });

      return shareUrl;
    },
  }
);

// Filter toggles
const excludeSpecialToggle = Inputs.toggle({
  label: "Exclude Mimicium, Alchemic Precursor, Draught Of Midas",
  value: window.appState.excludeSpecialMaterials,
});

const onlyPracticalToggle = Inputs.toggle({
  label: "Show only practical reactions (reaction speed higher than 5)",
  value: window.appState.onlyPracticalReactions,
});
```

```js
// Reset button
const resetButton = Inputs.button(
  htl.html`<img src="https://noita-bartender-images.acidflow.stream/images/icons/arrow-counterclockwise.svg" />Reset`,
  {
    reduce: () => {
      window.appState.isResetting = true;

      const url = new URL(window.location.href);
      url.search = "";
      window.history.replaceState({}, "", url.toString());

      window.appState.selectedReagents = [];
      window.appState.selectedProduct = "";
      window.appState.excludeSpecialMaterials = false;
      window.appState.onlyPracticalReactions = false;

      if (window.appState.reagentChoices?.initialised) {
        window.appState.reagentChoices.removeActiveItems();
      }
      if (window.appState.productChoices?.initialised) {
        window.appState.productChoices.removeActiveItems();
      }

      // Reset toggle states
      excludeSpecialToggle.value = false;
      onlyPracticalToggle.value = false;

      updateChoicesOptions();
      updateUI();
      window.appState.isResetting = false;
      return null;
    },
  }
);
```

```js
// Responsive row count logic
const getRowCount = (width) => {
  if (width > 1400) return 33;
  if (width > 1170) return 13;
  if (width > 768) return 13;
  return 10;
};
const isBigScreen = getRowCount(width);
```

```js
// Material cell formatter
const formatMaterialCell = (id) => {
  if (!id) return htl.html`<div></div>`;

  const material = materialsMap.get(id);
  const name = material ? material.name : id;
  const type = material ? (material.type || "").toLowerCase() : "";
  const wikiUrl = material?.wikipage ? `https://noita.wiki.gg/wiki/${encodeURIComponent(material.wikipage)}` : "";
  const imageUrl = getMaterialImageUrl(id);

  const materialNameContent = wikiUrl
    ? htl.html`<a href="${wikiUrl}" target="_blank">
        <span class="material-name-text">${name}</span>
        <span class="material-name-text"><br />(</span><span class="material-type-${type}"><code>${id}</code></span><span class="material-name-text">)</span>
      </a>`
    : htl.html`<span class="material-name-text">${name}</span> <span class="material-name-text"><br />(</span><span class="material-type-${type}"><code>${id}</code></span><span class="material-name-text">)</span>`;

  return htl.html`<div class="material" style="display: flex; align-items: center; height: 30px; padding: 2px 0;">
    ${
      imageUrl
        ? htl.html`<div class="material-image" style="height: 48px; margin-right: 5px; flex-shrink: 0;">
          <img src="${imageUrl}" alt="${name}" style="width: 100%; height: 100%; object-fit: contain; image-rendering: pixelated;" onerror="this.style.display='none'" />
        </div>`
        : htl.html`<div style="width:48px; height:48px; margin-right:5px; flex-shrink:0; border:1px dashed #ccc; font-size:9px; display:flex; align-items:center; justify-content:center; color: #ccc;">N/I</div>`
    }
    <span class="material-name" style="white-space: normal; line-height: 1.2;">${materialNameContent}</span>
  </div>`;
};

// Table options
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
  format: {
    input_cell1: formatMaterialCell,
    input_cell2: formatMaterialCell,
    input_cell3: formatMaterialCell,
    output_cell1: formatMaterialCell,
    output_cell2: formatMaterialCell,
    output_cell3: formatMaterialCell,
  },
};
```

```js
// Update functions
const updateChoicesOptions = () => {
  const availableReagents = getAvailableReagents(window.appState.selectedReagents, window.appState.selectedProduct);
  const availableProducts = getAvailableProducts(window.appState.selectedReagents);

  if (window.appState.reagentChoices?.initialised) {
    window.appState.reagentChoices.clearStore();
    window.appState.reagentChoices.setChoices(availableReagents, "value", "label", true);
    window.appState.selectedReagents.forEach((value) => {
      if (availableReagents.some((r) => r.value === value)) {
        window.appState.reagentChoices.setChoiceByValue(value);
      }
    });
  }

  if (window.appState.productChoices?.initialised) {
    window.appState.productChoices.clearStore();
    window.appState.productChoices.setChoices(availableProducts, "value", "label", true);
    if (window.appState.selectedProduct && availableProducts.some((p) => p.value === window.appState.selectedProduct)) {
      window.appState.productChoices.setChoiceByValue(window.appState.selectedProduct);
    }
  }
};

const updateUI = () => {
  const filteredReactions = getFilteredReactions(window.appState.selectedReagents, window.appState.selectedProduct);

  const tableContainer = document.getElementById("tableContainer");
  if (tableContainer) {
    const newTable = Inputs.table(filteredReactions, baseTableOptions);
    tableContainer.innerHTML = "";
    tableContainer.appendChild(newTable);
  }

  const reactionsCountContainer = document.getElementById("reactionsCount");
  if (reactionsCountContainer) {
    reactionsCountContainer.innerHTML = `Reactions found: <code class="bigger-number-better">${filteredReactions.length}</code>`;
  }

  if (!window.appState.isResetting) {
    const url = new URL(window.location.href);
    url.search = "";
    if (window.appState.selectedReagents.length > 0) {
      url.searchParams.set("reagents", window.appState.selectedReagents.join(","));
    }
    if (window.appState.selectedProduct) {
      url.searchParams.set("product", window.appState.selectedProduct);
    }
    if (window.appState.excludeSpecialMaterials) {
      url.searchParams.set("excludeSpecial", "true");
    }
    if (window.appState.onlyPracticalReactions) {
      url.searchParams.set("onlyPractical", "true");
    }
    window.history.replaceState({}, "", url.toString());
  }
};
```

```js
// Initialize choices
{
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

      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Element ${id} not found within ${timeout}ms`));
      }, timeout);
    });
  };

  const initializeApp = async () => {
    try {
      const [reagentSelectorElement, productSelectorElement] = await Promise.all([
        waitForElement("choicesSelector"),
        waitForElement("productChoicesSelector"),
      ]);

      if (reagentSelectorElement.classList.contains("choices__input")) return;

      const createChoicesTemplates = (strToEl) => ({
        choice: ({ classNames }, data) => {
          if (!data)
            return strToEl(
              `<div class="${classNames.item} ${classNames.itemChoice} ${classNames.itemSelectable}">Invalid Data</div>`
            );

          const imageUrl = getMaterialImageUrl(data.value || "");
          const nameForDisplay = data.name || (data.label ? data.label.split(" (")[0] : data.value || "Unknown");
          const typeForDisplay = (data.type || "").toLowerCase();
          const safeValue = data.value || "";
          const safeId = data.id || "";

          return strToEl(`<div class="${classNames.item} ${classNames.itemChoice} ${classNames.itemSelectable}" data-choice data-choice-selectable data-id="${safeId}" data-value="${safeValue}" role="option">
            <img src="${imageUrl}" style="height: 24px; display: inline-block; vertical-align: middle; margin-right: 8px;" alt="${nameForDisplay}" />
            <span class="material-name-text">${nameForDisplay}</span>
            (<span class="material-type-${typeForDisplay}">${safeValue}</span>)
          </div>`);
        },
        item: ({ classNames }, data) => {
          if (!data) return strToEl(`<div class="${classNames.item}">Invalid Data</div>`);

          const imageUrl = getMaterialImageUrl(data.value || "");
          const nameForDisplay = data.name || (data.label ? data.label.split(" (")[0] : data.value || "Unknown");
          const typeForDisplay = (data.type || "").toLowerCase();
          const safeValue = data.value || "";
          const safeId = data.id || "";

          return strToEl(`<div class="${classNames.item}" data-item data-id="${safeId}" data-value="${safeValue}" aria-selected="true" role="option" data-deletable>
            <img src="${imageUrl}" style="height: 24px; display: inline-block; vertical-align: middle; margin: 8px;" alt="${nameForDisplay}" />
            <span class="material-name-text">${nameForDisplay}</span>
            (<span class="material-type-${typeForDisplay}"><code>${safeValue}</code></span>)
            <button type="button" class="${classNames.button}" aria-label="Remove item: ${nameForDisplay}" data-button>Remove item</button>
          </div>`);
        },
      });

      // Initialize reagent choices
      window.appState.reagentChoices = new Choices(reagentSelectorElement, {
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

      // Initialize product choices
      window.appState.productChoices = new Choices(productSelectorElement, {
        silent: false,
        maxItemCount: 1,
        allowHTML: true,
        placeholder: true,
        placeholderValue: "Search Products",
        removeItemButton: true,
        choices: getAvailableProducts(window.appState.selectedReagents),
        searchEnabled: true,
        renderSelectedChoices: "always",
        maxItemText: () => "You can only search for one product at a time",
        callbackOnCreateTemplates: createChoicesTemplates,
      });

      // Debounced update function
      let updateTimeout;
      const debouncedUpdate = () => {
        clearTimeout(updateTimeout);
        updateTimeout = setTimeout(() => {
          updateChoicesOptions();
          updateUI();
        }, 100);
      };

      // Event handlers
      reagentSelectorElement.addEventListener("change", () => {
        if (window.appState.reagentChoices?.initialised && !window.appState.isResetting) {
          window.appState.selectedReagents = window.appState.reagentChoices.getValue(true);
          debouncedUpdate();
        }
      });

      productSelectorElement.addEventListener("change", () => {
        if (window.appState.productChoices?.initialised && !window.appState.isResetting) {
          const selectedValues = window.appState.productChoices.getValue(true);
          window.appState.selectedProduct =
            Array.isArray(selectedValues) && selectedValues.length > 0 ? selectedValues[0] : "";
          debouncedUpdate();
        }
      });

      // Toggle event handlers
      excludeSpecialToggle.addEventListener("input", () => {
        window.appState.excludeSpecialMaterials = excludeSpecialToggle.value;

        // Clear conflicting selections when filter is enabled
        if (window.appState.excludeSpecialMaterials) {
          // Remove special materials from selected reagents
          window.appState.selectedReagents = window.appState.selectedReagents.filter(
            (reagent) => !specialMaterials.has(reagent)
          );

          // Clear selected product if it's a special material
          if (specialMaterials.has(window.appState.selectedProduct)) {
            window.appState.selectedProduct = "";
          }

          // Update the UI selectors
          if (window.appState.reagentChoices?.initialised) {
            window.appState.reagentChoices.removeActiveItems();
            window.appState.selectedReagents.forEach((value) => {
              window.appState.reagentChoices.setChoiceByValue(value);
            });
          }

          if (window.appState.productChoices?.initialised) {
            window.appState.productChoices.removeActiveItems();
            if (window.appState.selectedProduct) {
              window.appState.productChoices.setChoiceByValue(window.appState.selectedProduct);
            }
          }
        }

        debouncedUpdate();
      });

      onlyPracticalToggle.addEventListener("input", () => {
        window.appState.onlyPracticalReactions = onlyPracticalToggle.value;
        debouncedUpdate();
      });

      // Initial state setup and UI update
      // Set toggle values from URL parameters
      excludeSpecialToggle.value = window.appState.excludeSpecialMaterials;
      onlyPracticalToggle.value = window.appState.onlyPracticalReactions;

      if (
        window.appState.selectedReagents.length > 0 ||
        window.appState.selectedProduct ||
        window.appState.excludeSpecialMaterials ||
        window.appState.onlyPracticalReactions
      ) {
        requestAnimationFrame(() => {
          updateChoicesOptions();
          updateUI();
        });
      } else {
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

<div class="grid grid-cols-4 gap-1" style="margin-bottom: 1rem; width: 100%; box-sizing: border-box;">
  <div class="card grid-colspan-2" style="width: 100%; max-width: 100%; overflow: hidden; box-sizing: border-box;">
    <select id="choicesSelector" multiple></select>
  </div>
  <div class="card grid-colspan-1" style="width: 100%; max-width: 100%; overflow: hidden; box-sizing: border-box;">
    <select id="productChoicesSelector" multiple></select>
  </div>
  <div class="card grid-colspan-1" style="width: 100%; max-width: 100%; overflow: hidden; box-sizing: border-box; font-size: 0.9rem;"><h2 id="reactionsCount" style="margin: 0; font-size: 0.9rem;">Reactions found: <code class="bigger-number-better">5589</code></h2></div>
</div>
<div class="grid grid-cols-4 gap-1" style="width: 100%; box-sizing: border-box;">
  <div class="card grid-colspan-1" style="width: 100%; max-width: 100%; overflow: hidden; box-sizing: border-box;">${resetButton}</div>
  <div class="card grid-colspan-1" style="width: 100%; max-width: 100%; overflow: hidden; box-sizing: border-box;">${shareButton}</div>
  <div class="card grid-colspan-1" style="width: 100%; max-width: 100%; overflow: hidden; box-sizing: border-box;">${excludeSpecialToggle}</div>
  <div class="card grid-colspan-1" style="width: 100%; max-width: 100%; overflow: hidden; box-sizing: border-box;">${onlyPracticalToggle}</div>
</div>
<div class="grid grid-cols-1 grid-rowspan-1" style="grid-auto-rows: auto">
  <div class="card grid-colspan-1 grid-rowspan-1" style="padding: 0" id="tableContainer"></div>
</div>
