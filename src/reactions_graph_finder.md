---
title: "Reactions Finder"
draft: false
---

<!-- TODO
  
  Double click behaviour -> change filter
  Right click -> link to wiki + more info

  --- maybe ---

  display sub graph

 -->

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
<script src="https://d3js.org/d3.v7.min.js"></script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/choices.js/public/assets/styles/choices.min.css"/>
<link href="custom.css" rel="stylesheet"></link>

<h1 id="acidTitle" class="bartender-heading-decrypted">Reactions Graph</h1>

```js
import { initializeTitleAnimation } from "./components/titleAnimation.js";
initializeTitleAnimation();
```

```js
// Load data
const materials = await FileAttachment("./data/FULL_MATERIALS_FINAL.json").json();
const reactions = await FileAttachment("./data/reactions_from_materials.json").json();
const materialAssociations = await FileAttachment("./data/jsons/material_associations.json").json();

// Create mapping from tags to materials
const tagToMaterialsMap = new Map();
materialAssociations.forEach(assoc => {
  if (!tagToMaterialsMap.has(assoc.tag)) {
    tagToMaterialsMap.set(assoc.tag, []);
  }
  tagToMaterialsMap.get(assoc.tag).push(assoc.id);
});

// Helper function to resolve tags to material IDs
const resolveTag = (identifier) => {
  if (identifier && identifier.startsWith('[') && identifier.endsWith(']')) {
    const tag = identifier.slice(1, -1);
    return tagToMaterialsMap.get(tag) || [];
  }
  return [identifier];
};

// Helper function to check if an identifier is a tag
const isTag = (identifier) => {
  return identifier && identifier.startsWith('[') && identifier.endsWith(']');
};

const materialsMap = new Map(materials.map((m) => [m.id, m]));

// Build indexes for faster filtering - now including tags
const reactionInputsIndex = new Map();
const reactionOutputsIndex = new Map();

reactions.forEach((reaction, index) => {
  // Index inputs (including tags)
  [reaction.reagent1, reaction.reagent2, reaction.reagent3].filter(Boolean).forEach((input) => {
    const resolvedInputs = resolveTag(input);
    resolvedInputs.forEach(resolvedInput => {
      if (!reactionInputsIndex.has(resolvedInput)) {
        reactionInputsIndex.set(resolvedInput, []);
      }
      reactionInputsIndex.get(resolvedInput).push(index);
    });
  });

  // Index outputs (including tags)
  [reaction.product1, reaction.product2, reaction.product3].filter(Boolean).forEach((output) => {
    const resolvedOutputs = resolveTag(output);
    resolvedOutputs.forEach(resolvedOutput => {
      if (!reactionOutputsIndex.has(resolvedOutput)) {
        reactionOutputsIndex.set(resolvedOutput, []);
      }
      reactionOutputsIndex.get(resolvedOutput).push(index);
    });
  });
});
```

```js
// Global state - add visibility state for tag materials
window.appState = {
  selectedReagents: [],
  selectedProduct: "",
  reagentChoices: null,
  productChoices: null,
  isResetting: false,
  excludeSpecialMaterials: true,
  onlyPracticalReactions: true,
  excludeCatalysts: true,
  visibleTagMaterials: new Set(), // Track which tag materials are visible
};

// Parse URL parameters
const urlParams = new URLSearchParams(window.location.search);
window.appState.selectedReagents = urlParams.get("reagents")?.split(",").filter(Boolean) || [];
window.appState.selectedProduct = urlParams.get("product") || "";
window.appState.excludeSpecialMaterials = urlParams.get("excludeSpecial") !== "false";
window.appState.onlyPracticalReactions = urlParams.get("onlyPractical") !== "false";
```

