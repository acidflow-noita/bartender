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
<script src="https://d3js.org/d3.v7.min.js"></script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/choices.js/public/assets/styles/choices.min.css"/>
<link href="custom.css" rel="stylesheet"></link>

<h1 id="acidTitle" class="bartender-heading-decrypted">Reactions Graph</h1>

```js
import { initializeTitleAnimation } from "./components/titleAnimation.js";
initializeTitleAnimation();
```

```js
// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  graph: {
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
      tagRadius: 20,
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
      tagAssociation: 0.3,
      dimmed: 0.15,
      veryDimmed: 0.05,
      hidden: 0
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
      maxReactions: 317,
      maxNameLength: 30,
      truncatedNameLength: 20
    }
  },
  ui: {
    debounceDelay: 100,
    notificationDuration: 2500,
    maxReagentSelection: 3,
    maxProductSelection: 1
  },
  urls: {
    imageBase: "https://noita-bartender-images.acidflow.stream",
    wikiBase: "https://noita.wiki.gg/wiki/"
  }
};
```

```js
// ============================================================================
// DATA LOADING
// ============================================================================

const materials = await FileAttachment("./data/FULL_MATERIALS_FINAL.json").json();
const reactions = await FileAttachment("./data/reactions_from_materials.json").json();
const materialAssociations = await FileAttachment("./data/jsons/material_associations.json").json();
```

```js
// ============================================================================
// CORE CLASSES
// ============================================================================

class EventBus {
  constructor() {
    this.events = {};
  }
  
  on(event, handler) {
    (this.events[event] ||= []).push(handler);
  }
  
  emit(event, payload) {
    (this.events[event] || []).forEach(fn => fn(payload));
  }
  
  off(event, handler) {
    if (!this.events[event]) return;
    this.events[event] = this.events[event].filter(h => h !== handler);
  }
}

const eventBus = new EventBus();
```

```js
class DataRepository {
  constructor(materials, reactions, materialAssociations) {
    this.materialsMap = new Map(materials.map(m => [m.id, m]));
    this.reactions = reactions;
    this.tagToMaterialsMap = this._buildTagMap(materialAssociations);
    this.inputIndex = this._buildIndex(r => [r.reagent1, r.reagent2, r.reagent3]);
    this.outputIndex = this._buildIndex(r => [r.product1, r.product2, r.product3]);
  }
  
  _buildTagMap(associations) {
    const map = new Map();
    associations.forEach(assoc => {
      if (!map.has(assoc.tag)) map.set(assoc.tag, []);
      map.get(assoc.tag).push(assoc.id);
    });
    return map;
  }
  
  _buildIndex(getFields) {
    const index = new Map();
    this.reactions.forEach((reaction, reactionIndex) => {
      getFields(reaction).filter(Boolean).forEach(field => {
        this.resolveTag(field).forEach(resolvedId => {
          if (!index.has(resolvedId)) index.set(resolvedId, []);
          index.get(resolvedId).push(reactionIndex);
        });
      });
    });
    return index;
  }
  
  isTag(identifier) {
    return identifier?.startsWith('[') && identifier?.endsWith(']');
  }
  
  resolveTag(identifier) {
    if (!this.isTag(identifier)) return [identifier];
    const tag = identifier.slice(1, -1);
    return this.tagToMaterialsMap.get(tag) || [];
  }
  
  getMaterial(id) {
    return this.materialsMap.get(id);
  }
  
  getReaction(index) {
    return this.reactions[index];
  }
  
  getReactionsWithInput(materialId) {
    return this.inputIndex.get(materialId) || [];
  }
  
  getReactionsWithOutput(materialId) {
    return this.outputIndex.get(materialId) || [];
  }
}

const dataRepo = new DataRepository(materials, reactions, materialAssociations);
```

```js
class AppState {
  constructor() {
    this.selectedReagents = [];
    this.selectedProduct = "";
    this.visibleTagMaterials = new Set();
    this.reagentChoices = null;
    this.productChoices = null;
    this.isResetting = false;
    this.minReactionSpeed = 0;
    this._initializeFromURL();
  }
  
  _initializeFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    this.selectedReagents = urlParams.get("reagents")?.split(",").filter(Boolean) || [];
    this.selectedProduct = urlParams.get("product") || "";
    const speedParam = urlParams.get("minSpeed");
    this.minReactionSpeed = speedParam ? parseInt(speedParam) : 0;
  }
  
  update(changes) {
    Object.assign(this, changes);
    eventBus.emit("stateChanged", this);
  }
  
  toggleTagVisibility(tagId) {
    const materialIds = dataRepo.resolveTag(tagId);
    const allVisible = materialIds.every(id => this.visibleTagMaterials.has(id));
    
    materialIds.forEach(id => {
      allVisible ? this.visibleTagMaterials.delete(id) : this.visibleTagMaterials.add(id);
    });
    
    eventBus.emit("stateChanged", this);
  }
  
  selectReagent(reagentId) {
    if (dataRepo.getReactionsWithInput(reagentId).length === 0) return false;
    
    this.visibleTagMaterials.clear();
    this.update({
      selectedReagents: [reagentId],
      selectedProduct: ""
    });
    return true;
  }
  
  selectProduct(productId) {
    if (dataRepo.getReactionsWithOutput(productId).length === 0) return false;
    
    this.visibleTagMaterials.clear();
    this.update({
      selectedReagents: [],
      selectedProduct: productId
    });
    return true;
  }
  
  setMinReactionSpeed(speed) {
    this.update({ minReactionSpeed: speed });
  }
  
  reset() {
    this.isResetting = true;
    this.visibleTagMaterials.clear();
    this.selectedReagents = [];
    this.selectedProduct = "";
    
    if (this.reagentChoices?.initialised) this.reagentChoices.removeActiveItems();
    if (this.productChoices?.initialised) this.productChoices.removeActiveItems();
    
    const url = new URL(window.location.href);
    url.search = "";
    window.history.replaceState({}, "", url.toString());
    
    this.isResetting = false;
    eventBus.emit("stateChanged", this);
  }
  
  updateURL() {
    if (this.isResetting) return;
    
    const url = new URL(window.location.href);
    url.search = "";
    
    if (this.selectedReagents.length > 0) {
      url.searchParams.set("reagents", this.selectedReagents.join(","));
    }
    if (this.selectedProduct) {
      url.searchParams.set("product", this.selectedProduct);
    }
    if (this.minReactionSpeed > 0) {
      url.searchParams.set("minSpeed", this.minReactionSpeed.toString());
    }
    
    window.history.replaceState({}, "", url.toString());
  }
}

const appState = new AppState();
```

