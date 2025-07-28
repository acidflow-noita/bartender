---
title: Spells' Digging Ability
---

<link href="custom.css" rel="stylesheet"></link>

<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
  <h1 id="acidTitle" class="bartender-heading-decrypted" style="margin: 0;">Spells' Digging Ability</h1>
  <div id="auth-status-container"></div>
</div>
<h2>Select a spell and a material to see how effectively the spell can dig through it.</h2>

```js
const all_spells = await FileAttachment("./data/FULL_SPELLS_FINAL.json").json();
const all_materials = await FileAttachment("./data/FULL_MATERIALS_FINAL.json").json();

const authState = await authManager.checkAuth();

const spells =
  authState.authenticated && authState.isFollower
    ? all_spells
    : all_spells.filter((d) => ["SPARK_BOLT", "DIGGING_BOLT"].includes(d.id));

const materials =
  authState.authenticated && authState.isFollower
    ? all_materials
    : all_materials.filter((d) => ["dirt", "rock"].includes(d.id));
```

```js
import { createContentNotice } from "./components/contentNotice.js";
const contentNotice = createContentNotice(authState, {
  spells: spells.length,
  materials: materials.length,
  totalSpells: all_spells.length,
  totalMaterials: all_materials.length,
});

contentNotice;
```

```js
const mina = {
  img_src: "https://noita-bartender-images.acidflow.stream/images/mina/mina.png",
  img_outline_src: "https://noita-bartender-images.acidflow.stream/images/mina/mina_outline.png",
};
```

```js
import { initializeTitleAnimation } from "./components/titleAnimation.js";
initializeTitleAnimation();
import { authManager, renderAuthStatus } from "./components/auth.js";
import { html } from "htl";
const authStatusCleanup = renderAuthStatus();
```

```js
const groundIgnoringDiggingSpells = spells.filter(
  (d) => "groundPenetrationCoeff" in d && d.groundPenetrationCoeff !== 0 && d.groundPenetrationCoeff !== null
);
const spellsWithDiggingTag = spells.filter((d) => d.tags.includes("digging"));
```

```js
const resetSearchButton = Inputs.button(
  html`<img src="https://noita-bartender-images.acidflow.stream/images/icons/arrow-counterclockwise.svg" />Reset`,
  {
    label: "",
    reduce: () => {
      searchMaterials.query = "";
      searchMaterials.dispatchEvent(new Event("input"));
      searchSpells.query = "";
      searchSpells.dispatchEvent(new Event("input"));
      return null;
    },
  }
);
```

```js
const getImagePath = (filename) => {
  const baseUrl = "https://noita-bartender-images.acidflow.stream/images/materials";
  return `${baseUrl}/${filename ? filename : "no_image_available.png"}`;
};
```

```js
// --- Spell Setup ---
spells.forEach((spell) => {
  spell.combinedSpellName = {
    name: spell.name,
    id: spell.id,
    fullName: `${spell.name} (${spell.id})`,
    url: `https://noita.wiki.gg/wiki/${encodeURIComponent(spell.wikipage)}`,
  };
});
```

```js
// const searchSpells = Inputs.search(spells, {
const searchSpells = Inputs.search(spellsWithDiggingTag, {
  placeholder: "Search spells",
  query: "",
  autocomplete: true,
});
```

```js
const searchSpellsValue = Generators.input(searchSpells);
```

```js
const filteredSpells = searchSpellsValue.filter(
  (d) => d.tags && (d.tags.includes("digging") || d.tags.includes("acid"))
);
```

```js
// --- Material Setup ---
materials.forEach((material) => {
  material.combinedMaterialName = {
    name: material.name,
    id: material.id,
    type: material.type,
    fullName: `${material.name} (${material.id})`,
    url: `https://noita.wiki.gg/wiki/${encodeURIComponent(material.wikipage)}`,
  };
});
```

```js
const searchMaterials = Inputs.search(materials, {
  placeholder: "Search materials",
  query: "",
  autocomplete: true,
});
```

```js
const searchMaterialsValue = Generators.input(searchMaterials);
```

```js
// --- Digging Calculation ---
const calculateDigRadius = (spell, material) => {
  if (!spell || !material) return 0;

  // Black holes ignore durability and hardness
  if (spell.id === "BLACK_HOLE" || spell.id === "BLACK_HOLE_BIGGER" || spell.id === "GIGA_BLACK_HOLE") {
    return spell.radius;
  }

  const materialDurability = material.durability ?? 999999;
  const spellMaxDura = spell.maxDuraToDestroy ?? 0;

  // Boolean check: can the spell dig through this material's durability?
  if (spellMaxDura < materialDurability) return 0;

  const materialHardness = material.hardness ?? 0;
  const rayEnergy = spell.rayEnergy ?? 0;
  const spellRadius = spell.radius ?? 0;

  // If ray energy per pixel can't overcome hardness, no digging
  if (rayEnergy <= materialHardness) return 0;

  // Effective energy after overcoming per-pixel hardness
  const effectiveEnergy = rayEnergy - materialHardness;

  // Scale the radius based on remaining energy vs original energy
  const practicalRadius = spellRadius * (effectiveEnergy / rayEnergy);

  return Math.max(0, practicalRadius);
};
```

```js
// Independent spell table (not filtered by material selection)
// const spellsTable = Inputs.table(filteredSpells, {
const spellsTable = Inputs.table(spellsWithDiggingTag, {
  width: { combinedSpellName: 250 },
  layout: "fixed",
  sort: "rayEnergy",
  reverse: true,
  select: "first",
  multiple: false,
  rows: 22,
  columns: [
    "combinedSpellName",
    "image_local",
    "radius",
    "maxDuraToDestroy",
    "rayEnergy",
    "groundPenetrationCoeff",
    "groundPenetrationMaxDura",
    "groundPenetrationCoeff",
    "groundPenetrationMaxDura",
    "spawnEntity",
    "spawnEntityIsProjectile",
    "cellEaterRadius",
    "cellEaterLimitedMaterials",
    "cellEaterIgnoredMaterialTag",
    "cellEaterMaterials",
  ],
  header: {
    combinedSpellName: "Spell",
    image_local: "Image",
    radius: "Radius",
    maxDuraToDestroy: "Max Dura To Destroy",
    rayEnergy: "Ray Energy",
  },
  format: {
    combinedSpellName: (d) =>
      html`<a
        href="${d.url}"
        target="_blank"
        >${d.name}<br />(${d.id})</a
      >`,
    image_local: (d) =>
      html`<img
        src="https://noita-bartender-images.acidflow.stream/images/spells/${d}"
        style="image-rendering: pixelated;"
        width="64"
        height="auto"
      />`,
  },
});
```

```js
const selectedSpell = Generators.input(spellsTable);
```

```js
// Filter materials based on selected spell
const materialsToShow = selectedSpell
  ? searchMaterialsValue.filter((material) => calculateDigRadius(selectedSpell, material) > 0)
  : searchMaterialsValue;