```js
// Special materials to exclude
const specialMaterials = new Set(["mimic_liquid", "midas_precursor", "midas", "magic_gas_midas", "corruption_static"]);

const EventBus = {
  events: {},
  on(event, handler) {
    (this.events[event] ||= []).push(handler);
  },
  emit(event, payload) {
    (this.events[event] || []).forEach((fn) => fn(payload));
  }
};

// Optimized functions using indexes - now handling tags
// REMOVE the getFilteredReactions call from getAvailableReagents
const getAvailableReagents = (selectedReagents = [], selectedProduct = "") => {
  if (!selectedProduct && selectedReagents.length === 0) {
    // Return all materials that appear as inputs in reactions (excluding tags)
    let availableIds = Array.from(reactionInputsIndex.keys()).filter(id => !isTag(id));

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
        if (window.appState.onlyPracticalReactions && reaction.reactionRate <= 5) {
          return false;
        }

        // Filter out reactions with special materials
        if (window.appState.excludeSpecialMaterials) {
          const allReagents = [reaction.reagent1, reaction.reagent2, reaction.reagent3].filter(Boolean);
          const allProducts = [reaction.product1, reaction.product2, reaction.product3].filter(Boolean);
          
          // Resolve all materials (including tags)
          const allMaterials = [
            ...allReagents.flatMap(resolveTag),
            ...allProducts.flatMap(resolveTag)
          ];

          if (allMaterials.some((id) => specialMaterials.has(id))) {
            return false;
          }
        }

        return true;
      })
    );
  }

  // Collect all input materials from relevant reactions (excluding tags)
  const availableReagentIds = new Set();
  relevantReactionIndices.forEach((index) => {
    const reaction = reactions[index];
    [reaction.reagent1, reaction.reagent2, reaction.reagent3]
      .filter(Boolean)
      .flatMap(resolveTag)
      .forEach((id) => availableReagentIds.add(id));
  });

  return Array.from(availableReagentIds)
    .filter(id => !isTag(id)) // Exclude tags from selection
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

// Similarly fix getAvailableProducts to avoid circular dependencies
const getAvailableProducts = (selectedReagents = []) => {
  if (selectedReagents.length === 0) {
    // Return all products from all reactions (excluding tags)
    let availableIds = Array.from(reactionOutputsIndex.keys()).filter(id => !isTag(id));

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
        if (window.appState.onlyPracticalReactions && reaction.reactionRate <= 5) {
          return false;
        }

        // Filter out reactions with special materials
        if (window.appState.excludeSpecialMaterials) {
          const allReagents = [reaction.reagent1, reaction.reagent2, reaction.reagent3].filter(Boolean);
          const allProducts = [reaction.product1, reaction.product2, reaction.product3].filter(Boolean);
          
          const allMaterials = [
            ...allReagents.flatMap(resolveTag),
            ...allProducts.flatMap(resolveTag)
          ];

          if (allMaterials.some((id) => specialMaterials.has(id))) {
            return false;
          }
        }

        return true;
      })
    );
  }

  // Collect all output materials from relevant reactions (excluding tags)
  const availableProductIds = new Set();
  relevantReactionIndices.forEach((index) => {
    const reaction = reactions[index];
    [reaction.product1, reaction.product2, reaction.product3]
      .filter(Boolean)
      .flatMap(resolveTag)
      .forEach((id) => availableProductIds.add(id));
  });

  return Array.from(availableProductIds)
    .filter(id => !isTag(id)) // Exclude tags from selection
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
        if (window.appState.onlyPracticalReactions && reaction.reactionRate <= 5) {
          return false;
        }

        // Filter out reactions with special materials
        if (window.appState.excludeSpecialMaterials) {
          const allReagents = [reaction.reagent1, reaction.reagent2, reaction.reagent3].filter(Boolean);
          const allProducts = [reaction.product1, reaction.product2, reaction.product3].filter(Boolean);
          
          const allMaterials = [
            ...allReagents.flatMap(resolveTag),
            ...allProducts.flatMap(resolveTag)
          ];

          if (allMaterials.some((id) => specialMaterials.has(id))) {
            return false;
          }
        }

        return true;
      })
    );
  }

  if (window.appState.excludeCatalysts && window.appState.selectedProduct) {
    relevantReactionIndices = new Set(
      [...relevantReactionIndices].filter((index) => {
        const r = reactions[index];
        const outputs = [r.product1, r.product2, r.product3].filter(Boolean).flatMap(resolveTag);
        const inputs = [r.reagent1, r.reagent2, r.reagent3].filter(Boolean).flatMap(resolveTag);

        const isCatalyst = outputs.includes(window.appState.selectedProduct) &&
                          inputs.includes(window.appState.selectedProduct);

        return !isCatalyst;
      })
    );
  }

  // Get filtered reactions
  return Array.from(relevantReactionIndices)
    .map((index) => reactions[index])
    .sort((a, b) => b.reactionRate - a.reactionRate);
};
```

```js
// Utility functions - add tag detection
const getMaterialImageUrl = (id) => {
  if (!id) return "";
  if (isTag(id)) {
    return `https://noita-bartender-images.acidflow.stream/images/icons/tag.svg`;
  }
  return `https://noita-bartender-images.acidflow.stream/images/materials/Material_${id}.png`;
};

const getMaterialName = (id) => {
  if (isTag(id)) {
    return `[${id.slice(1, -1)}]`;
  }
  const material = materialsMap.get(id);
  return material ? material.name : id;
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
  label: "Exclude generic reaction : Midas, Mimicium, Corrupted Rock",
  value: window.appState.excludeSpecialMaterials,
});

const onlyPracticalToggle = Inputs.toggle({
  label: "Show only practical reactions (reaction speed higher than 5)",
  value: window.appState.onlyPracticalReactions,
});

