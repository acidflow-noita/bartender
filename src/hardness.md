---
title: Hardness
draft: true
---

<link href="custom.css" rel="stylesheet"></link>

<h1 id="acidTitle" class="bartender-heading-decrypted">Hardness</h1>
<h2>Hardness determines resistance to damage, secondarily to <a href="durability">durability</a>.</h2>

```js
const materials = await FileAttachment("./data/FULL_MATERIALS_FINAL.json").json();
const spells = await FileAttachment("./data/FULL_SPELLS_FINAL.json").json();
```

```js
import { initializeTitleAnimation } from "./components/titleAnimation.js";
initializeTitleAnimation();
import { materialTypeColors } from "./components/materialTypeColors.js";
import { wuoteLogo } from "./components/wuoteLogo.js";
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
const materialsWithCombined = materials.map((material) => ({
  ...material,
  combinedName: material,
}));

const hardnessTable = Inputs.table(
  materialsWithCombined.filter((d) => d.hardness !== null && d.hardness <= hardnessSelectorValue),
  {
    width: {
      hardness: 70,
      combinedName: 250,
    },
    align: {
      hardness: "right",
    },
    layout: "fixed",
    sort: "hardness",
    reverse: true,
    select: true,
    multiple: false,
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
        htl.html`<img src="https://noita-bartender-images.acidflow.stream/images/materials/${d}" width=${tableImageWidth} height="auto" style="image-rendering: pixelated;" />`,
      icon_local: (d) =>
        htl.html`<img src="https://noita-bartender-images.acidflow.stream/images/materials/${d}" width=${tableImageWidth} height="auto" style="image-rendering: pixelated;" />`,
      pouch_local: (d) =>
        htl.html`<img src="https://noita-bartender-images.acidflow.stream/images/materials/${d}" width=${tableImageWidth} height="auto" style="image-rendering: pixelated;" />`,
    },
  }
);
```

```js
const hardnessPlot = Plot.plot({
  inset: 10,
  width: 1500,
  height: 1000,
  x: { type: "log", label: "Durability", axis: "bottom", domain: [minHardness, maxHardness] },
  y: {
    type: "log",
    label: "Hardness",
  },
  color: {
    legend: false,
    domain: materialTypes,
    range: materialTypeColors,
  },
  marks: [
    Plot.dot(
      materials,
      Plot.dodgeX({
        filter: (d) => d.hardness !== null,
        x: "durability",
        y: "hardness",
        symbol: { legend: true },
        // r: 10,
        width: 20,
        height: 20,
        padding: 5,
        opacity: (d) => (d.hardness <= hardnessSelectorValue ? 1 : 0.1),
        channels: { type: { label: "Type", value: (d) => `${d.name} (${d.id})` } },
        tip: {
          lineWidth: 300,
          textPadding: 12,
          pointerSize: 8,
          fontSize: 14,
          lineHeight: 1.1,
          dx: 0,
          dy: -10,
          format: { opacity: false, type: false, fy: false, stroke: "type" },
        },
        title: (d) => [`Material: ${d.name}`, `Owners: ${d}`].join("\n\n"),
      })
    ),
    Plot.tip(materials, {
      channels: {
        type: true,
      },
      format: {
        x: "durability",
        y: "hardness",
      },
    }),
    Plot.frame(),
    Plot.image(wuoteLogo, {
      frameAnchor: "top-right",
      dx: -70,
      dy: 0,
      width: 100,
      src: "logo_with_card_bg",
    }),
  ],
});
```

<div class="grid grid-cols-4 grid-rowspan-1" style="grid-auto-rows: auto;">
    <div class="card grid-colspan-2 grid-rowspan-1" style="padding: 0;">
        <div style="padding: 1rem;">
            <h2>Hardness</h2>
            ${hardnessSelectorInput}
        </div>
        ${hardnessTable}
    </div>
  <div class="card grid-colspan-2 grid-rowspan-1">
      ${hardnessPlot}
  </div>
</div>