```

```js
const materialsTable = Inputs.table(materialsToShow, {
  width: { combinedMaterialName: 250 },
  layout: "fixed",
  sort: "name",
  select: "first",
  multiple: false,
  columns: ["combinedMaterialName", "image_local", "hardness", "durability"],
  header: {
    combinedMaterialName: "Material",
    image_local: "Image",
    hardness: "Hardness",
    durability: "Durability",
  },
  format: {
    combinedMaterialName: (d) =>
      html`<a
        href="${d.url}"
        target="_blank"
        >${d.name}<br />(<code>${d.id}</code>)</a
      >`,
    image_local: (d) =>
      html`<img
        src="${getImagePath(d)}"
        width="32"
        height="auto"
        style="image-rendering: pixelated;"
      />`,
  },
});
```

```js
const selectedMaterial = Generators.input(materialsTable);
```

```js
const digRadius = calculateDigRadius(selectedSpell, selectedMaterial);
```

```js
const plotResult = (() => {
  if (!selectedSpell || !selectedMaterial) {
    return html`<div class="card-placeholder">Select both a spell and a material to see the visualization.</div>`;
  }

  const plotWidth = 252;
  const materialImageUrl = getImagePath(selectedMaterial.image_local);

  return Plot.plot({
    width: plotWidth,
    height: plotWidth,
    style: {
      background: `url(${materialImageUrl})`,
    },
    x: { axis: null },
    y: { axis: null },
    marks: [
      Plot.dot([{ x: 0, y: 0 }], {
        x: "x",
        y: "y",
        r: digRadius,
        stroke: "red",
        strokeWidth: 4,
        fill: "rgba(255, 0, 0, 0.2)",
      }),
      Plot.text([{ x: 0, y: 0, label: `Dig Radius: ${digRadius.toFixed(2)}` }], {
        x: "x",
        y: "y",
        text: "label",
        dy: -10,
        fill: "white",
        stroke: "black",
        strokeWidth: 2,
      }),
      Plot.image([{ x: plotWidth, y: plotWidth }], {
        frameAnchor: "bottom-right",
        imageRendering: "pixelated",
        preserveAspectRatio: "xMaxYMid meet",
        dx: -53,
        dy: -53,
        src: mina.img_outline_src,
        width: 108,
      }),
    ],
  });
})();
```

${contentNotice}

<div class="grid grid-cols-4 gap-4">
  <div class="card grid-colspan-2">${searchSpells}</div>
  <div class="card grid-colspan-1">${searchMaterials}</div>
  <div class="card grid-colspan-1">${resetSearchButton}</div>
</div>

<div class="grid grid-cols-4 gap-4">
  <div class="card grid-colspan-2" style="padding: 0">${spellsTable}</div>
  <div class="card grid-colspan-2" style="padding: 0">${materialsTable}</div>
</div>

<div class="grid grid-cols-4 gap-4">
  <div class="card grid-colspan-4">${plotResult}</div>
</div>