```js
class ReactionFilter {
  constructor(dataRepo) {
    this.dataRepo = dataRepo;
  }
  
  getFilteredReactions(selectedReagents = [], selectedProduct = "", minSpeed = 0) {
    let indices = new Set(Array.from({ length: this.dataRepo.reactions.length }, (_, i) => i));
    
    if (selectedProduct) {
      const productReactions = new Set(this.dataRepo.getReactionsWithOutput(selectedProduct));
      indices = new Set([...indices].filter(x => productReactions.has(x)));
    }
    
    if (selectedReagents.length > 0) {
      selectedReagents.forEach(reagent => {
        const reagentReactions = new Set(this.dataRepo.getReactionsWithInput(reagent));
        indices = new Set([...indices].filter(x => reagentReactions.has(x)));
      });
      
      indices = new Set([...indices].filter(index => {
        const reaction = this.dataRepo.getReaction(index);
        const reactionInputs = [reaction.reagent1, reaction.reagent2, reaction.reagent3].filter(Boolean);
        
        const possibleAssignments = selectedReagents.map(reagent => {
          return reactionInputs.filter(slot => {
            if (this.dataRepo.isTag(slot)) {
              return this.dataRepo.resolveTag(slot).includes(reagent);
            }
            return slot === reagent;
          });
        });
        
        return this._canAssignWithoutConflict(possibleAssignments);
      }));
    }
    
    // Filter by minimum reaction speed
    if (minSpeed > 0) {
      indices = new Set([...indices].filter(index => {
        const reaction = this.dataRepo.getReaction(index);
        return reaction.reactionRate >= minSpeed;
      }));
    }
    
    return Array.from(indices)
      .map(index => this.dataRepo.getReaction(index))
      .sort((a, b) => b.reactionRate - a.reactionRate);
  }
  
  _canAssignWithoutConflict(possibleAssignments) {
    const backtrack = (index, usedSlots) => {
      if (index >= possibleAssignments.length) return true;
      
      for (const slot of possibleAssignments[index]) {
        if (!usedSlots.has(slot)) {
          usedSlots.add(slot);
          if (backtrack(index + 1, usedSlots)) return true;
          usedSlots.delete(slot);
        }
      }
      return false;
    };
    
    return backtrack(0, new Set());
  }
  
  getAvailableReagents(selectedReagents = [], selectedProduct = "") {
    if (!selectedProduct && selectedReagents.length === 0) {
      return this._createChoices(Array.from(this.dataRepo.inputIndex.keys()));
    }
    
    let indices = selectedProduct 
      ? new Set(this.dataRepo.getReactionsWithOutput(selectedProduct))
      : new Set(Array.from({ length: this.dataRepo.reactions.length }, (_, i) => i));
    
    if (selectedReagents.length > 0) {
      selectedReagents.forEach(reagent => {
        const reagentReactions = new Set(this.dataRepo.getReactionsWithInput(reagent));
        indices = new Set([...indices].filter(x => reagentReactions.has(x)));
      });
    }
    
    const availableIds = new Set();
    indices.forEach(index => {
      const reaction = this.dataRepo.getReaction(index);
      [reaction.reagent1, reaction.reagent2, reaction.reagent3]
        .filter(Boolean)
        .flatMap(id => this.dataRepo.resolveTag(id))
        .forEach(id => availableIds.add(id));
    });
    
    return this._createChoices(Array.from(availableIds));
  }
  
  getAvailableProducts(selectedReagents = []) {
    if (selectedReagents.length === 0) {
      return this._createChoices(Array.from(this.dataRepo.outputIndex.keys()));
    }
    
    let indices = new Set(Array.from({ length: this.dataRepo.reactions.length }, (_, i) => i));
    
    selectedReagents.forEach(reagent => {
      const reagentReactions = new Set(this.dataRepo.getReactionsWithInput(reagent));
      indices = new Set([...indices].filter(x => reagentReactions.has(x)));
    });
    
    const availableIds = new Set();
    indices.forEach(index => {
      const reaction = this.dataRepo.getReaction(index);
      [reaction.product1, reaction.product2, reaction.product3]
        .filter(Boolean)
        .flatMap(id => this.dataRepo.resolveTag(id))
        .forEach(id => availableIds.add(id));
    });
    
    return this._createChoices(Array.from(availableIds));
  }
  
  _createChoices(materialIds) {
    return materialIds
      .filter(id => !this.dataRepo.isTag(id))
      .map(id => {
        const material = this.dataRepo.getMaterial(id);
        return material ? {
          value: id,
          label: `${material.name} (${id})`,
          name: material.name,
          type: material.type || ""
        } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name));
  }
}

const reactionFilter = new ReactionFilter(dataRepo);
```

