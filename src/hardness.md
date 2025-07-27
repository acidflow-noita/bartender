---
title: Hardness (Beta)
---

<link href="custom.css" rel="stylesheet"></link>

<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
  <h1 id="acidTitle" class="bartender-heading-decrypted" style="margin: 0;">Hardness</h1>
  <div id="auth-status-container"></div>
</div>
<h2>Hardness determines resistance to damage, secondarily to <a href="durability">durability</a>.</h2>

```js
const all_materials = await FileAttachment("./data/FULL_MATERIALS_FINAL.json").json();
const all_spells = await FileAttachment("./data/FULL_SPELLS_FINAL.json").json();

const authState = await authManager.checkAuth();

const materials =
  authState.authenticated && authState.isFollower
    ? all_materials
    : all_materials.filter((d) => ["rock_static", "wood_static", "coal", "gold"].includes(d.id));

const spells =
  authState.authenticated && authState.isFollower
    ? all_spells
    : all_spells.filter((d) => ["SPARK_BOLT", "MAGIC_ARROW"].includes(d.id));
```

```js
import { createContentNotice } from "./components/contentNotice.js";
const contentNotice = createContentNotice(authState, {
  materials: materials.length,
  spells: spells.length,
  totalMaterials: all_materials.length,
  totalSpells: all_spells.length,
});

contentNotice;
```

```js
import { initializeTitleAnimation } from "./components/titleAnimation.js";
initializeTitleAnimation();
import { materialTypeColors, getSymbolConfig } from "./components/materialTypeStyles.js";
import { wuoteLogo } from "./components/wuoteLogo.js";
import { authManager, renderAuthStatus } from "./components/auth.js";
import { html } from "htl";
renderAuthStatus();
```

```js
const tableImageWidth = 32;
```

```js
const minHardness = d3.min(
  materials.filter((m) => m.hardness !== null),
  (d) => d.hardness
);
const maxHardness = d3.max(
  materials.filter((m) => m.hardness !== null),
  (d) => d.hardness
);
```

```js
const minDurability = d3.min(
  materials.filter((m) => m.durability !== null),
  (d) => d.durability
);
const maxDurability = d3.max(
  materials.filter((m) => m.durability !== null),
  (d) => d.durability
);
```

```js
const materialTypes = [...new Set(materials.map((d) => d.type).filter(Boolean))];
const typeColorMapping = materialTypes.reduce((acc, type) => {
  acc[type] = `var(--material-type-${type.toLowerCase()}-color)`;
  return acc;
}, {});
```

```js
const distinctHardness = [...new Set(materials.flatMap(({ hardness }) => hardness))].filter((d) => d !== null);
```

```js
const hardnessSelectorInput = Inputs.range([Math.min(...distinctHardness), Math.max(...distinctHardness)], {
  value: maxHardness,
  step: minHardness,
  transform: Math.log,
  format: (x) => x.toFixed(0),
  placeholder: `${minHardness}-${maxHardness}`,
});
```

```js
const hardnessSelectorValue = Generators.input(hardnessSelectorInput);
```

```js
const resetButton = Inputs.button(
  html`<img src="https://noita-bartender-images.acidflow.stream/images/icons/arrow-counterclockwise.svg" />Reset`,
  {
    label: "",
    reduce: () => {
      hardnessSelectorInput.value = maxHardness;
      hardnessSelectorInput.dispatchEvent(new Event("input"));
      return null;
    },
  }
);
```

