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
  excludeSpecialMaterials: true,
  onlyPracticalReactions: true,
  excludeCatalysts: true,
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

const EventBus = {
  events: {},
  on(event, handler) {
    (this.events[event] ||= []).push(handler);
  },
  emit(event, payload) {
    (this.events[event] || []).forEach((fn) => fn(payload));
  }
};

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

    if (window.appState.excludeCatalysts) {
    relevantReactionIndices = new Set(
      [...relevantReactionIndices].filter((index) => {
        const r = reactions[index];
        // si le produit choisi est aussi un input => c'est un catalyseur
        const outputs = [r.output_cell1, r.output_cell2, r.output_cell3].filter(Boolean);
        const inputs = [r.input_cell1, r.input_cell2, r.input_cell3].filter(Boolean);

        // On filtre les réactions où tous les produits apparaissent déjà comme réactifs
        const allCatalysts = outputs.every(o => inputs.includes(o));
        return !allCatalysts;
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
// Graph visualization with D3.js
const renderGraph = (filteredReactions) => {
  const container = document.getElementById("tableContainer");
  container.innerHTML = "";
  
  if (filteredReactions.length === 0) {
    container.innerHTML = `<div style="text-align: center; padding: 2rem; color: #666;">No reactions found with current filters</div>`;
    return;
  }

  if (filteredReactions.length >= 1000) {
    container.innerHTML = `<div style="text-align: center; padding: 2rem; color: #666;">Too much reactions with current filters</div>`;
    return;
  }
  
  const width = container.clientWidth;
  const height = Math.max(600, width * 0.6);
  
  // Create SVG with a group for the zoomable content
  const svg = d3.select(container)
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height])
    .attr("style", "max-width: 100%; height: auto;");
  
  // Create a group for all zoomable content
  const g = svg.append("g");
  
  // Create a force-directed graph
  const nodes = new Map();
  const links = [];
  
  // Process reactions to create nodes and links
  filteredReactions.forEach((reaction, index) => {
    const reactionId = `reaction_${index}`;
    
    // Add reaction node
    nodes.set(reactionId, {
      id: reactionId,
      type: "reaction",
      reaction: reaction,
      radius: 15,
      color: "#ff6b6b"
    });
    
    // Process inputs
    [reaction.input_cell1, reaction.input_cell2, reaction.input_cell3]
      .filter(Boolean)
      .forEach((inputId, inputIndex) => {
        if (!nodes.has(inputId)) {
          const material = materialsMap.get(inputId);
          const imageUrl = getMaterialImageUrl(inputId);
          nodes.set(inputId, {
            id: inputId,
            type: "material",
            material: material,
            radius: 25,
            color: material?.color || "#505050ff",
            imageUrl: imageUrl,
            name: material?.name || inputId
          });
        }
        
        links.push({
          source: inputId,
          target: reactionId,
          type: "input",
          index: inputIndex
        });
      });
    
    // Process outputs
    [reaction.output_cell1, reaction.output_cell2, reaction.output_cell3]
      .filter(Boolean)
      .forEach((outputId, outputIndex) => {
        if (!nodes.has(outputId)) {
          const material = materialsMap.get(outputId);
          const imageUrl = getMaterialImageUrl(outputId);
          nodes.set(outputId, {
            id: outputId,
            type: "material",
            material: material,
            radius: 25,
            color: material?.color || "#45b7d1",
            imageUrl: imageUrl,
            name: material?.name || outputId
          });
        }
        
        links.push({
          source: reactionId,
          target: outputId,
          type: "output",
          index: outputIndex
        });
      });
  });
  
  const nodeArray = Array.from(nodes.values());
  const linkArray = links.map(link => ({
    ...link,
    source: nodes.get(link.source),
    target: nodes.get(link.target)
  }));
  
  // Create simulation
  const simulation = d3.forceSimulation(nodeArray)
    .force("link", d3.forceLink(linkArray).id(d => d.id).distance(120))
    .force("charge", d3.forceManyBody().strength(-400))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collision", d3.forceCollide().radius(d => d.radius + 15));
  
  // Create arrow markers - simple version, one per type
  const defs = svg.append("defs");
  
  defs.append("marker")
    .attr("id", "arrow-input")
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 25)
    .attr("refY", 0)
    .attr("markerWidth", 8)
    .attr("markerHeight", 8)
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M0,-5L10,0L0,5")
    .attr("fill", "#24c93aff");
  
  defs.append("marker")
    .attr("id", "arrow-output")
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 25)
    .attr("refY", 0)
    .attr("markerWidth", 8)
    .attr("markerHeight", 8)
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M0,-5L10,0L0,5")
    .attr("fill", "#45b7d1");
  
  // Create link groups (each group contains the line and inherits opacity)
  const linkGroups = g.append("g")
    .attr("class", "links")
    .selectAll("g")
    .data(linkArray)
    .join("g")
    .attr("class", "link-group")
    .style("opacity", 0.7);
  
  // Add lines to each link group
  const link = linkGroups.append("line")
    .attr("stroke", d => d.type === "input" ? "#24c93aff" : "#45b7d1")
    .attr("stroke-width", 3)
    .attr("marker-end", d => `url(#arrow-${d.type})`);
  
  // Create nodes group
  const node = g.append("g")
    .selectAll("g")
    .data(nodeArray)
    .join("g")
    .attr("class", d => `node ${d.type}-node`)
    .call(d3.drag()
      .on("start", dragstarted)
      .on("drag", dragged)
      .on("end", dragended));
  
  // Create clip paths for circular images
  node.filter(d => d.type === "material")
    .append("clipPath")
    .attr("id", d => `clip-${d.id}`)
    .append("circle")
    .attr("r", d => d.radius);
  
  // Add background circles for material nodes
  node.filter(d => d.type === "material")
    .append("circle")
    .attr("r", d => d.radius)
    .attr("fill", d => d.color)
    .attr("stroke", "#fff")
    .attr("stroke-width", 3)
    .attr("class", "node-background");
  
  // Add material images
  node.filter(d => d.type === "material")
    .append("g")
    .attr("clip-path", d => `url(#clip-${d.id})`)
    .append("image")
    .attr("href", d => d.imageUrl)
    .attr("x", d => -d.radius * 0.65)
    .attr("y", d => -d.radius * 0.65)
    .attr("transform", "scale(2)")
    .attr("class", "material-image")
    .on("error", function() {
      d3.select(this).style("display", "none");
    });

  // Add labels for all nodes
  node.append("text")
    .attr("text-anchor", "middle")
    .attr("dy", d => d.type === "material" ? d.radius + 20 : d.radius + 15)
    .attr("font-size", "11px")
    .attr("fill", "#2d3436")
    .attr("font-weight", "bold")
    .attr("class", "node-label")
    .text(d => {
      if (d.type === "material") {
        return d.name.length > 15 ? d.name.substring(0, 12) + "..." : d.name;
      }
    });
  
  // Add reaction nodes (circles with speed number)
  node.filter(d => d.type === "reaction")
    .append("circle")
    .attr("r", d => d.radius)
    .attr("fill", d => d.color)
    .attr("stroke", "#fff")
    .attr("stroke-width", 3)
    .attr("class", "reaction-circle");
  
  node.filter(d => d.type === "reaction")
    .append("text")
    .text(d => d.reaction.reaction_rate)
    .attr("text-anchor", "middle")
    .attr("dy", 5)
    .attr("font-size", "12px")
    .attr("fill", "#fff")
    .attr("font-weight", "bold")
    .attr("class", "reaction-speed");
  
  // Add tooltips
  node.append("title")
    .text(d => {
      if (d.type === "material") {
        return `${d.name} (${d.id})`;
      } else {
        const inputs = [d.reaction.input_cell1, d.reaction.input_cell2, d.reaction.input_cell3]
          .filter(Boolean)
          .map(id => materialsMap.get(id)?.name || id)
          .join(" + ");
        
        const outputs = [d.reaction.output_cell1, d.reaction.output_cell2, d.reaction.output_cell3]
          .filter(Boolean)
          .map(id => materialsMap.get(id)?.name || id)
          .join(" + ");
        
        return `Reaction (Speed: ${d.reaction.reaction_rate})\n${inputs} → ${outputs}`;
      }
    });
  
  node.on("mouseout", function(event, d) {
    d3.select(this).select(".node-background, .reaction-circle")
      .transition()
      .duration(200)
      .attr("stroke-width", 3)
      .attr("stroke", "#fff");
    
    d3.select(this).select(".node-id-label")
      .transition()
      .duration(200)
      .style("opacity", 0);
  });
  
  node.on("click", (event, d) => {
    event.stopPropagation();

    // Ctrl+click → toggle reagent
    // if (event.ctrlKey && !event.shiftKey && d.type === "material") {
    //   const isSelected = window.appState.selectedReagents.includes(d.id);

    //   if (!isSelected) {
    //     // Add reagent
    //     window.appState.selectedReagents.push(d.id);

    //     // Check if any reactions remain
    //     const testReactions = getFilteredReactions(window.appState.selectedReagents, window.appState.selectedProduct);
    //     if (testReactions.length === 0) {
    //       // Undo and warn
    //       window.appState.selectedReagents = window.appState.selectedReagents.filter(r => r !== d.id);
    //       createNotification("That selection leaves no valid reactions");
    //       return;
    //     }

    //     EventBus.emit("stateChanged");
    //   } else {
    //     // Try removing reagent
    //     const testReagents = window.appState.selectedReagents.filter(r => r !== d.id);
    //     const testReactions = getFilteredReactions(testReagents, window.appState.selectedProduct);

    //     if (testReactions.length > 0) {
    //       window.appState.selectedReagents = testReagents;
    //       EventBus.emit("stateChanged");
    //     } else {
    //       createNotification("At least one valid reaction must remain");
    //     }
    //   }

    //   return;
    // }

    // Shift+click → reset & select product
    if (!event.ctrlKey && event.shiftKey && d.type === "material") {
      const testReagents = [];
      const testProduct = d.id;
      const testReactions = getFilteredReactions(testReagents, testProduct);

      if (testReactions.length > 0) {
        window.appState.selectedReagents = [];
        window.appState.selectedProduct = d.id;
        EventBus.emit("stateChanged");
      } else {
        createNotification("No valid reactions with this product");
      }

      return;
    }

    // Shift+click → reset & select reagent
    if (event.ctrlKey && !event.shiftKey && d.type === "material") {
      const testReagents = [d.id];
      const testProduct = "";
      const testReactions = getFilteredReactions(testReagents, testProduct);

      if (testReactions.length > 0) {
        window.appState.selectedReagents = [d.id];
        window.appState.selectedProduct = "";
        EventBus.emit("stateChanged");
      } else {
        createNotification("No valid reactions with this reagent");
      }

      return;
    }

    
    // Reset all highlighting first
    node.style("opacity", 1);
    linkGroups.style("opacity", 0.7);
    node.select(".node-background, .reaction-circle")
      .attr("stroke", "#fff")
      .attr("stroke-width", 3);
    
    // If it's a material node, highlight it and its direct connections only
    if (d.type === "material") {
      // Highlight the clicked material
      d3.select(event.currentTarget).select(".node-background")
        .attr("stroke", "#ff6b6b")
        .attr("stroke-width", 5);
      
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
          .attr("stroke", "#ff6b6b")
          .attr("stroke-width", 5);
        
        // Highlight materials connected to these reactions
        linkArray.forEach(link => {
          if (link.source.id === reactionId && link.target.type === "material") {
            const materialNode = node.filter(n => n.id === link.target.id);
            materialNode.select(".node-background")
              .attr("stroke", "#45b7d1")
              .attr("stroke-width", 4);
          }
          if (link.target.id === reactionId && link.source.type === "material") {
            const materialNode = node.filter(n => n.id === link.source.id);
            materialNode.select(".node-background")
              .attr("stroke", "#24c93aff")
              .attr("stroke-width", 4);
          }
        });
      });
      
      // Dim non-connected nodes
      const allConnectedIds = new Set([d.id, ...connectedReactionIds]);
      linkArray.forEach(link => {
        if (connectedReactionIds.has(link.source.id)) allConnectedIds.add(link.target.id);
        if (connectedReactionIds.has(link.target.id)) allConnectedIds.add(link.source.id);
      });
      
      node.style("opacity", n => allConnectedIds.has(n.id) ? 1 : 0.3);
      linkGroups.style("opacity", l => 
        (allConnectedIds.has(l.source.id) && allConnectedIds.has(l.target.id)) ? 1 : 0.2
      );
    } else if (d.type === "reaction") {
      d3.select(event.currentTarget).select(".reaction-circle")
        .attr("stroke", "#ff6b6b")
        .attr("stroke-width", 5);
      
      // Find all materials connected to this reaction
      const connectedMaterialIds = new Set();
      linkArray.forEach(link => {
        if (link.source.id === d.id && link.target.type === "material") {
          connectedMaterialIds.add(link.target.id);
        }
        if (link.target.id === d.id && link.source.type === "material") {
          connectedMaterialIds.add(link.source.id);
        }
      });
      
      // Highlight connected materials
      connectedMaterialIds.forEach(materialId => {
        const materialNode = node.filter(n => n.id === materialId);
        materialNode.select(".node-background")
          .attr("stroke", "#45b7d1")
          .attr("stroke-width", 4);
      });
      
      // Dim non-connected nodes
      const allConnectedIds = new Set([d.id, ...connectedMaterialIds]);
      
      node.style("opacity", n => allConnectedIds.has(n.id) ? 1 : 0.3);
      linkGroups.style("opacity", l => 
        (allConnectedIds.has(l.source.id) && allConnectedIds.has(l.target.id)) ? 1 : 0.2
      );
    }
  });
  
  // Click on empty space to deselect
  svg.on("click", () => {
    node.style("opacity", 1);
    linkGroups.style("opacity", 0.7);
    node.select(".node-background, .reaction-circle")
      .attr("stroke", "#fff")
      .attr("stroke-width", 3);
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

      excludeCatalystToggle.addEventListener("input", () => {
        window.appState.excludeCatalysts = excludeCatalystToggle.value;
        updateUI();
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

    // Hook into update cycle
    EventBus.on("stateChanged", () => {
      updateChoicesOptions();
      updateUI();
    });
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