```js
class UIHelper {
  static imageUrlCache = new Map();
  
  static getMaterialImageUrl(id) {
    if (!id) return "";
    if (!this.imageUrlCache.has(id)) {
      const url = dataRepo.isTag(id)
        ? `${CONFIG.urls.imageBase}/images/icons/tag.svg`
        : `${CONFIG.urls.imageBase}/images/materials/Material_${id}.png`;
      this.imageUrlCache.set(id, url);
    }
    return this.imageUrlCache.get(id);
  }
  
  static getMaterialName(id) {
    if (dataRepo.isTag(id)) return `[${id.slice(1, -1)}]`;
    const material = dataRepo.getMaterial(id);
    return material?.name || id;
  }
  
  static truncateName(name, maxLength = CONFIG.graph.constraints.maxNameLength) {
    return name.length > maxLength 
      ? name.substring(0, CONFIG.graph.constraints.truncatedNameLength) + "..." 
      : name;
  }
  
  static showNotification(text) {
    const parentElement = document.getElementById("observablehq-main");
    const notifID = "share-notification";
    
    if (!parentElement || document.getElementById(notifID)) return;
    
    const notification = document.createElement("p");
    notification.id = notifID;
    notification.textContent = text;
    notification.classList.add("notification");
    parentElement.appendChild(notification);
    
    setTimeout(() => notification.style.opacity = 1, 100);
    setTimeout(() => {
      notification.style.opacity = 0;
      setTimeout(() => parentElement.removeChild(notification), 500);
    }, CONFIG.ui.notificationDuration);
  }
}

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
class GraphDataBuilder {
  constructor(dataRepo) {
    this.dataRepo = dataRepo;
  }
  
  buildGraphData(filteredReactions) {
    const nodes = new Map();
    const links = [];
    const linkKeys = new Set();
    
    filteredReactions.forEach((reaction, index) => {
      const reactionId = `reaction_${index}`;
      nodes.set(reactionId, {
        id: reactionId,
        type: "reaction",
        reaction,
        radius: CONFIG.graph.sizes.reactionRadius,
        color: CONFIG.graph.colors.reactionNode
      });
      
      this._processFields(
        [reaction.reagent1, reaction.reagent2, reaction.reagent3],
        reactionId,
        "input",
        nodes,
        links,
        linkKeys,
        (tagId, reactionId, index) => ({ source: tagId, target: reactionId, type: "input", index }),
        (materialId, reactionId, index) => ({ source: materialId, target: reactionId, type: "input", index }),
        (materialId, tagId, index) => ({ source: materialId, target: tagId, type: "tag-association", index })
      );
      
      this._processFields(
        [reaction.product1, reaction.product2, reaction.product3],
        reactionId,
        "output",
        nodes,
        links,
        linkKeys,
        (tagId, reactionId, index) => ({ source: reactionId, target: tagId, type: "output", index }),
        (materialId, reactionId, index) => ({ source: reactionId, target: materialId, type: "output", index }),
        (materialId, tagId, index) => ({ source: tagId, target: materialId, type: "tag-association", index })
      );
    });
    
    return { nodes, links };
  }
  
  _processFields(fields, reactionId, direction, nodes, links, linkKeys, tagLinkFn, materialLinkFn, assocLinkFn) {
    fields.filter(Boolean).forEach((fieldId, index) => {
      if (this.dataRepo.isTag(fieldId)) {
        this._addTagNode(fieldId, nodes);
        this._addLinkIfUnique(tagLinkFn(fieldId, reactionId, index), links, linkKeys);
        
        this.dataRepo.resolveTag(fieldId).forEach(materialId => {
          this._addMaterialNode(materialId, nodes, true, fieldId);
          this._addLinkIfUnique(assocLinkFn(materialId, fieldId, index), links, linkKeys);
        });
      } else {
        this._addMaterialNode(fieldId, nodes, false);
        this._addLinkIfUnique(materialLinkFn(fieldId, reactionId, index), links, linkKeys);
      }
    });
  }
  
  _addLinkIfUnique(link, links, linkKeys) {
    const key = `${link.source}-${link.target}-${link.type}`;
    if (!linkKeys.has(key)) {
      linkKeys.add(key);
      links.push(link);
    }
  }
  
  _addMaterialNode(materialId, nodes, isTagMaterial, parentTag = null) {
    if (!nodes.has(materialId)) {
      const material = this.dataRepo.getMaterial(materialId);
      nodes.set(materialId, {
        id: materialId,
        type: "material",
        material,
        radius: CONFIG.graph.sizes.materialRadius,
        color: material?.color || CONFIG.graph.colors.materialNodeDefault,
        imageUrl: UIHelper.getMaterialImageUrl(materialId),
        name: material?.name || materialId,
        isTagMaterial,
        parentTag
      });
    }
  }
  
  _addTagNode(tagId, nodes) {
    if (!nodes.has(tagId)) {
      nodes.set(tagId, {
        id: tagId,
        type: "tag",
        tag: tagId.slice(1, -1),
        radius: CONFIG.graph.sizes.tagRadius,
        color: CONFIG.graph.colors.tagNode,
        imageUrl: UIHelper.getMaterialImageUrl(tagId),
        name: UIHelper.getMaterialName(tagId)
      });
    }
  }
  
  filterVisibleNodes(nodeArray, state) {
    return nodeArray.filter(node => {
      if (state.selectedReagents.includes(node.id) || state.selectedProduct === node.id) return true;
      if (node.type === "tag" || node.type === "reaction") return true;
      if (node.type === "material" && !node.isTagMaterial) return true;
      if (node.type === "material" && node.isTagMaterial) {
        return state.visibleTagMaterials.has(node.id);
      }
      return true;
    });
  }
  
  filterVisibleLinks(linkArray, visibleNodes) {
    const visibleNodeIds = new Set(visibleNodes.map(n => n.id));
    return linkArray.filter(link => 
      visibleNodeIds.has(link.source.id) && visibleNodeIds.has(link.target.id)
    );
  }
}

const graphDataBuilder = new GraphDataBuilder(dataRepo);
```