const excludeCatalystToggle = Inputs.toggle({
  label: "Hide reactions where product is only a catalyst",
  value: window.appState.excludeCatalysts,
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

      window.appState.visibleTagMaterials.clear();
      window.appState.selectedReagents = [];
      window.appState.selectedProduct = "";
      window.appState.excludeSpecialMaterials = true;
      window.appState.onlyPracticalReactions = true;

      if (window.appState.reagentChoices?.initialised) {
        window.appState.reagentChoices.removeActiveItems();
      }
      if (window.appState.productChoices?.initialised) {
        window.appState.productChoices.removeActiveItems();
      }

      // Reset toggle states
      excludeSpecialToggle.value = true;
      onlyPracticalToggle.value = true;

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
// Simple and clean graph configuration - add tag node config
const graphStyleConfig = {
  colors: {
    reactionNode: "#ff6b6b",
    materialNodeDefault: "#505050",
    materialNodeOutput: "#45b7d1",

    tagNode: "#ffa500",
    tagVisible: "#24c93a",
    tagHidden: "#ff6b6b",
    selectedHighlight: "#ffff00",
    directMaterialHighlight: "#00ffff",

    inputArrow: "#24c93a",
    outputArrow: "#45b7d1",
    nodeStroke: "#ffffff",
    nodeStrokeHighlight: "#ff6b6b",
    inputHighlight: "#24c93a",
    outputHighlight: "#45b7d1",
    text: "#ffffff",
    textLight: "#ffffff"
  },
  
  sizes: {
    reactionRadius: 15,
    materialRadius: 25,
    tagRadius: 20, // Smaller radius for tags
    strokeWidth: 3,
    strokeWidthHighlight: 5,
    strokeWidthMedium: 4,
    fontSizeSmall: "11px",
    fontSizeMedium: "12px",
    linkDistance: 120,
    chargeStrength: -400
  },

  opacities: {
    default: 1,
    linkDefault: 0.7,
    dimmed: 0.15,
    veryDimmed: 0.05,
    hidden: 0 // For hidden tag materials
  },
  
  animations: {
    duration: 200
  },
  
  layout: {
    heightRatio: 0.6,
    minHeight: 600,
    labelOffsetMaterial: 20,
    labelOffsetReaction: 15,
    imageScale: 2,
    imagePosition: 0.65
  },
  
  constraints: {
    maxReactions: 350,
    maxNameLength: 30,
    truncatedNameLength: 20
  }
};

// Graph visualization with D3.js - updated for tags
const renderGraph = (filteredReactions) => {
  const container = document.getElementById("tableContainer");
  container.innerHTML = "";
  
  if (filteredReactions.length === 0) {
    container.innerHTML = `<div style="text-align: center; padding: 2rem; color: ${graphStyleConfig.colors.textLight};">No reactions found with current filters</div>`;
    return;
  }

  if (filteredReactions.length >= graphStyleConfig.constraints.maxReactions) {
    container.innerHTML = `<div style="text-align: center; padding: 2rem; color: ${graphStyleConfig.colors.textLight};">Too many reactions with current filters</div>`;
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.style.width = "100%";
  wrapper.style.height = "100%";
  wrapper.style.overflow = "hidden";
  wrapper.style.position = "relative";
  container.appendChild(wrapper);
  
  const width = container.clientWidth;
  const height = Math.max(
    graphStyleConfig.layout.minHeight, 
    width * graphStyleConfig.layout.heightRatio
  );
  
  // Create SVG with a group for the zoomable content
  const svg = d3.select(wrapper)
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height])
    .attr("preserveAspectRatio", "none")
    .style("position", "absolute")
    .style("left", 0)
    .style("top", 0);
  
  // Create a group for all zoomable content
  const g = svg.append("g");
  
  // Create a force-directed graph
  const nodes = new Map();
  const links = [];
  
  // Process reactions to create nodes and links with tags
  filteredReactions.forEach((reaction, index) => {
    const reactionId = `reaction_${index}`;
    
    // Add reaction node
    nodes.set(reactionId, {
      id: reactionId,
      type: "reaction",
      reaction: reaction,
      radius: graphStyleConfig.sizes.reactionRadius,
      color: graphStyleConfig.colors.reactionNode
    });
    
    // Process inputs (including tags)
    [reaction.reagent1, reaction.reagent2, reaction.reagent3]
      .filter(Boolean)
      .forEach((inputId, inputIndex) => {
        if (isTag(inputId)) {
          // Handle tag node
          if (!nodes.has(inputId)) {
            nodes.set(inputId, {
              id: inputId,
              type: "tag",
              tag: inputId.slice(1, -1),
              radius: graphStyleConfig.sizes.tagRadius,
              color: graphStyleConfig.colors.tagNode,
              imageUrl: getMaterialImageUrl(inputId),
              name: getMaterialName(inputId)
            });
          }
          
          links.push({
            source: inputId,
            target: reactionId,
            type: "input",
            index: inputIndex
          });
          
          // Add connections from tag to all associated materials
          const materialIds = resolveTag(inputId);
          materialIds.forEach(materialId => {
            if (!nodes.has(materialId)) {
              const material = materialsMap.get(materialId);
              const imageUrl = getMaterialImageUrl(materialId);
              nodes.set(materialId, {
                id: materialId,
                type: "material",
                material: material,
                radius: graphStyleConfig.sizes.materialRadius,
                color: material?.color || graphStyleConfig.colors.materialNodeDefault,
                imageUrl: imageUrl,
                name: material?.name || materialId,
                isTagMaterial: true,
                parentTag: inputId
              });
            }
            
            links.push({
              source: materialId,
              target: inputId,
              type: "tag-association",
              index: inputIndex
            });
          });
        } else {
          // Handle regular material
          if (!nodes.has(inputId)) {
            const material = materialsMap.get(inputId);
            const imageUrl = getMaterialImageUrl(inputId);
            nodes.set(inputId, {
              id: inputId,
              type: "material",
              material: material,
              radius: graphStyleConfig.sizes.materialRadius,
              color: material?.color || graphStyleConfig.colors.materialNodeDefault,
              imageUrl: imageUrl,
              name: material?.name || inputId,
              isTagMaterial: false
            });
          }
          
          links.push({
            source: inputId,
            target: reactionId,
            type: "input",
            index: inputIndex
          });
        }
      });
    
    // Process outputs (including tags)
    [reaction.product1, reaction.product2, reaction.product3]
      .filter(Boolean)
      .forEach((outputId, outputIndex) => {
        if (isTag(outputId)) {
          // Handle tag node
          if (!nodes.has(outputId)) {
            nodes.set(outputId, {
              id: outputId,
              type: "tag",
              tag: outputId.slice(1, -1),
              radius: graphStyleConfig.sizes.tagRadius,
              color: graphStyleConfig.colors.tagNode,
              imageUrl: getMaterialImageUrl(outputId),
              name: getMaterialName(outputId)
            });
          }
          
          links.push({
            source: reactionId,
            target: outputId,
            type: "output",
            index: outputIndex
          });
          
          // Add connections from tag to all associated materials
          const materialIds = resolveTag(outputId);
          materialIds.forEach(materialId => {
            if (!nodes.has(materialId)) {
              const material = materialsMap.get(materialId);
              const imageUrl = getMaterialImageUrl(materialId);
              nodes.set(materialId, {
                id: materialId,
                type: "material",
                material: material,
                radius: graphStyleConfig.sizes.materialRadius,
                color: material?.color || graphStyleConfig.colors.materialNodeOutput,
                imageUrl: imageUrl,
                name: material?.name || materialId,
                isTagMaterial: true,
                parentTag: outputId
              });
            }
            
            links.push({
              source: outputId,
              target: materialId,
              type: "tag-association",
              index: outputIndex
            });
          });
        } else {
          // Handle regular material
          if (!nodes.has(outputId)) {
            const material = materialsMap.get(outputId);
            const imageUrl = getMaterialImageUrl(outputId);
            nodes.set(outputId, {
              id: outputId,
              type: "material",
              material: material,
              radius: graphStyleConfig.sizes.materialRadius,
              color: material?.color || graphStyleConfig.colors.materialNodeOutput,
              imageUrl: imageUrl,
              name: material?.name || outputId,
              isTagMaterial: false
            });
          }
          
          links.push({
            source: reactionId,
            target: outputId,
            type: "output",
            index: outputIndex
          });
        }
      });
  });
  
  const nodeArray = Array.from(nodes.values());
  const linkArray = links.map(link => ({
    ...link,
    source: nodes.get(link.source),
    target: nodes.get(link.target)
  }));
  
// Add a function to check if a material is directly involved in any reaction
const isMaterialDirectlyInvolved = (materialId) => {
  return linkArray.some(link => 
    (link.source.id === materialId && link.target.type === "reaction" && link.type === "input") ||
    (link.target.id === materialId && link.source.type === "reaction" && link.type === "output")
  );
};

// Update the node filtering to use the helper function
const visibleNodes = nodeArray.filter(node => {
  // Always show selected reagents and products
  if (window.appState.selectedReagents.includes(node.id) || 
      window.appState.selectedProduct === node.id) {
    return true;
  }
  
  // Always show materials that are directly involved in reactions
  if (node.type === "material" && isMaterialDirectlyInvolved(node.id)) {
    return true; // Override tag visibility for direct materials
  }
  
  // Always show tags
  if (node.type === "tag") {
    return true;
  }
  
  // Always show reactions
  if (node.type === "reaction") {
    return true;
  }
  
  // For tag materials that are not directly involved, respect the visibility setting
  if (node.type === "material" && node.isTagMaterial) {
    return window.appState.visibleTagMaterials.has(node.id);
  }
  
  return true;
});
  
  const visibleLinks = linkArray.filter(link => {
    const sourceVisible = visibleNodes.includes(link.source);
    const targetVisible = visibleNodes.includes(link.target);
    return sourceVisible && targetVisible;
  });
  
  // Create simulation with visible nodes only
  const simulation = d3.forceSimulation(visibleNodes)
    .force("link", d3.forceLink(visibleLinks).id(d => d.id).distance(graphStyleConfig.sizes.linkDistance))
    .force("charge", d3.forceManyBody().strength(graphStyleConfig.sizes.chargeStrength))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collision", d3.forceCollide().radius(d => d.radius + 15));
  
  // Create arrow markers
  const defs = svg.append("defs");

  defs.append("marker")
    .attr("id", "arrow-input")
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", d => graphStyleConfig.sizes.materialRadius)
    .attr("refY", 0)
    .attr("markerWidth", 8)
    .attr("markerHeight", 8)
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M0,-5L10,0L0,5")
    .attr("fill", graphStyleConfig.colors.inputArrow);
  
  defs.append("marker")
    .attr("id", "arrow-output")
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", d => graphStyleConfig.sizes.materialRadius)
    .attr("refY", 0)
    .attr("markerWidth", 8)
    .attr("markerHeight", 8)
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M0,-5L10,0L0,5")
    .attr("fill", graphStyleConfig.colors.outputArrow);
  
  // Create link groups
  const linkGroups = g.append("g")
    .attr("class", "links")
    .selectAll("g")
    .data(visibleLinks)
    .join("g")
    .attr("class", d => `link-group ${d.type}-link`)
    .style("opacity", d => {
      if (d.type === "tag-association") return graphStyleConfig.opacities.dimmed;
      return graphStyleConfig.opacities.linkDefault;
    });
  
  // Add lines to each link group
  const link = linkGroups.append("line")
    .attr("stroke", d => {
      if (d.type === "input") return graphStyleConfig.colors.inputArrow;
      if (d.type === "output") return graphStyleConfig.colors.outputArrow;
      if (d.type === "tag-association") return graphStyleConfig.colors.tagNode;
      return "#ccc";
    })
    .attr("stroke-width", d => {
      if (d.type === "tag-association") return graphStyleConfig.sizes.strokeWidth - 1;
      return graphStyleConfig.sizes.strokeWidth;
    })
    .attr("stroke-dasharray", d => d.type === "input" ? "5,5" : null)
    .attr("marker-end", d => {
      if (d.type === "input") return "url(#arrow-input)";
      if (d.type === "output") return "url(#arrow-output)";
      return null;
    });
  
  // Create nodes group
  const node = g.append("g")
    .selectAll("g")
    .data(visibleNodes)
    .join("g")
    .attr("class", d => `node ${d.type}-node`)
    .call(d3.drag()
      .on("start", dragstarted)
      .on("drag", dragged)
      .on("end", dragended));
  
  // Create clip paths for circular images (only for material nodes)
  node.filter(d => d.type === "material")
    .append("clipPath")
    .attr("id", d => `clip-${d.id}`)
    .append("circle")
    .attr("r", d => d.radius);
  
// Update material highlight to properly identify direct materials
node.filter(d => d.type === "material")
  .append("circle")
  .attr("r", d => d.radius + 4)
  .attr("fill", "transparent")
  .attr("stroke", d => {
    // Check if material is directly involved in any reaction as input or output
    const isDirectMaterial = linkArray.some(link => 
      (link.source.id === d.id && link.target.type === "reaction" && link.type === "input") ||
      (link.target.id === d.id && link.source.type === "reaction" && link.type === "output")
    );
    
    if (window.appState.selectedReagents.includes(d.id) || 
        window.appState.selectedProduct === d.id) {
      return graphStyleConfig.colors.selectedHighlight;
    }
    
    if (isDirectMaterial) {
      return graphStyleConfig.colors.directMaterialHighlight;
    }
    
    return "transparent";
  })
  .attr("stroke-width", 2)
  .attr("class", "material-highlight")
  .style("opacity", d => {
    const isDirectMaterial = linkArray.some(link => 
      (link.source.id === d.id && link.target.type === "reaction" && link.type === "input") ||
      (link.target.id === d.id && link.source.type === "reaction" && link.type === "output")
    );
    
    if (window.appState.selectedReagents.includes(d.id) || 
        window.appState.selectedProduct === d.id ||
        isDirectMaterial) {
      return 1;
    }
    return 0;
  });

  // Add background circles for material and tag nodes
  node.filter(d => d.type === "material" || d.type === "tag")
    .append("circle")
    .attr("r", d => d.radius)
    .attr("fill", d => d.color)
    .attr("stroke", graphStyleConfig.colors.nodeStroke)
    .attr("stroke-width", graphStyleConfig.sizes.strokeWidth)
    .attr("class", "node-background");
  
  // Add material images
  node.filter(d => d.type === "material")
    .append("g")
    .attr("clip-path", d => `url(#clip-${d.id})`)
    .append("image")
    .attr("href", d => d.imageUrl)
    .attr("x", d => -d.radius * graphStyleConfig.layout.imagePosition)
    .attr("y", d => -d.radius * graphStyleConfig.layout.imagePosition)
    .attr("transform", `scale(${graphStyleConfig.layout.imageScale})`)
    .attr("class", "material-image")
    .on("error", function() {
      d3.select(this).style("display", "none");
    });

// Update the tag visual indicators to use images instead of text
node.filter(d => d.type === "tag")
  .append("image")
  .attr("href", d => {
    const materialIds = resolveTag(d.id);
    const hasVisibleMaterials = materialIds.some(id => window.appState.visibleTagMaterials.has(id));
    return hasVisibleMaterials 
      ? "https://noita-bartender-images.acidflow.stream/images/icons/eye-open.svg"
      : "https://noita-bartender-images.acidflow.stream/images/icons/eye-closed.svg";
  })
  .attr("x", d => -d.radius * 0.5)
  .attr("y", d => -d.radius * 0.5)
  .attr("width", d => d.radius)
  .attr("height", d => d.radius)
  .attr("class", "tag-visibility-icon");

// Update tag border to use config colors
node.filter(d => d.type === "tag")
  .append("circle")
  .attr("r", d => d.radius + 2)
  .attr("fill", "transparent")
  .attr("stroke", d => {
    const materialIds = resolveTag(d.id);
    const hasVisibleMaterials = materialIds.some(id => window.appState.visibleTagMaterials.has(id));
    return hasVisibleMaterials 
      ? graphStyleConfig.colors.tagVisible 
      : graphStyleConfig.colors.tagHidden;
  })
  .attr("stroke-width", 3)
  .attr("stroke-dasharray", "4,2")
  .attr("class", "tag-border");

  // Add labels for all nodes
  node.filter(d => d.type != "reaction")
    .append("text")
    .attr("text-anchor", "middle")
    .attr("dy", d => d.type === "material" ? 
      d.radius + graphStyleConfig.layout.labelOffsetMaterial : 
      d.radius + graphStyleConfig.layout.labelOffsetReaction)
    .attr("font-size", graphStyleConfig.sizes.fontSizeSmall)
    .attr("fill", graphStyleConfig.colors.text)
    .attr("font-weight", "bold")
    .attr("class", "node-label")
    .text(d => {
      const maxLength = graphStyleConfig.constraints.maxNameLength;
      const truncatedLength = graphStyleConfig.constraints.truncatedNameLength;
      const name = d.name || d.id;
      return name.length > maxLength ? 
        name.substring(0, truncatedLength) + "..." : 
        name;
    });
  
  // Add reaction nodes (circles with speed number)
  node.filter(d => d.type === "reaction")
    .append("circle")
    .attr("r", d => d.radius)
    .attr("fill", d => d.color)
    .attr("stroke", graphStyleConfig.colors.nodeStroke)
    .attr("stroke-width", graphStyleConfig.sizes.strokeWidth)
    .attr("class", "reaction-circle");
  
  node.filter(d => d.type === "reaction")
    .append("text")
    .text(d => d.reaction.reactionRate)
    .attr("text-anchor", "middle")
    .attr("dy", 5)
    .attr("font-size", graphStyleConfig.sizes.fontSizeMedium)
    .attr("fill", graphStyleConfig.colors.text)
    .attr("font-weight", "bold")
    .attr("class", "reaction-speed");

  // Add tooltips
  node.append("title")
    .text(d => {
      if (d.type === "material") {
        return `${d.name} (${d.id})`;
      } else if (d.type === "tag") {
        const materials = resolveTag(d.id);
        return `Tag: ${d.tag}\nMaterials: ${materials.join(", ")}`;
      } else {
        const inputs = [d.reaction.reagent1, d.reaction.reagent2, d.reaction.reagent3]
          .filter(Boolean)
          .map(id => getMaterialName(id))
          .join(" + ");
        
        const outputs = [d.reaction.product1, d.reaction.product2, d.reaction.product3]
          .filter(Boolean)
          .map(id => getMaterialName(id))
          .join(" + ");
        
        return `Reaction (Speed: ${d.reaction.reactionRate})\n${inputs} → ${outputs}`;
      }
    });

  // Update tooltip to be more informative
  node.filter(d => d.type === "tag")
    .append("title")
    .text(d => {
      const materialIds = resolveTag(d.id);
      const visibleCount = materialIds.filter(id => window.appState.visibleTagMaterials.has(id)).length;
      const totalCount = materialIds.length;
      const tagName = d.tag;
      
      if (visibleCount === totalCount) {
        return `Tag: [${tagName}]\nAll ${totalCount} materials visible\nDouble-click to hide all`;
      } else if (visibleCount > 0) {
        return `Tag: [${tagName}]\n${visibleCount} of ${totalCount} materials visible\nDouble-click to toggle all`;
      } else {
        return `Tag: [${tagName}]\nAll ${totalCount} materials hidden\nDouble-click to show all`;
      }
    });
  
  // Mouseout event handler
  node.on("mouseout", function(event, d) {
    d3.select(this).select(".node-background, .reaction-circle")
      .transition()
      .duration(graphStyleConfig.animations.duration)
      .attr("stroke-width", graphStyleConfig.sizes.strokeWidth)
      .attr("stroke", graphStyleConfig.colors.nodeStroke);
    
    d3.select(this).select(".node-id-label")
      .transition()
      .duration(graphStyleConfig.animations.duration)
      .style("opacity", 0);
  });
  
  // Click event for background (reset)
  svg.on("click", () => {
    node.style("opacity", graphStyleConfig.opacities.default);
    linkGroups.style("opacity", d => {
      if (d.type === "tag-association") return graphStyleConfig.opacities.dimmed;
      return graphStyleConfig.opacities.linkDefault;
    });
    node.select(".node-background, .reaction-circle")
      .attr("stroke", graphStyleConfig.colors.nodeStroke)
      .attr("stroke-width", graphStyleConfig.sizes.strokeWidth);
  });

// Graph visualization with D3.js - updated for tags
// Update the click handler to highlight tag materials when the tag is highlighted
node.on("click", (event, d) => {
  event.stopPropagation();

  // Double click on tag to toggle visibility of ALL associated materials
  if (event.detail === 2 && d.type === "tag") {
    const materialIds = resolveTag(d.id);
    const allCurrentlyVisible = materialIds.every(id => window.appState.visibleTagMaterials.has(id));
    
    materialIds.forEach(materialId => {
      if (allCurrentlyVisible) {
        window.appState.visibleTagMaterials.delete(materialId);
      } else {
        window.appState.visibleTagMaterials.add(materialId);
      }
    });
    
    EventBus.emit("stateChanged");
    return;
  }

  // Ctrl+Shift+click → wiki (for materials only)
  if (event.shiftKey && event.ctrlKey && d.type === "material") {
    const material = d.material;
    const wikiUrl = material?.wikipage
      ? `https://noita.wiki.gg/wiki/${encodeURIComponent(material.wikipage)}`
      : "";

    if (wikiUrl) {
      window.open(wikiUrl, "_blank");
    } else {
      createNotification("No wiki page found for this material");
    }
    return;
  }

  // Shift+click → reset & select product (for materials only)
  if (!event.ctrlKey && event.shiftKey && d.type === "material") {
    // Use the existing reaction filtering logic instead of calling getFilteredReactions directly
    const testReagents = [];
    const testProduct = d.id;
    
    // Check if there are any reactions using indexes
    const productReactions = reactionOutputsIndex.get(testProduct) || [];
    const hasReactions = productReactions.length > 0;
    
    if (hasReactions) {
      window.appState.selectedReagents = [];
      window.appState.selectedProduct = d.id;
      EventBus.emit("stateChanged");
    } else {
      createNotification("No valid reactions with this product");
    }
    return;
  }

  // Ctrl+click → reset & select reagent (for materials only)
  if (event.ctrlKey && !event.shiftKey && d.type === "material") {
    // Check if there are any reactions using indexes
    const testReagent = d.id;
    const reagentReactions = reactionInputsIndex.get(testReagent) || [];
    const hasReactions = reagentReactions.length > 0;
    
    if (hasReactions) {
      window.appState.selectedReagents = [d.id];
      window.appState.selectedProduct = "";
      EventBus.emit("stateChanged");
    } else {
      createNotification("No valid reactions with this reagent");
    }
    return;
  }
    
  // Reset all highlighting first
  node.style("opacity", graphStyleConfig.opacities.default);
  linkGroups.style("opacity", d => {
    if (d.type === "tag-association") return graphStyleConfig.opacities.dimmed;
    return graphStyleConfig.opacities.linkDefault;
  });
  node.select(".node-background, .reaction-circle")
    .attr("stroke", graphStyleConfig.colors.nodeStroke)
    .attr("stroke-width", graphStyleConfig.sizes.strokeWidth);

  if (d.type === "material" || d.type === "tag") {
    d3.select(event.currentTarget).select(".node-background")
      .attr("stroke", graphStyleConfig.colors.nodeStrokeHighlight)
      .attr("stroke-width", graphStyleConfig.sizes.strokeWidthHighlight);
    
    // Update the tag material highlighting to add a special class for animation
    if (d.type === "tag") {
      const materialIds = resolveTag(d.id);
      materialIds.forEach(materialId => {
        const materialNode = node.filter(n => n.id === materialId);
        materialNode.select(".node-background")
          .attr("stroke", graphStyleConfig.colors.tagVisible)
          .attr("stroke-width", graphStyleConfig.sizes.strokeWidthMedium)
          .classed("tag-material-highlighted", true); // Add special class for animation
      });
    }
    // Find directly connected reactions
    const connectedReactionIds = new Set();
    linkArray.forEach(link => {
      if (link.source.id === d.id && link.target.type === "reaction") {
        connectedReactionIds.add(link.target.id);
      }
      if (link.target.id === d.id && link.source.type === "reaction") {
        connectedReactionIds.add(link.source.id);
      }
    });
    
    // Highlight connected reactions and their materials
    connectedReactionIds.forEach(reactionId => {
      const reactionNode = node.filter(n => n.id === reactionId);
      reactionNode.select(".reaction-circle")
        .attr("stroke", graphStyleConfig.colors.nodeStrokeHighlight)
        .attr("stroke-width", graphStyleConfig.sizes.strokeWidthHighlight);
      
      // Highlight materials connected to these reactions
      linkArray.forEach(link => {
        if (link.source.id === reactionId && (link.target.type === "material" || link.target.type === "tag")) {
          const materialNode = node.filter(n => n.id === link.target.id);
          materialNode.select(".node-background")
            .attr("stroke", graphStyleConfig.colors.outputHighlight)
            .attr("stroke-width", graphStyleConfig.sizes.strokeWidthMedium);
        }
        if (link.target.id === reactionId && (link.source.type === "material" || link.source.type === "tag")) {
          const materialNode = node.filter(n => n.id === link.source.id);
          materialNode.select(".node-background")
            .attr("stroke", graphStyleConfig.colors.inputHighlight)
            .attr("stroke-width", graphStyleConfig.sizes.strokeWidthMedium);
        }
      });
    });
    
    // Dim non-connected nodes
    const allConnectedIds = new Set([d.id, ...connectedReactionIds]);
    linkArray.forEach(link => {
      if (connectedReactionIds.has(link.source.id)) allConnectedIds.add(link.target.id);
      if (connectedReactionIds.has(link.target.id)) allConnectedIds.add(link.source.id);
    });
    
    // If it's a tag, include all associated materials in the connected set
    if (d.type === "tag") {
      const materialIds = resolveTag(d.id);
      materialIds.forEach(materialId => allConnectedIds.add(materialId));
    }
    
    node.style("opacity", n => allConnectedIds.has(n.id) ? graphStyleConfig.opacities.default : graphStyleConfig.opacities.dimmed);
    linkGroups.style("opacity", l => 
      (allConnectedIds.has(l.source.id) && allConnectedIds.has(l.target.id)) ? 
      (l.type === "tag-association" ? graphStyleConfig.opacities.dimmed : graphStyleConfig.opacities.default) : 
      graphStyleConfig.opacities.veryDimmed
    );
  } else if (d.type === "reaction") {
    d3.select(event.currentTarget).select(".reaction-circle")
      .attr("stroke", graphStyleConfig.colors.nodeStrokeHighlight)
      .attr("stroke-width", graphStyleConfig.sizes.strokeWidthHighlight);
    
    // Find all materials connected to this reaction
    const connectedMaterialIds = new Set();
    linkArray.forEach(link => {
      if (link.source.id === d.id && (link.target.type === "material" || link.target.type === "tag")) {
        connectedMaterialIds.add(link.target.id);
      }
      if (link.target.id === d.id && (link.source.type === "material" || link.source.type === "tag")) {
        connectedMaterialIds.add(link.source.id);
      }
    });
    
    // Highlight connected materials
    connectedMaterialIds.forEach(materialId => {
      const materialNode = node.filter(n => n.id === materialId);
      materialNode.select(".node-background")
        .attr("stroke", graphStyleConfig.colors.nodeStrokeHighlight)
        .attr("stroke-width", graphStyleConfig.sizes.strokeWidthMedium);
    });
    
    // Dim non-connected nodes
    const allConnectedIds = new Set([d.id, ...connectedMaterialIds]);
    
    node.style("opacity", n => allConnectedIds.has(n.id) ? graphStyleConfig.opacities.default : graphStyleConfig.opacities.dimmed);
    linkGroups.style("opacity", l => 
      (allConnectedIds.has(l.source.id) && allConnectedIds.has(l.target.id)) ? 
      (l.type === "tag-association" ? graphStyleConfig.opacities.dimmed : graphStyleConfig.opacities.default) : 
      graphStyleConfig.opacities.veryDimmed
    );
  }
});
  
  // Update positions on simulation tick
  simulation.on("tick", () => {
    link
      .attr("x1", d => d.source.x)
      .attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x)
      .attr("y2", d => d.target.y);
    
    node.attr("transform", d => `translate(${d.x},${d.y})`);
  });
  
  function dragstarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  }
  
  function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
  }
  
  function dragended(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  }
  
  // Add zoom behavior
  const zoom = d3.zoom()
    .scaleExtent([0.1, 4])
    .on("zoom", (event) => {
      g.attr("transform", event.transform);
    });
  
  svg.call(zoom);
};
```

```js
// Update functions - now handling tags
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

  const reactionsCountContainer = document.getElementById("reactionsCount");
  if (reactionsCountContainer) {
    reactionsCountContainer.innerHTML = `Reactions found: <code class="bigger-number-better">${filteredReactions.length}</code>`;
  }

  // Render graph instead of table
  renderGraph(filteredReactions);

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

      let updateTimeout;
      const debouncedUpdate = () => {
        clearTimeout(updateTimeout);
        updateTimeout = setTimeout(() => {
          updateChoicesOptions();
          EventBus.emit("uiUpdateNeeded");
        }, 100);
      };

      // Event handlers - use EventBus instead of direct calls
      reagentSelectorElement.addEventListener("change", () => {
        if (window.appState.reagentChoices?.initialised && !window.appState.isResetting) {
          window.appState.selectedReagents = window.appState.reagentChoices.getValue(true);
          EventBus.emit("stateChanged");
        }
      });

      productSelectorElement.addEventListener("change", () => {
        if (window.appState.productChoices?.initialised && !window.appState.isResetting) {
          const selectedValues = window.appState.productChoices.getValue(true);
          window.appState.selectedProduct =
            Array.isArray(selectedValues) && selectedValues.length > 0 ? selectedValues[0] : "";
          EventBus.emit("stateChanged");
        }
      });

      // Toggle event handlers - use EventBus
      excludeSpecialToggle.addEventListener("input", () => {
        window.appState.excludeSpecialMaterials = excludeSpecialToggle.value;
        EventBus.emit("stateChanged");
      });

      onlyPracticalToggle.addEventListener("input", () => {
        window.appState.onlyPracticalReactions = onlyPracticalToggle.value;
        EventBus.emit("stateChanged");
      });

      excludeCatalystToggle.addEventListener("input", () => {
        window.appState.excludeCatalysts = excludeCatalystToggle.value;
        EventBus.emit("uiUpdateNeeded");
      });

      // Hook into update cycle properly
      EventBus.on("stateChanged", () => {
        updateChoicesOptions();
        EventBus.emit("uiUpdateNeeded");
      });

      EventBus.on("uiUpdateNeeded", () => {
        updateUI();
      });

    const resizeGraph = () => {
      const container = document.getElementById("tableContainer");
      const svg = container.querySelector("svg");
      if (!svg) return;

      const width = container.clientWidth;
      const height = Math.max(
        graphStyleConfig.layout.minHeight,
        width * graphStyleConfig.layout.heightRatio
      );

      svg.setAttribute("width", width);
      svg.setAttribute("height", height);
      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    };

    window.addEventListener("resize", resizeGraph);
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
  <div class="card grid-colspan-1" style="width: 100%; max-width: 100%; overflow: hidden; box-sizing: border-box; font-size: 0.9rem;"><h2 id="reactionsCount" style="margin: 0; font-size: 0.9rem;">Reactions found: <code class="bigger-number-better">319</code></h2></div>