```js
const materialsWithCombined = materials.map((material) => ({
  ...material,
  combinedName: material,
}));

function hardnessTable(materials, width) {
  const filteredMaterials = materials.filter((d) => d.hardness !== null && d.hardness <= hardnessSelectorValue);

  return Inputs.table(filteredMaterials, {
    width: {
      hardness: 70,
      combinedName: Math.min(250, width * 0.4),
    },
    align: {
      hardness: "right",
    },
    layout: "fixed",
    sort: "hardness",
    reverse: true,
    select: true,
    multiple: false,
    rows: width < 600 ? 10 : 15,
    columns: ["hardness", "combinedName", "image_local", "icon_local", "pouch_local"],
    header: {
      hardness: "Hardness",
      combinedName: "Material",
      image_local: "image",
      icon_local: "icon_local",
      pouch_local: "pouch_local",
    },
    format: {
      combinedName: ({ name, id, type, wikipage }) => html`<a href=https://noita.wiki.gg/wiki/${wikipage} target=_blank>
            <span class="material-name-text">${name}</span>
            <span class="material-name-text"><br />(</span><span class="material-type-${
              type ? type.toLowerCase() : "unknown"
            }"><code>${id}</code></span><span class="material-name-text">)</span>
      </a>`,
      image_local: (d) =>
        html`<img
          src="https://noita-bartender-images.acidflow.stream/images/materials/${d}"
          width=${tableImageWidth}
          height="auto"
          style="image-rendering: pixelated;"
        />`,
      icon_local: (d) =>
        html`<img
          src="https://noita-bartender-images.acidflow.stream/images/materials/${d}"
          width=${tableImageWidth}
          height="auto"
          style="image-rendering: pixelated;"
        />`,
      pouch_local: (d) =>
        html`<img
          src="https://noita-bartender-images.acidflow.stream/images/materials/${d}"
          width=${tableImageWidth}
          height="auto"
          style="image-rendering: pixelated;"
        />`,
    },
  });
}
```

```js
function hardnessPlot(materials, width) {
  const isMobile = width < 600;
  const plotHeight = isMobile ? 400 : 600;
  const fontSize = isMobile ? 10 : 12;

  return Plot.plot({
    width,
    height: plotHeight,
    marginLeft: 60,
    marginBottom: 60,
    marginTop: 40,
    marginRight: 40,
    x: {
      type: "pow",
      exponent: 1 / 3,
      nice: true,
      label: "Durability",
      domain: [minDurability, maxDurability],
      grid: true,
    },
    y: {
      type: "pow",
      exponent: 1 / 3,
      nice: true,
      label: "Hardness",
      domain: [minHardness, maxHardness],
      grid: true,
    },
    color: {
      domain: materialTypeColors.map((d) => d.type),
      range: materialTypeColors.map((d) => d.color),
    },
    symbol: {
      legend: true,
      ...getSymbolConfig(),
    },
    marks: [
      Plot.dot(
        materials.filter((d) => d.hardness !== null && d.durability !== null),
        {
          x: "durability",
          y: "hardness",
          fill: "type",
          symbol: "type",
          r: isMobile ? 3 : 4,
          opacity: (d) => (d.hardness <= hardnessSelectorValue ? 0.8 : 0.1),
          tip: {
            lineWidth: 300,
            textPadding: 12,
            pointerSize: 8,
            fontSize: fontSize,
            lineHeight: 1.1,
            dx: 0,
            dy: -10,
            format: { opacity: false, fill: false, fy: false },
          },
          title: (d) =>
            [
              `Material: ${d.name}`,
              `ID: ${d.id}`,
              `Type: ${d.type}`,
              `Hardness: ${d.hardness}`,
              `Durability: ${d.durability}`,
            ].join("\n"),
        }
      ),
      Plot.frame(),
    ],
  });
}
```

${contentNotice}

<div class="grid grid-cols-4 grid-rowspan-1" style="grid-auto-rows: auto;">
    <div class="card grid-colspan-2 grid-rowspan-1" style="padding: 0;">
        <div style="padding: 1rem;">
            <h2>Hardness Filter</h2>
            <div style="display: flex; gap: 1rem; align-items: flex-end; margin-bottom: 1rem; flex-wrap: wrap;">
              <div style="flex: 1; min-width: 200px;">
                ${hardnessSelectorInput}
              </div>
              <div>
                ${resetButton}
              </div>
            </div>
        </div>
        ${resize((width) => hardnessTable(materialsWithCombined, width))}
    </div>
  <div class="card grid-colspan-2 grid-rowspan-1">
      <h2>Hardness vs Durability</h2>
      ${resize((width) => hardnessPlot(materials, width))}
  </div>
</div>