```js
class GraphRenderer {
  constructor(dataRepo, state) {
    this.dataRepo = dataRepo;
    this.state = state;
    this.currentCleanup = null;
  }
  
  render(filteredReactions) {
    const container = document.getElementById("tableContainer");
    container.innerHTML = "";
    
    if (this.currentCleanup) {
      this.currentCleanup();
      this.currentCleanup = null;
    }
    
    if (filteredReactions.length === 0) {
      container.innerHTML = `<div style="text-align: center; padding: 2rem; color: ${CONFIG.graph.colors.textLight};">No reactions found with current filters</div>`;
      return;
    }
    
    if (filteredReactions.length >= CONFIG.graph.constraints.maxReactions) {
      container.innerHTML = `<div style="text-align: center; padding: 2rem; color: ${CONFIG.graph.colors.textLight};">Too many reactions with current filters</div>`;
      return;
    }
    
    const width = container.clientWidth;
    const height = Math.max(CONFIG.graph.layout.minHeight, width * CONFIG.graph.layout.heightRatio);
    
    const { nodes, links } = graphDataBuilder.buildGraphData(filteredReactions);
    const nodeArray = Array.from(nodes.values());
    const linkArray = links.map(link => ({
      ...link,
      source: nodes.get(link.source),
      target: nodes.get(link.target)
    }));
    
    let visibleNodes = graphDataBuilder.filterVisibleNodes(nodeArray, this.state);
    
    // Add directly involved materials
    visibleNodes = nodeArray.filter(node => {
      if (visibleNodes.includes(node)) return true;
      if (node.type === "material" && node.isTagMaterial) {
        return this._isMaterialDirectlyInvolved(node.id, linkArray);
      }
      return false;
    });
    
    const visibleLinks = graphDataBuilder.filterVisibleLinks(linkArray, visibleNodes);
    
    const { svg, g } = this._createSVG(container, width, height);
    this._createArrowMarkers(svg);
    
    const linkGroups = this._createLinks(g, visibleLinks);
    const simulation = this._createSimulation(visibleNodes, visibleLinks, width, height);
    const nodeSelection = this._createNodes(g, visibleNodes, linkArray, simulation);
    
    simulation.on("tick", () => {
      linkGroups.selectAll("line")
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);
      
      nodeSelection.attr("transform", d => `translate(${d.x},${d.y})`);
    });
    
    const resizeHandler = () => this._handleResize(container, svg);
    window.addEventListener("resize", resizeHandler);
    
    this.currentCleanup = () => {
      window.removeEventListener("resize", resizeHandler);
      simulation.stop();
    };
  }
  
  _isMaterialDirectlyInvolved(materialId, linkArray) {
    return linkArray.some(link => 
      (link.source.id === materialId && link.target.type === "reaction" && link.type === "input") ||
      (link.target.id === materialId && link.source.type === "reaction" && link.type === "output")
    );
  }
  
  _createSVG(container, width, height) {
    const wrapper = document.createElement("div");
    wrapper.style.cssText = "width:100%;height:100%;overflow:hidden;position:relative;";
    container.appendChild(wrapper);
    
    const svg = d3.select(wrapper)
      .append("svg")
      .attr("width", width)
      .attr("height", height)
      .attr("viewBox", [0, 0, width, height])
      .attr("preserveAspectRatio", "none")
      .style("position", "absolute")
      .style("left", 0)
      .style("top", 0);
    
    const g = svg.append("g");
    
    const zoom = d3.zoom()
      .scaleExtent([0.1, 4])
      .on("zoom", event => g.attr("transform", event.transform));
    
    svg.call(zoom);
    svg.on("click", () => this._resetHighlighting(d3.selectAll(".node")));
    
    return { svg, g };
  }
  
  _createArrowMarkers(svg) {
    const defs = svg.append("defs");
    
    [
      { id: "arrow-input", color: CONFIG.graph.colors.inputArrow },
      { id: "arrow-output", color: CONFIG.graph.colors.outputArrow }
    ].forEach(({ id, color }) => {
      defs.append("marker")
        .attr("id", id)
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", CONFIG.graph.sizes.materialRadius)
        .attr("refY", 0)
        .attr("markerWidth", 8)
        .attr("markerHeight", 8)
        .attr("orient", "auto")
        .append("path")
        .attr("d", "M0,-5L10,0L0,5")
        .attr("fill", color);
    });
  }
  
  _createLinks(g, visibleLinks) {
    const linkGroups = g.append("g")
      .attr("class", "links")
      .selectAll("g")
      .data(visibleLinks)
      .join("g")
      .attr("class", d => `link-group ${d.type}-link`)
      .style("opacity", d => d.type === "tag-association" ? CONFIG.graph.opacities.tagAssociation : CONFIG.graph.opacities.linkDefault);
    
    linkGroups.append("line")
      .attr("stroke", d => {
        if (d.type === "input") return CONFIG.graph.colors.inputArrow;
        if (d.type === "output") return CONFIG.graph.colors.outputArrow;
        if (d.type === "tag-association") return CONFIG.graph.colors.tagNode;
        return "#ccc";
      })
      .attr("stroke-width", d => d.type === "tag-association" ? CONFIG.graph.sizes.strokeWidth - 1 : CONFIG.graph.sizes.strokeWidth)
      .attr("stroke-dasharray", d => d.type === "input" ? "5,5" : null)
      .attr("marker-end", d => {
        if (d.type === "input") return "url(#arrow-input)";
        if (d.type === "output") return "url(#arrow-output)";
        return null;
      });
    
    return linkGroups;
  }
  
  _createSimulation(visibleNodes, visibleLinks, width, height) {
    return d3.forceSimulation(visibleNodes)
      .force("link", d3.forceLink(visibleLinks).id(d => d.id).distance(CONFIG.graph.sizes.linkDistance))
      .force("charge", d3.forceManyBody().strength(CONFIG.graph.sizes.chargeStrength))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(d => d.radius + 15));
  }
  
  _createNodes(g, visibleNodes, linkArray, simulation) {
    const drag = d3.drag()
      .on("start", (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on("end", (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });
    
    const nodeSelection = g.append("g")
      .selectAll("g")
      .data(visibleNodes)
      .join("g")
      .attr("class", d => `node ${d.type}-node`)
      .call(drag);
    
    // Create material nodes
    nodeSelection.filter(d => d.type === "material").each((d, i, nodes) => {
      const selection = d3.select(nodes[i]);
      this._createMaterialNode(d, selection, linkArray);
    });
    
    // Create tag nodes
    nodeSelection.filter(d => d.type === "tag").each((d, i, nodes) => {
      const selection = d3.select(nodes[i]);
      this._createTagNode(d, selection);
    });
    
    // Create reaction nodes
    nodeSelection.filter(d => d.type === "reaction").each((d, i, nodes) => {
      const selection = d3.select(nodes[i]);
      this._createReactionNode(d, selection);
    });
    
    // Add click handlers
    nodeSelection.on("click", (event, d) => this._handleNodeClick(event, d, nodeSelection, linkArray));
    
    return nodeSelection;
  }
  
  _createMaterialNode(node, selection, linkArray) {
    const isDirectMaterial = this._isMaterialDirectlyInvolved(node.id, linkArray);
    
    // Highlight
    selection.append("circle")
      .attr("r", node.radius + 4)
      .attr("fill", "transparent")
      .attr("stroke", () => {
        if (this.state.selectedReagents.includes(node.id) || this.state.selectedProduct === node.id) {
          return CONFIG.graph.colors.selectedHighlight;
        }
        if (isDirectMaterial) return CONFIG.graph.colors.directMaterialHighlight;
        return "transparent";
      })
      .attr("stroke-width", 2)
      .attr("class", "material-highlight")
      .style("opacity", (this.state.selectedReagents.includes(node.id) || this.state.selectedProduct === node.id || isDirectMaterial) ? 1 : 0);
    
    // Background
    selection.append("circle")
      .attr("r", node.radius)
      .attr("fill", node.color)
      .attr("stroke", CONFIG.graph.colors.nodeStroke)
      .attr("stroke-width", CONFIG.graph.sizes.strokeWidth)
      .attr("class", "node-background");
    
    // Clip path and image
    selection.append("clipPath")
      .attr("id", `clip-${node.id}`)
      .append("circle")
      .attr("r", node.radius);
    
    selection.append("g")
      .attr("clip-path", `url(#clip-${node.id})`)
      .append("image")
      .attr("href", node.imageUrl)
      .attr("x", -node.radius * CONFIG.graph.layout.imagePosition)
      .attr("y", -node.radius * CONFIG.graph.layout.imagePosition)
      .attr("transform", `scale(${CONFIG.graph.layout.imageScale})`)
      .attr("class", "material-image")
      .on("error", function() { d3.select(this).style("display", "none"); });
    
    // Label
    selection.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", node.radius + CONFIG.graph.layout.labelOffsetMaterial)
      .attr("font-size", CONFIG.graph.sizes.fontSizeSmall)
      .attr("fill", CONFIG.graph.colors.text)
      .attr("font-weight", "bold")
      .attr("class", "node-label")
      .text(UIHelper.truncateName(node.name || node.id));
    
    // Tooltip
    selection.append("title").text(`${node.name} (${node.id})`);
  }
  
  _createTagNode(node, selection) {
    const materialIds = this.dataRepo.resolveTag(node.id);
    const hasVisibleMaterials = materialIds.some(id => this.state.visibleTagMaterials.has(id));
    
    // Background
    selection.append("circle")
      .attr("r", node.radius)
      .attr("fill", node.color)
      .attr("stroke", CONFIG.graph.colors.nodeStroke)
      .attr("stroke-width", CONFIG.graph.sizes.strokeWidth)
      .attr("class", "node-background");
    
    // Icon
    selection.append("image")
      .attr("href", hasVisibleMaterials 
        ? `${CONFIG.urls.imageBase}/images/icons/eye-open.svg`
        : `${CONFIG.urls.imageBase}/images/icons/eye-closed.svg`)
      .attr("x", -node.radius * 0.5)
      .attr("y", -node.radius * 0.5)
      .attr("width", node.radius)
      .attr("height", node.radius)
      .attr("class", "tag-visibility-icon");
    
    // Border
    selection.append("circle")
      .attr("r", node.radius + 2)
      .attr("fill", "transparent")
      .attr("stroke", hasVisibleMaterials ? CONFIG.graph.colors.tagVisible : CONFIG.graph.colors.tagHidden)
      .attr("stroke-width", 3)
      .attr("stroke-dasharray", "4,2")
      .attr("class", "tag-border");
    
    // Label
    selection.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", node.radius + CONFIG.graph.layout.labelOffsetReaction)
      .attr("font-size", CONFIG.graph.sizes.fontSizeSmall)
      .attr("fill", CONFIG.graph.colors.text)
      .attr("font-weight", "bold")
      .attr("class", "node-label")
      .text(UIHelper.truncateName(node.name || node.id));
    
    // Tooltip
    const visibleCount = materialIds.filter(id => this.state.visibleTagMaterials.has(id)).length;
    const totalCount = materialIds.length;
    const tagName = node.tag;
    
    let tooltipText;
    if (visibleCount === totalCount) {
      tooltipText = `Tag: [${tagName}]\nAll ${totalCount} materials visible\nDouble-click to hide all`;
    } else if (visibleCount > 0) {
      tooltipText = `Tag: [${tagName}]\n${visibleCount} of ${totalCount} materials visible\nDouble-click to toggle all`;
    } else {
      tooltipText = `Tag: [${tagName}]\nAll ${totalCount} materials hidden\nDouble-click to show all`;
    }
    
    selection.append("title").text(tooltipText);
  }
  
  _createReactionNode(node, selection) {
    // Circle
    selection.append("circle")
      .attr("r", node.radius)
      .attr("fill", node.color)
      .attr("stroke", CONFIG.graph.colors.nodeStroke)
      .attr("stroke-width", CONFIG.graph.sizes.strokeWidth)
      .attr("class", "reaction-circle");
    
    // Speed number
    selection.append("text")
      .text(node.reaction.reactionRate)
      .attr("text-anchor", "middle")
      .attr("dy", 5)
      .attr("font-size", CONFIG.graph.sizes.fontSizeMedium)
      .attr("fill", CONFIG.graph.colors.text)
      .attr("font-weight", "bold")
      .attr("class", "reaction-speed");
    
    // Tooltip
    const inputs = [node.reaction.reagent1, node.reaction.reagent2, node.reaction.reagent3]
      .filter(Boolean)
      .map(id => UIHelper.getMaterialName(id))
      .join(" + ");
    
    const outputs = [node.reaction.product1, node.reaction.product2, node.reaction.product3]
      .filter(Boolean)
      .map(id => UIHelper.getMaterialName(id))
      .join(" + ");
    
    selection.append("title").text(`Reaction (Speed: ${node.reaction.reactionRate})\n${inputs} → ${outputs}`);
  }
  
  _handleNodeClick(event, node, allNodes, linkArray) {
    event.stopPropagation();
    
    // Double click on tag
    if (event.detail === 2 && node.type === "tag") {
      this.state.toggleTagVisibility(node.id);
      return;
    }
    
    // Ctrl+Shift+click → wiki
    if (event.shiftKey && event.ctrlKey && node.type === "material") {
      const wikiUrl = node.material?.wikipage
        ? `${CONFIG.urls.wikiBase}${encodeURIComponent(node.material.wikipage)}`
        : "";
      
      if (wikiUrl) {
        window.open(wikiUrl, "_blank");
      } else {
        UIHelper.showNotification("No wiki page found for this material");
      }
      return;
    }
    
    // Shift+click → select as product
    if (!event.ctrlKey && event.shiftKey && node.type === "material") {
      if (this.state.selectProduct(node.id)) {
        eventBus.emit("stateChanged", this.state);
      } else {
        UIHelper.showNotification("No valid reactions with this product");
      }
      return;
    }
    
    // Ctrl+click → select as reagent
    if (event.ctrlKey && !event.shiftKey && node.type === "material") {
      if (this.state.selectReagent(node.id)) {
        eventBus.emit("stateChanged", this.state);
      } else {
        UIHelper.showNotification("No valid reactions with this reagent");
      }
      return;
    }
    
    // Regular click → highlight
    this._highlightConnections(node, allNodes, linkArray);
  }
  
  _highlightConnections(node, allNodes, linkArray) {
    this._resetHighlighting(allNodes);
    
    if (node.type === "material" || node.type === "tag") {
      allNodes.filter(n => n.id === node.id)
        .select(".node-background")
        .attr("stroke", CONFIG.graph.colors.nodeStrokeHighlight)
        .attr("stroke-width", CONFIG.graph.sizes.strokeWidthHighlight);
      
      if (node.type === "tag") {
        const materialIds = this.dataRepo.resolveTag(node.id);
        materialIds.forEach(materialId => {
          allNodes.filter(n => n.id === materialId)
            .select(".node-background")
            .attr("stroke", CONFIG.graph.colors.tagVisible)
            .attr("stroke-width", CONFIG.graph.sizes.strokeWidthMedium);
        });
      }
      
      const connectedReactionIds = new Set();
      linkArray.forEach(link => {
        if (link.source.id === node.id && link.target.type === "reaction") {
          connectedReactionIds.add(link.target.id);
        }
        if (link.target.id === node.id && link.source.type === "reaction") {
          connectedReactionIds.add(link.source.id);
        }
      });
      
      connectedReactionIds.forEach(reactionId => {
        allNodes.filter(n => n.id === reactionId)
          .select(".reaction-circle")
          .attr("stroke", CONFIG.graph.colors.nodeStrokeHighlight)
          .attr("stroke-width", CONFIG.graph.sizes.strokeWidthHighlight);
        
        linkArray.forEach(link => {
          if (link.source.id === reactionId && (link.target.type === "material" || link.target.type === "tag")) {
            allNodes.filter(n => n.id === link.target.id)
              .select(".node-background")
              .attr("stroke", CONFIG.graph.colors.outputHighlight)
              .attr("stroke-width", CONFIG.graph.sizes.strokeWidthMedium);
          }
          if (link.target.id === reactionId && (link.source.type === "material" || link.source.type === "tag")) {
            allNodes.filter(n => n.id === link.source.id)
              .select(".node-background")
              .attr("stroke", CONFIG.graph.colors.inputHighlight)
              .attr("stroke-width", CONFIG.graph.sizes.strokeWidthMedium);
          }
        });
      });
      
      const allConnectedIds = this._getConnectedNodeIds(node.id, node.type, linkArray);
      
      allNodes.style("opacity", n => allConnectedIds.has(n.id) ? CONFIG.graph.opacities.default : CONFIG.graph.opacities.dimmed);
      
      d3.selectAll(".link-group").style("opacity", l => 
        (allConnectedIds.has(l.source.id) && allConnectedIds.has(l.target.id)) ? 
        (l.type === "tag-association" ? CONFIG.graph.opacities.tagAssociation : CONFIG.graph.opacities.default) : 
        CONFIG.graph.opacities.veryDimmed
      );
      
    } else if (node.type === "reaction") {
      allNodes.filter(n => n.id === node.id)
        .select(".reaction-circle")
        .attr("stroke", CONFIG.graph.colors.nodeStrokeHighlight)
        .attr("stroke-width", CONFIG.graph.sizes.strokeWidthHighlight);
      
      const connectedMaterialIds = new Set();
      linkArray.forEach(link => {
        if (link.source.id === node.id && (link.target.type === "material" || link.target.type === "tag")) {
          connectedMaterialIds.add(link.target.id);
        }
        if (link.target.id === node.id && (link.source.type === "material" || link.source.type === "tag")) {
          connectedMaterialIds.add(link.source.id);
        }
      });
      
      connectedMaterialIds.forEach(materialId => {
        allNodes.filter(n => n.id === materialId)
          .select(".node-background")
          .attr("stroke", CONFIG.graph.colors.nodeStrokeHighlight)
          .attr("stroke-width", CONFIG.graph.sizes.strokeWidthMedium);
      });
      
      const allConnectedIds = new Set([node.id, ...connectedMaterialIds]);
      
      allNodes.style("opacity", n => allConnectedIds.has(n.id) ? CONFIG.graph.opacities.default : CONFIG.graph.opacities.dimmed);
      
      d3.selectAll(".link-group").style("opacity", l => 
        (allConnectedIds.has(l.source.id) && allConnectedIds.has(l.target.id)) ? 
        (l.type === "tag-association" ? CONFIG.graph.opacities.tagAssociation : CONFIG.graph.opacities.default) : 
        CONFIG.graph.opacities.veryDimmed
      );
    }
  }
  
  _getConnectedNodeIds(nodeId, nodeType, linkArray) {
    const connected = new Set([nodeId]);
    
    if (nodeType === "material" || nodeType === "tag") {
      const connectedReactions = new Set();
      linkArray.forEach(link => {
        if (link.source.id === nodeId && link.target.type === "reaction") {
          connectedReactions.add(link.target.id);
        }
        if (link.target.id === nodeId && link.source.type === "reaction") {
          connectedReactions.add(link.source.id);
        }
      });
      
      connectedReactions.forEach(id => connected.add(id));
      
      connectedReactions.forEach(reactionId => {
        linkArray.forEach(link => {
          if (link.source.id === reactionId && (link.target.type === "material" || link.target.type === "tag")) {
            connected.add(link.target.id);
          }
          if (link.target.id === reactionId && (link.source.type === "material" || link.source.type === "tag")) {
            connected.add(link.source.id);
          }
        });
      });
      
      if (nodeType === "tag") {
        const materialIds = this.dataRepo.resolveTag(nodeId);
        materialIds.forEach(materialId => connected.add(materialId));
      }
    }
    
    return connected;
  }
  
  _resetHighlighting(allNodes) {
    allNodes.style("opacity", CONFIG.graph.opacities.default);
    
    d3.selectAll(".link-group").style("opacity", d => {
      if (d.type === "tag-association") return CONFIG.graph.opacities.tagAssociation;
      return CONFIG.graph.opacities.linkDefault;
    });
    
    allNodes.select(".node-background, .reaction-circle")
      .attr("stroke", CONFIG.graph.colors.nodeStroke)
      .attr("stroke-width", CONFIG.graph.sizes.strokeWidth);
  }
  
  _handleResize(container, svg) {
    const width = container.clientWidth;
    const height = Math.max(CONFIG.graph.layout.minHeight, width * CONFIG.graph.layout.heightRatio);
    
    svg.attr("width", width)
      .attr("height", height)
      .attr("viewBox", `0 0 ${width} ${height}`);
  }
}

