---
title: Density (Beta)
---

<link href="custom.css" rel="stylesheet" />

<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
  <h1 id="acidTitle" class="bartender-heading-decrypted" style="margin: 0;">Density</h1>
  <div id="auth-status-container"></div>
</div>
<h2>Liquids with different density values form layers. Some non-liquids have density too.</h2>

```js
const all_materials = await FileAttachment("./data/FULL_MATERIALS_FINAL.json").json();
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
const authState = await authManager.checkAuth();
```

```js
// Filter materials based on auth status - show all for followers, limited for non-followers
const materials =
  authState.authenticated && authState.isFollower
    ? all_materials
    : all_materials.filter((d) => {
        // For non-followers, show common liquids that definitely have density values
        const allowedIds = ["acid", "oil", "blood", "lava", "snow", "toxic_sludge"];
        return allowedIds.includes(d.id) && d.density !== null;
      });

console.log("All materials count:", all_materials.length);
console.log("Filtered materials count:", materials.length);
console.log("Auth status:", authState.authenticated, "Is follower:", authState.isFollower);
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
const tableImageWidth = 32;
```

```js
const distinctDensity =
  materials && materials.length > 0
    ? [...new Set(materials.filter((d) => d.density !== null).map((d) => d.density))]
    : [];

console.log("Materials count:", materials.length);
console.log("Liquid materials:", materials.filter((d) => d.type === "Liquid").length);
console.log("Liquids with density:", materials.filter((d) => d.density !== null).length);
console.log("Distinct density values:", distinctDensity.length);
console.log("Sample densities:", distinctDensity.slice(0, 5));
```

```js
const liquidsDensitySelectorInput =
  distinctDensity.length > 0
    ? Inputs.range([Math.min(...distinctDensity), Math.max(...distinctDensity)], {
        value: Math.max(...distinctDensity),
        step: 0.5,
      })
    : html`<div></div>`;
```

```js
const liquidsDensitySelectorValue = Generators.input(liquidsDensitySelectorInput);
```

```js
const resetButton = Inputs.button(
  html`<img src="https://noita-bartender-images.acidflow.stream/images/icons/arrow-counterclockwise.svg" />Reset`,
  {
    label: "",
    reduce: () => {
      if (distinctDensity.length > 0) {
        liquidsDensitySelectorInput.value = Math.max(...distinctDensity);
        liquidsDensitySelectorInput.dispatchEvent(new Event("input"));
      }
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

  console.log("Table filtered materials:", filteredMaterials.length);

  if (filteredMaterials.length === 0) {
    return html`<div>No materials match the current density filter.</div>`;
  }

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
function densityPlot(materials, width) {
  const isMobile = width < 600;
  const plotHeight = isMobile ? 400 : 560;
  const fontSize = isMobile ? 10 : 12;

  const liquidsData = materials.filter(
    (d) => d.density !== null && d.density > 0 && d.name && d.image_local && d.type == "Liquid"
  );

  if (liquidsData.length === 0) {
    return html`<div>No liquid data to display.</div>`;
  }

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
      type: "pow",
      exponent: 1 / 3,
      nice: true,
      domain: [Math.min(...distinctDensity), Math.max(...distinctDensity)],
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

${contentNotice}

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
