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
// DATA LOADING
// ============================================================================

const materials = await FileAttachment("./data/FULL_MATERIALS_FINAL.json").json();
const baseReactions = await FileAttachment("./data/reactions_from_materials.json").json();
const materialAssociations = await FileAttachment("./data/jsons/material_associations.json").json();

// Load extension reactions
const reactionSources = {
  base: {
    name: "Base Game",
    reactions: baseReactions,
  },

  apotheosis: {
    name: "Apotheosis",
    reactions: await FileAttachment("./data/apotheosis/reactions_apotheosis.json").json(),
  },

  apotheosis_secret: {
    name: "Apotheosis Secret",
    reactions: await FileAttachment("./data/apotheosis/reactions_apotheosis_secret.json").json(),
  },
};

try {
  const allModsReactions = await FileAttachment("./data/reactions_all_mods.json").json();
  reactionSources["all_mods"] = {
    name: "All Mods",
    reactions: allModsReactions,
  };
} catch (e) {
  console.log("All mods reactions not found, skipping");
}
```

```js
// ============================================================================
// MODULE IMPORTS
// ============================================================================

import { EventBus } from "./noitalambic/core/EventBus.js";
import { DataRepository } from "./noitalambic/core/DataRepository.js";
import { AppState } from "./noitalambic/core/AppState.js";
import { ReactionFilter } from "./noitalambic/filters/ReactionFilter.js";
import { GraphDataBuilder } from "./noitalambic/graph/GraphDataBuilder.js";
import { GraphRenderer } from "./noitalambic/graph/GraphRenderer.js";
import { UIController } from "./noitalambic/ui/UIController.js";
import { ChoicesInitializer } from "./noitalambic/ui/ChoicesInitializer.js";
import { injectNotificationStyles } from "./noitalambic/utils/styles.js";

// Inject notification styles
injectNotificationStyles();

// Initialize core components
const eventBus = new EventBus();
const dataRepo = new DataRepository(materials, reactionSources, materialAssociations);
const appState = new AppState(eventBus, dataRepo);
const reactionFilter = new ReactionFilter(dataRepo);
const graphDataBuilder = new GraphDataBuilder(dataRepo);
const graphRenderer = new GraphRenderer(dataRepo, appState, graphDataBuilder);

// Initialize UI components
const uiController = new UIController(appState, reactionFilter, graphRenderer, dataRepo);
const choicesInitializer = new ChoicesInitializer(appState, uiController, reactionFilter, eventBus, dataRepo);

// Create UI controls
const shareButton = uiController.createShareButton(Inputs, htl);
const resetButton = uiController.createResetButton(Inputs, htl);
const speedSlider = uiController.createSpeedSlider();
const exportButton = uiController.createExportButton(Inputs, htl);
const sourceSelector = uiController.createSourceSelector();

// Listen for source changes
eventBus.on("reactionSourceChanged", () => {
  uiController.updateChoicesOptions();
  uiController.updateUI();
});

// Initialize app when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => choicesInitializer.initialize(Choices));
} else {
  choicesInitializer.initialize(Choices);
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
  <div class="card grid-colspan-1" style="width: 100%; max-width: 100%; overflow: hidden; box-sizing: border-box; padding: 15px;">${sourceSelector}</div>
</div>
</div>
<div class="grid grid-cols-1 grid-rowspan-1" style="grid-auto-rows: auto">
  <div class="card" id="tableContainer"></div>
</div>
