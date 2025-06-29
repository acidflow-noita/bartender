---
title: Density
draft: true
---

<link href="custom.css" rel="stylesheet"></link>

<h1 id="acidTitle" class="bartender-heading-decrypted">Density</h1>
<h2>Liquids with different density values form layers.</h2>

```js
const materials = await FileAttachment("./data/FULL_MATERIALS_FINAL.json").json();
```

```js
import { initializeTitleAnimation } from "./components/titleAnimation.js";
initializeTitleAnimation();
import { materialTypeColors } from "./components/materialTypeColors.js";
import { wuoteLogo } from "./components/wuoteLogo.js";
```

```js
const tableImageWidth = 32;
const isMobile = width < 500;
const fontSize = isMobile ? 12 : 14;
```

```js
const distinctDensity = [...new Set(materials.filter((d) => d.type === "Liquid").map((d) => d.density))].filter(
  (d) => d !== null
);
```

```js
const liquidsDensitySelectorInput = Inputs.range([Math.min(...distinctDensity), Math.max(...distinctDensity)], {
  value: Math.max(...distinctDensity),
  step: 0.5,
});
```

```js
const liquidsDensitySelectorValue = Generators.input(liquidsDensitySelectorInput);
```

```js
const materialsWithCombined = materials.map((material) => ({
  ...material,
  combinedName: { name: material.name, id: material.id, wikipage: material.wikipage },
}));

const densityTable = Inputs.table(
  materialsWithCombined.filter(
    (d) => d.density !== null && d.density <= liquidsDensitySelectorValue && d.type == "Liquid"
  ),
  {
    width: {
      density: 50,
      combinedName: 250,
    },
    align: {
      density: "right",
    },
    layout: "fixed",
    sort: "density",
    reverse: true,
    select: true,
    multiple: false,
    columns: ["density", "combinedName", "image_local", "icon_local", "pouch_local"],
    header: {
      density: "Density",
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
const resetButton = Inputs.button(
  htl.html`<img src="https://noita-bartender-images.acidflow.stream/images/icons/arrow-counterclockwise.svg" />Reset`,
  {
    label: "",
    reduce: () => {
      liquidsDensitySelectorInput.value = 14.5;
      liquidsDensitySelectorInput.dispatchEvent(new Event("input"));
      return null;
    },
  }
);
```

```js
const liquidsPlotData = materials.filter(
  (d) => d.density !== null && d.density > 0 && d.name && d.image_local && d.type == "Liquid"
);
```

```js
const densityPlot = Plot.plot({
  height: 560,

  y: {
    label: "Number of users",
    grid: true,
    type: "pow",
    exponent: 0.5,
    tickFormat: d3.format("d"),
  },
  color: {
    scheme: "ylgnbu",
  },
  marks: [
    Plot.dot(
      materials.filter((d) => d.density <= liquidsDensitySelectorValue && d.type == "Liquid"),
      Plot.dodgeX({
        y: "density",
        sort: {},
        r: 5,
        stroke: "wang",
        padding: 10,
        tip: {
          lineWidth: 300,
          textPadding: 12,
          pointerSize: 8,
          fontSize,
          lineHeight: 1.1,
          dx: 0,
          dy: -10,
          format: { opacity: false, type: false, fy: false, stroke: false },
        },
        title: (d) => {
          return [`Material: ${d.name}`].join("\n\n");
        },
      })
    ),
    Plot.tip(
      materials.filter((d) => d.density <= liquidsDensitySelectorValue && d.type == "Liquid"),
      Plot.pointer({ y: "density" })
    ),
  ],
});
view(materials.filter((d) => d.type === "Liquid" && d.liquid_gravity === null));
```

<div class="grid grid-cols-4 grid-rowspan-1" style="grid-auto-rows: auto;">
    <div class="card grid-colspan-2 grid-rowspan-1" style="padding: 0;">
        <div style="padding: 1rem;">
            <h2>Density</h2>
            ${liquidsDensitySelectorInput}
        </div>
        ${densityTable}
    </div>
  <div class="card grid-colspan-2 grid-rowspan-1">
      ${densityPlot}
  </div>
</div>
