---
draft: false
title: Reactions Finder
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

<style>
  /* Two-column layout: existing content on the left, the new reaction set management panel
     on the right. The right column is "auto"-sized so it shrinks to a slim tab when the panel
     is hidden (see ReactionSetPanel's own hide/show button). Falls back to a single stacked
     column on narrow screens. */
  .noitalambic-layout {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 1rem;
    align-items: start;
    width: 100%;
    box-sizing: border-box;
  }
  .noitalambic-side {
    position: sticky;
    top: 1rem;
  }
  @media (max-width: 900px) {
    .noitalambic-layout {
      grid-template-columns: 1fr;
    }
    .noitalambic-side {
      position: static;
    }
  }
</style>

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
import { ReactionSetWorkspace } from "./noitalambic/core/ReactionSetWorkspace.js";
import { ReactionGroupResolver } from "./noitalambic/core/ReactionGroupResolver.js";
import { ShortcutManager } from "./noitalambic/core/ShortcutManager.js";
import { ReactionFilter } from "./noitalambic/filters/ReactionFilter.js";
import { GraphDataBuilder } from "./noitalambic/graph/GraphDataBuilder.js";
import { GraphRenderer } from "./noitalambic/graph/GraphRenderer.js";
import { UIController } from "./noitalambic/ui/UIController.js";
import { UIHelper } from "./noitalambic/ui/UIHelper.js";
import { ReactionSetPanel } from "./noitalambic/ui/ReactionSetPanel.js";
import { injectNotificationStyles } from "./noitalambic/utils/styles.js";

// Inject notification styles
injectNotificationStyles();

// Initialize core components
const eventBus = new EventBus();
const dataRepo = new DataRepository(materials, reactionSources, materialAssociations);
const appState = new AppState(eventBus, dataRepo);
const reactionFilter = new ReactionFilter(dataRepo);
const graphDataBuilder = new GraphDataBuilder(dataRepo);

// Configurable click+modifier shortcuts (default: Alt+Click / Alt+Shift+Click) to quickly add a
// clicked material to a brand new reaction set. Reserved combos (plain click, Ctrl, Shift,
// Ctrl+Shift) can never be reassigned, so the legacy click behaviors below are never at risk.
const shortcutManager = new ShortcutManager();

// Multi reaction set feature: several reagent/product selections ("sets") can be organized into
// an arbitrarily nested tree of groups, each with its own union / intersection / difference /
// symmetric-difference mode, plus per-set advanced filters (e.g. excluding catalyst reactions).
// See noitalambic/README_INTEGRATION.md.
const reactionSetWorkspace = new ReactionSetWorkspace(eventBus);
const reactionGroupResolver = new ReactionGroupResolver(reactionFilter);

// Quickly creates a new top-level reaction set from a material clicked with a configured
// shortcut combo (see ShortcutManager above). The new set always lands in the root group; drag
// it into a sub-group afterward with the panel's drag handles if needed.
function quickAddMaterialToNewSet(materialId, role) {
  const material = dataRepo.getMaterial(materialId);
  const name = material?.name || materialId;
  const overrides = { name };
  if (role === "reagent") overrides.reagents = [materialId];
  else overrides.product = materialId;

  const newSet = reactionSetWorkspace.createSet(reactionSetWorkspace.tree.rootId, overrides);
  if (!newSet) {
    UIHelper.showNotification("Maximum number of sets reached");
    return;
  }
  reactionSetPanel.rebuild();
  UIHelper.showNotification(`Added "${name}" as ${role} to a new set`);
}

const graphRenderer = new GraphRenderer(dataRepo, appState, graphDataBuilder, shortcutManager, quickAddMaterialToNewSet);

// Initialize UI components. reactionSetWorkspace is passed so Share/Reset also account for the
// active reaction sets and groups.
const uiController = new UIController(appState, reactionFilter, graphRenderer, dataRepo, reactionSetWorkspace);

const reactionSetPanel = new ReactionSetPanel({
  workspace: reactionSetWorkspace,
  resolver: reactionGroupResolver,
  reactionFilter,
  dataRepo,
  eventBus,
  ChoicesLib: Choices,
  shortcutManager,
  onSetsResolved: (result) => uiController.updateUIFromResolvedSets(result),
});
// Let the Reset button (see UIController.createResetButton) also rebuild the panel.
uiController.reactionSetPanel = reactionSetPanel;