</div>
<div class="grid grid-cols-2 gap-1" style="width: 100%; box-sizing: border-box;">
  <div class="grid grid-cols-2 gap-1" style="width: 100%; box-sizing: border-box;">
    <div class="card grid-colspan-1" style="width: 100%; max-width: 100%; overflow: hidden; box-sizing: border-box;">${resetButton}</div>
    <div class="card grid-colspan-1" style="width: 100%; max-width: 100%; overflow: hidden; box-sizing: border-box;">${shareButton}</div>
  </div>
  <div class="grid grid-cols-3 gap-1" style="width: 100%; box-sizing: border-box;">
    <div class="card grid-colspan-1" style="width: 100%; max-width: 100%; overflow: hidden; box-sizing: border-box;">${excludeSpecialToggle}</div>
    <div class="card grid-colspan-1" style="width: 100%; max-width: 100%; overflow: hidden; box-sizing: border-box;">${onlyPracticalToggle}</div>
    <div class="card grid-colspan-1" style="width: 100%; max-width: 100%; overflow: hidden; box-sizing: border-box;">${excludeCatalystToggle}</div>
  </div>
</div>
<div class="grid grid-cols-1 grid-rowspan-1" style="grid-auto-rows: auto">
  <div class="card" id="tableContainer"></div>
</div>
