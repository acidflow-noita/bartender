// ============================================================================
// CONFIGURATION
// ============================================================================

export const CONFIG = {
  graph: {
    // Colorblind-friendly as checked with the dataviz palette validator on the dark graph surface
    // (CVD-simulated OKLab distance >= 8 for each pair that must be told apart): input green /
    // output cyan 18.9 (input links are also dashed), reaction coral / tag orange 11.5. Two tweaks
    // to the original palette, same hues: tag links pale orange (plain orange read like input
    // green, 3.1 -> 9.6) and hidden-tag red deeper (shown green / hidden red, 3.5 -> 16.7; the eye
    // icon doubles it).
    colors: {
      reactionNode: "#ff6b6b",
      materialNodeDefault: "#505050",
      materialNodeOutput: "#45b7d1",
      tagNode: "#ffa500",
      tagAssociation: "#ffcf85",
      tagVisible: "#24c93a",
      tagHidden: "#c43c3c",
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
    },
    // Force layout presets, selectable from the graph settings ("Layout"). Each runs in two
    // phases: a strong, long-range repulsion (untangleCharge) first spreads the graph out so edges
    // can uncross, then once the simulation has cooled below compactAlpha the repulsion drops to
    // compactCharge so links + gravity pull everything back together. compactAlpha 0 means a
    // single phase. 0.3 keeps the untangle burst short (~50 ticks, under a second): waiting down
    // to 0.05 (~130 ticks) measured only ~3% fewer crossings. Tag -> material links use tagLinkStrength, so a tag with many materials can
    // fan out instead of dragging its whole star tight against the rest of the graph.
    // degreeCharge scales each node's repulsion by its connectivity, charge * (1 + k * (sqrt(degree)
    // - 1)): hubs (water, fire, big tags) push harder and get room for their star, which keeps tag
    // stars from swallowing the reactions around them on big graphs. 0 = uniform repulsion.
    // Tuned on saved configs (Hastium, Pheromone, Australium, Blue Fire) and on large graphs (the
    // whole base game, water/steam/blood sets), with and without tag materials shown, measuring
    // edge crossings and labels cut by edges or covered by nodes.
    defaultForcePreset: "balanced",
    forcePresets: {
      balanced: {
        label: "Balanced",
        linkDistance: 110, linkStrength: 0.8, tagLinkStrength: 0.3,
        untangleCharge: -2200, compactCharge: -350, compactAlpha: 0.3, chargeDistanceMax: 800,
        gravity: 0.02, collisionPadding: 25, degreeCharge: 1,
      },
      compact: {
        label: "Compact",
        linkDistance: 85, linkStrength: 0.8, tagLinkStrength: 0.3,
        untangleCharge: -1500, compactCharge: -200, compactAlpha: 0.3, chargeDistanceMax: 800,
        gravity: 0.04, collisionPadding: 18, degreeCharge: 1,
      },
      spacious: {
        label: "Spacious",
        linkDistance: 140, linkStrength: 0.7, tagLinkStrength: 0.3,
        untangleCharge: -3000, compactCharge: -600, compactAlpha: 0.3, chargeDistanceMax: 1200,
        gravity: 0.01, collisionPadding: 30, degreeCharge: 1,
      },
      // The original single-phase layout: no gravity, unbounded repulsion, d3's default link strength.
      classic: {
        label: "Classic",
        linkDistance: 120, linkStrength: null, tagLinkStrength: null,
        untangleCharge: -400, compactCharge: -400, compactAlpha: 0, chargeDistanceMax: Infinity,
        gravity: 0, collisionPadding: 15, degreeCharge: 0,
      },
    },
    // Grids nodes can be snapped to ("Grid snapping" in the graph settings). A grid force keeps
    // pulling each node toward its own lattice point while the layout settles, then every node
    // lands exactly on its point; dragged nodes move cell to cell. Spacing leaves room for a node and
    // its label (labels are wider than nodes, hence the wider-than-tall rectangular grid).
    // staggered shifts odd rows by half a column: with dy = dx * sqrt(3) / 2, a hexagonal lattice.
    snapGrids: {
      square: { label: "Square", dx: 90, dy: 90 },
      rectangular: { label: "Rectangular", dx: 130, dy: 85 },
      hexagonal: { label: "Hexagonal", dx: 110, dy: 95, staggered: true },
    },
    snapAnimationMs: 300,
    // Pull of each free node toward its own grid cell, per tick (scaled by alpha).
    snapPhysicsStrength: 0.4,
    // Snap as soon as the layout looks settled rather than when d3 fully stops (alpha 0.001, ~5 s):
    // below this alpha nodes only creep, so the simulation is stopped there and nodes snap
    // (~2 s after a re-layout). While a layout is running the grid backdrop is dimmed, to show
    // snapping is suspended until it settles.
    snapAlpha: 0.05,
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
      // Material textures are drawn centered on the node, clipped to its circle. imageScale is the
      // texture's pixel scale: 1 = native pixels (crisp, the circle shows the texture's middle
      // ~50px), 2 = zoomed in twice (the previous look). Textures are textureSize px square.
      imageScale: 1,
      textureSize: 252,
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
    // Default color palette assigned to new sets (cycled), used for the union rings on the graph.
    // Adjacent colors pass the CVD validator (worst pair 10.9).
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