// Create UI controls
const shareButton = uiController.createShareButton(Inputs, htl);
const resetButton = uiController.createResetButton(Inputs, htl);
const exportButton = uiController.createExportButton(Inputs, htl);
const sourceSelector = uiController.createSourceSelector();

// Changing the reaction source can make some previously selected materials invalid (they may
// not exist in the new source's reactions). Rebuilding the panel refreshes every set's reagent/
// product dropdowns against the new source and recomputes the graph.
eventBus.on("reactionSourceChanged", () => {
  reactionSetPanel.rebuild();
});

// Ctrl+Click / Shift+Click on a graph node are quick shortcuts (see the graph legend) that set a
// single reagent/product. Mirror that quick pick onto the first reaction set (the first leaf
// under the root group) so the shortcuts stay useful now that the graph is driven by the
// multi-set panel instead of a single selection.
eventBus.on("stateChanged", () => {
  // Ctrl+Click / Shift+Click quick reagent/product picks (see ShortcutManager) mirror onto the
  // first set under the root group; if that is what changed, updating the set already triggers
  // a full panel rebuild (which refreshes the graph too).
  const firstSetId = reactionSetWorkspace.tree.root.children.find(
    (childId) => reactionSetWorkspace.tree.getNode(childId)?.type === "leaf",
  );
  const firstSet = firstSetId ? reactionSetWorkspace.manager.getSet(firstSetId) : null;

  if (firstSet) {
    const sameReagents =
      firstSet.reagents.length === appState.selectedReagents.length &&
      firstSet.reagents.every((id, i) => id === appState.selectedReagents[i]);

    if (!(sameReagents && firstSet.product === appState.selectedProduct)) {
      reactionSetWorkspace.manager.updateSet(firstSet.id, {
        reagents: appState.selectedReagents,
        product: appState.selectedProduct,
      });
      reactionSetPanel.rebuild();
      return;
    }
  }

  // Otherwise (e.g. a tag's visibility toggled from the graph's right-click menu), the set of
  // included reactions itself did not change, so just repaint the graph from the last resolved
  // result instead of re-running the resolver.
  reactionSetPanel.refreshGraphOnly();
});

// Initialize the panel once the DOM is ready (the #reactionSetPanel container below must exist).
function bootstrapReactionSetPanel() {
  // Restore a shared configuration from a "?sets=..." share link if present, otherwise start
  // with a single empty set.
  const sharedSetsParam = new URLSearchParams(window.location.search).get("sets");
  if (!sharedSetsParam || !reactionSetWorkspace.loadFromURLParam(sharedSetsParam)) {
    reactionSetWorkspace.createSet(reactionSetWorkspace.tree.rootId, { name: "Set 1" });
  }
  reactionSetPanel.mount(document.getElementById("reactionSetPanel"));
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrapReactionSetPanel);
} else {
  bootstrapReactionSetPanel();
}
```

<div class="noitalambic-layout">
<div class="noitalambic-main">

<div class="grid grid-cols-3 gap-1" style="width: 100%; box-sizing: border-box; margin-bottom: 1rem;">
  <div class="card grid-colspan-1" style="width: 100%; max-width: 100%; overflow: hidden; box-sizing: border-box;">
    ${resetButton} ${shareButton} ${exportButton}
  </div>
  <div class="card grid-colspan-1" style="width: 100%; max-width: 100%; overflow: hidden; box-sizing: border-box; padding: 15px;">${sourceSelector}</div>
  <div class="card grid-colspan-1" style="width: 100%; max-width: 100%; overflow: hidden; box-sizing: border-box; font-size: 0.9rem;">
    <h2 id="reactionsCount" style="margin: 0; font-size: 0.9rem;">Reactions found: <code class="bigger-number-better">0</code></h2>
  </div>
</div>
<div class="grid grid-cols-1 grid-rowspan-1" style="grid-auto-rows: auto">
  <div class="card" id="graphContainer"></div>
</div>

  <div style="font-size: 0.85rem; text-align: left; color: rgba(255,255,255,0.7);">
  <p style="margin: 0.5rem 0;">
    Reactions Graph visualization by 
    <a href="https://www.twitch.tv/kedesiklem" style="color: inherit; text-decoration: underline;">
      <img src="https://noita-bartender-images.acidflow.stream/images/logo/KED.svg" style="width: 40px; vertical-align: middle; margin: 0 5px;">
    </a>
  </p>
</div>

</div>
<div class="noitalambic-side">
  <div id="reactionSetPanel"></div>
</div>
</div>