const graphRenderer = new GraphRenderer(dataRepo, appState);
```

```js
class LegendManager {
  static create() {
    const existingLegend = document.getElementById("graph-legend");
    if (existingLegend) existingLegend.remove();
    
    const legendContainer = document.createElement("div");
    legendContainer.id = "graph-legend";
    legendContainer.className = "card";
    legendContainer.style.cssText = "margin-top:10px;padding:15px;background-color:rgba(0,0,0,0.7);border-radius:8px;color:#fff;font-size:14px;max-width:100%;";
    
    legendContainer.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px;border-bottom:1px solid #555;padding-bottom:10px;">
        <h3 style="margin:0;font-size:16px;">Graph Legend</h3>
        <div id="legend-toggle" style="cursor:pointer;font-size:18px;padding:0 8px;background:#555;border-radius:4px;">−</div>
      </div>
      <div id="legend-content">
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:15px;">
          ${this._getNodesSection()}
          ${this._getConnectionsSection()}
          ${this._getInteractionsSection()}
        </div>
      </div>
    `;
    
    const tableContainer = document.getElementById("tableContainer");
    if (tableContainer?.parentNode) {
      tableContainer.parentNode.appendChild(legendContainer);
      this._setupToggle();
    }
  }
  
  static _getNodesSection() {
    return `
      <div>
        <h4 style="margin:0 0 10px 0;color:#45b7d1;">NODES</h4>
        <div style="display:flex;align-items:center;margin-bottom:8px;">
          <svg width="24" height="24">
            <circle cx="12" cy="12" r="10" fill="${CONFIG.graph.colors.materialNodeOutput}" stroke="${CONFIG.graph.colors.nodeStroke}" stroke-width="2"></circle>
          </svg>
          <span style="margin-left:10px;">Material</span>
        </div>
        <div style="display:flex;align-items:center;margin-bottom:8px;">
          <svg width="24" height="24">
            <circle cx="12" cy="12" r="8" fill="${CONFIG.graph.colors.reactionNode}" stroke="${CONFIG.graph.colors.nodeStroke}" stroke-width="2"></circle>
            <text x="12" y="16" text-anchor="middle" fill="#fff" font-size="10" font-weight="bold">5</text>
          </svg>
          <span style="margin-left:10px;">Reaction (number = speed)</span>
        </div>
        <div style="display:flex;align-items:center;margin-bottom:8px;">
          <svg width="24" height="24">
            <circle cx="12" cy="12" r="8" fill="${CONFIG.graph.colors.tagNode}" stroke="${CONFIG.graph.colors.tagVisible}" stroke-width="2" stroke-dasharray="4,2"></circle>
            <image x="8" y="8" width="8" height="8" xlink:href="${CONFIG.urls.imageBase}/images/icons/eye-open.svg"></image>
          </svg>
          <span style="margin-left:10px;">Tag (group of materials)</span>
        </div>
      </div>
    `;
  }
  
  static _getConnectionsSection() {
    return `
      <div>
        <h4 style="margin:0 0 10px 0;color:#45b7d1;">CONNECTIONS</h4>
        <div style="display:flex;align-items:center;margin-bottom:8px;">
          <svg width="24" height="24">
            <line x1="2" y1="12" x2="22" y2="12" stroke="${CONFIG.graph.colors.inputArrow}" stroke-width="2" stroke-dasharray="5,5"></line>
          </svg>
          <span style="margin-left:10px;">Input/Reagent → reaction</span>
        </div>
        <div style="display:flex;align-items:center;margin-bottom:8px;">
          <svg width="24" height="24">
            <line x1="2" y1="12" x2="22" y2="12" stroke="${CONFIG.graph.colors.outputArrow}" stroke-width="2"></line>
          </svg>
          <span style="margin-left:10px;">reaction → Output/Product</span>
        </div>
        <div style="display:flex;align-items:center;margin-bottom:8px;">
          <svg width="24" height="24">
            <line x1="2" y1="12" x2="22" y2="12" stroke="${CONFIG.graph.colors.tagNode}" stroke-width="1.5" stroke-opacity="0.7"></line>
          </svg>
          <span style="margin-left:10px;">Tag association</span>
        </div>
      </div>
    `;
  }
  
  static _getInteractionsSection() {
    return `
      <div>
        <h4 style="margin:0 0 10px 0;color:#45b7d1;">INTERACTIONS</h4>
        <div style="display:flex;align-items:flex-start;margin-bottom:8px;">
          <div style="min-width:40px;text-align:center;font-weight:bold;background:#555;border-radius:4px;margin-right:10px;padding:2px 4px;">Dbl Click</div>
          <span>Tag: Show/hide all materials in tag</span>
        </div>
        <div style="display:flex;align-items:flex-start;margin-bottom:8px;">
          <div style="min-width:40px;text-align:center;font-weight:bold;background:#555;border-radius:4px;margin-right:10px;padding:2px 4px;">Ctrl+Click</div>
          <span>Material: Set as reagent</span>
        </div>
        <div style="display:flex;align-items:flex-start;margin-bottom:8px;">
          <div style="min-width:40px;text-align:center;font-weight:bold;background:#555;border-radius:4px;margin-right:10px;padding:2px 4px;">Shift+Click</div>
          <span>Material: Set as product</span>
        </div>
        <div style="display:flex;align-items:flex-start;margin-bottom:8px;">
          <div style="min-width:40px;text-align:center;font-weight:bold;background:#555;border-radius:4px;margin-right:10px;padding:2px 4px;">Ctrl+Shift+Click</div>
          <span>Material: Open wiki page</span>
        </div>
        <div style="display:flex;align-items:flex-start;">
          <div style="min-width:40px;text-align:center;font-weight:bold;background:#555;border-radius:4px;margin-right:10px;padding:2px 4px;">Click</div>
          <span>Background: Reset highlighting</span>
        </div>
      </div>
    `;
  }
  
  static _setupToggle() {
    const legendToggle = document.getElementById("legend-toggle");
    const legendContent = document.getElementById("legend-content");
    const legendContainer = document.getElementById("graph-legend");
    
    if (!legendToggle || !legendContent || !legendContainer) return;
    
    let isVisible = true;
    legendToggle.addEventListener("click", () => {
      isVisible = !isVisible;
      legendContent.style.display = isVisible ? "block" : "none";
      legendToggle.textContent = isVisible ? "−" : "+";
      legendContainer.style.padding = isVisible ? "15px" : "10px 15px";
    });
  }
}
```

```js
class UIController {
  constructor(state, reactionFilter) {
    this.state = state;
    this.reactionFilter = reactionFilter;
  }
  
  createShareButton() {
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
  
  createResetButton() {
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
  
  createExportButton() {
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
    
    graphRenderer.render(filteredReactions);
    this.state.updateURL();
  }
}

const uiController = new UIController(appState, reactionFilter);

const shareButton = uiController.createShareButton();
const resetButton = uiController.createResetButton();
const speedSlider = uiController.createSpeedSlider();
const exportButton = uiController.createExportButton();
```

```js
class ChoicesInitializer {
  constructor(state, uiController) {
    this.state = state;
    this.uiController = uiController;
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
        
        const imageUrl = UIHelper.getMaterialImageUrl(data.value || "");
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
        
        const imageUrl = UIHelper.getMaterialImageUrl(data.value || "");
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
  
  async initialize() {
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
        choices: reactionFilter.getAvailableReagents(this.state.selectedReagents, this.state.selectedProduct),
        searchEnabled: true,
        renderSelectedChoices: "auto",
        callbackOnCreateTemplates: this.createChoicesTemplates,
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
        choices: reactionFilter.getAvailableProducts(this.state.selectedReagents),
        searchEnabled: true,
        renderSelectedChoices: "always",
        maxItemText: () => "You can only search for one product at a time",
        callbackOnCreateTemplates: this.createChoicesTemplates,
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
    eventBus.on("stateChanged", () => {
      this.uiController.updateChoicesOptions();
      this.uiController.updateUI();
    });
  }
}

const choicesInitializer = new ChoicesInitializer(appState, uiController);

// Initialize app
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => choicesInitializer.initialize());
} else {
  choicesInitializer.initialize();
}
```

<div class="grid grid-cols-4 gap-1" style="margin-bottom: 1rem; width: 100%; box-sizing: border-box;">
  <div class="card grid-colspan-2" style="width: 100%; max-width: 100%; overflow: hidden; box-sizing: border-box;">
    <select id="choicesSelector" multiple></select>
  </div>
  <div class="card grid-colspan-1" style="width: 100%; max-width: 100%; overflow: hidden; box-sizing: border-box;">
    <select id="productChoicesSelector" multiple></select>
  </div>
  <div class="card grid-colspan-1" style="width: 100%; max-width: 100%; overflow: hidden; box-sizing: border-box; font-size: 0.9rem;">
    <h2 id="reactionsCount" style="margin: 0; font-size: 0.9rem;">Reactions found: <code class="bigger-number-better">317</code></h2>
  </div>
</div>
<div class="grid grid-cols-3 gap-1" style="width: 100%; box-sizing: border-box; margin-bottom: 1rem;">
  <div class="card grid-colspan-1" style="width: 100%; max-width: 100%; overflow: hidden; box-sizing: border-box;">
    ${resetButton} ${shareButton} ${exportButton}
  </div>
  <div class="card grid-colspan-1" style="width: 100%; max-width: 100%; overflow: hidden; box-sizing: border-box; padding: 15px;">${speedSlider}</div>
</div>
<div class="grid grid-cols-1 grid-rowspan-1" style="grid-auto-rows: auto">
  <div class="card" id="tableContainer"></div>
</div>