---
title: Durability
---

<link href="custom.css" rel="stylesheet"></link>

<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
  <h1 id="acidTitle" class="bartender-heading-decrypted" style="margin: 0;">Durability</h1>
  <div id="auth-status-container"></div>
</div>
<h2>Durability determines material's resistance to damage.</h2>

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
const authState = await authManager.checkAuth();
```

```js
const all_materials = await FileAttachment("./data/FULL_MATERIALS_FINAL.json").json();
const materials =
  authState.authenticated && authState.isFollower
    ? all_materials
    : all_materials.filter((d) => ["snow", "rock_static", "sand_static", "wood_static"].includes(d.id));
```

```js
import { createContentNotice } from "./components/contentNotice.js";
const contentNotice = createContentNotice(authState, {
  materials: materials.length,
  totalMaterials: all_materials.length,
});

contentNotice;
```

```js
const distinctDurability = [...new Set(materials.flatMap(({ durability }) => durability))].filter((d) => d !== null);
```

```js
const tableImageWidth = 32;
```

```js
const materialsWithCombined = materials.map((material) => ({
  ...material,
  combinedName: { name: material.name, id: material.id, wikipage: material.wikipage, type: material.type },
}));
```

```js
const materialTypes = [...new Set(materials.map((d) => d.type).filter(Boolean))];
```

```js
const durabilitySelectorInput = Inputs.range([Math.min(...distinctDurability), Math.max(...distinctDurability)], {
  value: Math.max(...distinctDurability),
  step: 1,
});
```

```js
const durabilitySelectorValue = Generators.input(durabilitySelectorInput);
```

```js
const resetButton = Inputs.button(
  html`<img src="https://noita-bartender-images.acidflow.stream/images/icons/arrow-counterclockwise.svg" />Reset`,
  {
    label: "",
    reduce: () => {
      durabilitySelectorInput.value = Math.max(...distinctDurability);
      durabilitySelectorInput.dispatchEvent(new Event("input"));
      return null;
    },
  }
);
```

```js
function durabilityTable(materials, width) {
  const filteredMaterials = materials.filter((d) => d.durability !== null && d.durability <= durabilitySelectorValue);

  return Inputs.table(filteredMaterials, {
    width: {
      durability: 70,
      combinedName: Math.min(250, width * 0.4),
    },
    align: {
      durability: "right",
    },
    layout: "fixed",
    select: true,
    multiple: false,
    sort: "durability",
    reverse: true,
    rows: width < 600 ? 10 : 15,
    columns: ["durability", "combinedName", "image_local", "icon_local", "pouch_local"],
    header: {
      combinedName: "Material",
      durability: "Durability",
      image_local: "Material Image",
      icon_local: "Icon",
      pouch_local: "Pouch",
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
          style="image-rendering: pixelated; vertical-align: middle;"
        />`,
      icon_local: (d) =>
        html`<img
          src="https://noita-bartender-images.acidflow.stream/images/materials/${d}"
          width=${tableImageWidth}
          height="auto"
          style="image-rendering: pixelated; vertical-align: middle;"
        />`,
      pouch_local: (d) =>
        html`<img
          src="https://noita-bartender-images.acidflow.stream/images/materials/${d}"
          width=${tableImageWidth}
          height="auto"
          style="image-rendering: pixelated; vertical-align: middle;"
        />`,
    },
  });
}
```

```js
function durabilityPlot(materials, width) {
  const isMobile = width < 600;
  const plotHeight = isMobile ? 400 : 500;
  const fontSize = isMobile ? 10 : 12;

  const filteredMaterials = materials.filter((d) => d.durability !== null);

  return Plot.plot({
    symbol: { legend: true },
    width,
    height: plotHeight,
    marginLeft: 60,
    marginBottom: 60,
    marginTop: 40,
    marginRight: 40,
    x: {
      label: "Material Type",
      tickRotate: isMobile ? 45 : 0,
    },
    y: {
      label: "Durability",
      grid: true,
      type: "log",
      domain: [0.1, Math.max(...distinctDurability)],
    },
    color: {
      domain: materialTypeColors.map((d) => d.type), // Extract the types
      range: materialTypeColors.map((d) => d.color), // Extract the colors
    },
    symbol: {
      legend: true,
      ...getSymbolConfig(),
    },
    marks: [
      Plot.dot(
        filteredMaterials.filter((d) => d.durability <= durabilitySelectorValue),
        Plot.dodgeX({
          x: "type",
          y: "durability",
          fill: "type",
          symbol: "type",
          r: isMobile ? 3 : 4,
          padding: 2,
          stroke: "white",
          strokeWidth: 0.5,
          tip: {
            lineWidth: 300,
            textPadding: 12,
            pointerSize: 8,
            fontSize: fontSize,
            lineHeight: 1.1,
            dx: 0,
            dy: -10,
            format: { opacity: false, fill: false, fy: false, stroke: false },
          },
          title: (d) =>
            [`Material: ${d.name}`, `ID: ${d.id}`, `Type: ${d.type}`, `Durability: ${d.durability}`].join("\n"),
        })
      ),
      Plot.frame(),
    ],
  });
}
```

${contentNotice}

<div class="grid grid-cols-4">
  <div class="card grid-colspan-2 grid-rowspan-1" style="padding: 0;">
    <div style="padding: 1rem;">
      <h2>Durability Filter</h2>
      <div style="display: flex; gap: 1rem; align-items: flex-end; margin-bottom: 1rem; flex-wrap: wrap;">
        <div style="flex: 1; min-width: 200px;">
          ${durabilitySelectorInput}
        </div>
        <div>
          ${resetButton}
        </div>
      </div>
    </div>
    ${resize((width) => durabilityTable(materialsWithCombined, width))}
  </div>
  <div class="card grid-colspan-2 grid-rowspan-1">
    <h2>Durability by Type</h2>
    ${resize((width) => durabilityPlot(materials, width))}
  </div>
</div>
