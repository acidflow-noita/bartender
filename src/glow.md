---
title: Glow (β)
---

<link href="custom.css" rel="stylesheet" />

<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
  <h1 id="acidTitle" class="bartender-heading-decrypted" style="margin: 0;">Glow (β)</h1>
  <div id="auth-status-container"></div>
</div>
<h2>Materials with glow properties that emit light in the darkness.</h2>

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
const authStatusCleanup = renderAuthStatus();
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
        // For non-followers, show common glowing materials
        const allowedIds = [
          "lava",
          "acid",
          "radioactive_liquid",
          "magic_liquid_teleportation",
          "magic_liquid_polymorph",
          "plasma_fading",
        ];
        return allowedIds.includes(d.id) && d.gfx_glow !== null;
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

if (contentNotice) {
  const container = document.getElementById("content-notice-container");
  if (container) {
    container.append(contentNotice);
  }
}
```

```js
const tableImageWidth = 32;
```

```js
const distinctGlow =
  materials && materials.length > 0
    ? [...new Set(materials.filter((d) => d.gfx_glow !== null).map((d) => d.gfx_glow))]
    : [];

console.log("Materials count:", materials.length);
console.log("Materials with glow:", materials.filter((d) => d.gfx_glow !== null).length);
console.log("Distinct glow values:", distinctGlow.length);
console.log("Sample glow values:", distinctGlow.slice(0, 5));
```

```js
const glowSelectorInput =
  distinctGlow.length > 0
    ? Inputs.range([Math.min(...distinctGlow), Math.max(...distinctGlow)], {
        value: Math.max(...distinctGlow),
        step: 0.1,
      })
    : html`<div></div>`;
```

```js
const glowSelectorValue = Generators.input(glowSelectorInput);
```

```js
const resetButton = Inputs.button(
  html`<img src="https://noita-bartender-images.acidflow.stream/images/icons/arrow-counterclockwise.svg" />Reset`,
  {
    label: "",
    reduce: () => {
      if (distinctGlow.length > 0) {
        glowSelectorInput.value = Math.max(...distinctGlow);
        glowSelectorInput.dispatchEvent(new Event("input"));
      }
      return null;
    },
  },
);
```

```js
const materialsWithCombined = materials.map((material) => ({
  ...material,
  combinedName: { name: material.name, id: material.id, wikipage: material.wikipage, type: material.type },
}));

function glowTable(materials, width) {
  const filteredMaterials = materials.filter((d) => d.gfx_glow !== null && d.gfx_glow <= glowSelectorValue);

  console.log("Table filtered materials:", filteredMaterials.length);

  if (filteredMaterials.length === 0) {
    return html`<div>No materials match the current glow filter.</div>`;
  }

  return Inputs.table(filteredMaterials, {
    width: {
      gfx_glow: 70,
      combinedName: Math.min(250, width * 0.4),
    },
    align: {
      gfx_glow: "right",
    },
    layout: "fixed",
    sort: "gfx_glow",
    reverse: true,
    select: true,
    multiple: false,
    rows: width < 600 ? 10 : 15,
    columns: ["gfx_glow", "combinedName", "image_local", "icon_local", "pouch_local"],
    header: {
      gfx_glow: "Glow",
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
function glowPlot(materials, width) {
  const isMobile = width < 600;
  const plotHeight = isMobile ? 400 : 560;
  const fontSize = isMobile ? 10 : 12;

  const glowData = materials.filter((d) => d.gfx_glow !== null && d.gfx_glow > 0);

  if (glowData.length === 0) {
    return html`<div>No glow data to display.</div>`;
  }

  const filteredGlow = glowData.filter((d) => d.gfx_glow <= glowSelectorValue);

  return Plot.plot({
    width,
    height: plotHeight,
    marginLeft: 60,
    marginBottom: 60,
    marginTop: 40,
    marginRight: 40,
    x: {
      label: "Material (grouped by glow intensity)",
      tickSize: 0,
      tickFormat: "",
    },
    y: {
      reverse: false,
      label: "Glow Intensity",
      grid: true,
      type: "pow",
      exponent: 1 / 5,
      nice: true,
      domain: [Math.min(...distinctGlow), Math.max(...distinctGlow)],
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
        glowData,
        Plot.dodgeX({
          y: "gfx_glow",
          fill: "type",
          symbol: "type",
          r: isMobile ? 5 : 8,
          padding: 2,
          opacity: (d) => (d.gfx_glow <= glowSelectorValue ? 1 : 0.1),
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
          title: (d) => [`Material: ${d.name}`, `ID: ${d.id}`, `Glow: ${d.gfx_glow}`, `Type: ${d.type}`].join("\n"),
        }),
      ),
      Plot.ruleY([0]),
      Plot.frame(),
    ],
  });
}
```

<div id="content-notice-container"></div>

<div class="grid grid-cols-4 grid-rowspan-1" style="grid-auto-rows: auto;">
    <div class="card grid-colspan-2 grid-rowspan-1" style="padding: 0;">
        <div style="padding: 1rem;">
            <h2>Glow Filter</h2>
            <div style="display: flex; gap: 1rem; align-items: flex-end; margin-bottom: 1rem; flex-wrap: wrap;">
              <div style="flex: 1; min-width: 200px;">
                ${glowSelectorInput}
              </div>
                ${resetButton}
            </div>
        </div>
        ${resize((width) => glowTable(materialsWithCombined, width))}
    </div>
  <div class="card grid-colspan-2 grid-rowspan-1">
      <h2>Material Glow Distribution</h2>
      ${resize((width) => glowPlot(materials, width))}
  </div>
</div>
