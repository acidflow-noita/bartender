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
import { materialTypeColors, getSymbolConfig } from "./components/materialTypeStyles.js";
import { wuoteLogo } from "./components/wuoteLogo.js";
import { checkAuthAndRender } from "./components/auth.js";
```

```js
// Check authentication before rendering content
const authResult = await checkAuthAndRender();
if (authResult !== null) {
  display(html`${authResult}`);
  // Stop execution if not authenticated
  throw new Error("Authentication required");
}
```

```js
const tableImageWidth = 32;
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
const resetButton = Inputs.button(
  htl.html`<img src="https://noita-bartender-images.acidflow.stream/images/icons/arrow-counterclockwise.svg" />Reset`,
  {
    label: "",
    reduce: () => {
      liquidsDensitySelectorInput.value = Math.max(...distinctDensity);
      liquidsDensitySelectorInput.dispatchEvent(new Event("input"));
      return null;
    },
  }
);
```

```js
const materialsWithCombined = materials.map((material) => ({
  ...material,
  combinedName: { name: material.name, id: material.id, wikipage: material.wikipage, type: material.type },
}));

function densityTable(materials, width) {
  const filteredMaterials = materials.filter(
    (d) => d.density !== null && d.density <= liquidsDensitySelectorValue && d.type == "Liquid"
  );

  return Inputs.table(filteredMaterials, {
    width: {
      density: 70,
      combinedName: Math.min(250, width * 0.4),
    },
    align: {
      density: "right",
    },
    layout: "fixed",
    sort: "density",
    reverse: true,
    select: true,
    multiple: false,
    rows: width < 600 ? 10 : 15,
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
  });
}
```

```js
function densityPlot(materials, width) {
  const isMobile = width < 600;
  const plotHeight = isMobile ? 400 : 560;
  const fontSize = isMobile ? 10 : 12;

  const liquidsData = materials.filter(
    (d) => d.density !== null && d.density > 0 && d.name && d.image_local && d.type == "Liquid"
  );

  const filteredLiquids = liquidsData.filter((d) => d.density <= liquidsDensitySelectorValue);

  return Plot.plot({
    width,
    height: plotHeight,
    marginLeft: 60,
    marginBottom: 60,
    marginTop: 40,
    marginRight: 40,
    x: {
      label: "Material (grouped by density)",
      tickSize: 0,
      tickFormat: "",
    },
    y: {
      reverse: true,
      label: "Density",
      grid: true,
      domain: [0, Math.max(...distinctDensity)],
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
        filteredLiquids,
        Plot.dodgeX({
          y: "density",
          fill: "type",
          symbol: "type",
          r: isMobile ? 4 : 6,
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
          title: (d) => [`Material: ${d.name}`, `ID: ${d.id}`, `Density: ${d.density}`, `Type: ${d.type}`].join("\n"),
        })
      ),
      Plot.ruleY([0]),
      Plot.frame(),
    ],
  });
}
```

<div class="grid grid-cols-4 grid-rowspan-1" style="grid-auto-rows: auto;">
    <div class="card grid-colspan-2 grid-rowspan-1" style="padding: 0;">
        <div style="padding: 1rem;">
            <h2>Density Filter</h2>
            <div style="display: flex; gap: 1rem; align-items: flex-end; margin-bottom: 1rem; flex-wrap: wrap;">
              <div style="flex: 1; min-width: 200px;">
                ${liquidsDensitySelectorInput}
              </div>
              <div>
                ${resetButton}
              </div>
            </div>
        </div>
        ${resize((width) => densityTable(materialsWithCombined, width))}
    </div>
  <div class="card grid-colspan-2 grid-rowspan-1">
      <h2>Liquid Density Distribution</h2>
      ${resize((width) => densityPlot(materials, width))}
  </div>
</div>
