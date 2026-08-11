// ============================================================================
// CONFIGURATION
// ============================================================================

export const CONFIG = {
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
      textLight: "#ffffff",
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
      chargeStrength: -400,
    },
    opacities: {
      default: 1,
      linkDefault: 0.7,
      tagAssociation: 0.3,
      dimmed: 0.15,
      veryDimmed: 0.05,
      hidden: 0,
    },
    animations: {
      duration: 200,
    },
    layout: {
      heightRatio: 0.6,
      minHeight: 600,
      labelOffsetMaterial: 20,
      labelOffsetReaction: 15,
      imageScale: 2,
      imagePosition: 0.65,
    },
    constraints: {
      maxReactions: 316,
      maxNameLength: 30,
      truncatedNameLength: 20,
    },
  },
  ui: {
    debounceDelay: 100,
    notificationDuration: 2500,
    maxReagentSelection: 3,
    maxProductSelection: 1,
  },
  urls: {
    imageBase: "https://noita-bartender-images.acidflow.stream",
    wikiBase: "https://noita.wiki.gg/wiki/",
  },
  // Configuration for the multi-selection "reaction set" feature.
  reactionSets: {
    // Maximum number of reaction sets a user can create in parallel.
    maxSets: 8,
    // Default color palette assigned to new sets, used for the union rings on the graph.
    defaultColors: ["#ff6b6b", "#45b7d1", "#ffd93d", "#6bcb77", "#c77dff", "#ff9f1c", "#f72585", "#4cc9f0"],
    // localStorage key used to persist named configurations (save/load feature).
    storageKey: "noitalambic.reactionSets.savedConfigs",
  },
  // Default values for the advanced reaction filters available per reaction set.
  advancedFilters: {
    minReagentCount: 0,
    maxReagentCount: 3,
    minProductCount: 0,
    maxProductCount: 3,
  },
};
