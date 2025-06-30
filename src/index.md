---
title: Noita Bartender
draft: false
---

<!-- Facebook Meta Tags -->
<meta property="og:url" content="https://bartender.runfast.stream">
<meta property="og:type" content="website">
<meta property="og:title" content="Noita Bartender">
<meta property="og:description" content=" Noita Materials Exploration Tool">
<meta property="og:image" content="https://noita-bartender-images.acidflow.stream/images/logo/BARTENDER_SOCIALS.png">

<!-- Twitter Meta Tags -->
<meta name="twitter:card" content="summary_large_image">
<meta property="twitter:domain" content="bartender.runfast.stream">
<meta property="twitter:url" content="https://bartender.runfast.stream">
<meta name="twitter:title" content="Noita Bartender">
<meta name="twitter:description" content=" Noita Materials Exploration Tool">
<meta name="twitter:image" content="https://noita-bartender-images.acidflow.stream/images/logo/BARTENDER_SOCIALS.png">

<link href="custom.css" rel="stylesheet"></link>

<h1 id="acidTitle" class="bartender-heading-decrypted">Noita Bartender</h1>

```js
import { materialTypeColors } from "./components/materialTypeColors.js";
import { wuoteLogo } from "./components/wuoteLogo.js";
import { initializeTitleAnimation } from "./components/titleAnimation.js";
initializeTitleAnimation();
```

```js
const isBigScreen = width > 1170 ? 10 : 10;
const isMobile = width < 500;
const marginLeft = isMobile ? 50 : 60;
const marginRight = isMobile ? 20 : 30;
const marginBottom = isMobile ? 50 : 40;
const fontSize = isMobile ? 12 : 14;
```

```js
const materials = await FileAttachment("./data/FULL_MATERIALS_FINAL.json").json();
const tags = await FileAttachment("./data/jsons/tags.json").json();
const statusEffects = await FileAttachment("./data/status_effects.json").json();
const statusEffectsImages = await FileAttachment("./data/jsons/status_effects_images.json").json();
```

```js
const distinctTypes = [...new Set(materials.flatMap(({ type }) => type))];
```

```js
const materialTypes = [...new Set(materials.map((d) => d.type || "N/A"))];
const typeColorMapping = materialTypes.reduce((acc, type) => {
  acc[type] = `var(--material-type-${type.toLowerCase()}-color)`;
  return acc;
}, {});
```

```js
const materialTypesPlot = Plot.plot({
  insetTop: 10,
  insetRight: 30,
  height: 300,
  color: {
    legend: false,
    domain: materialTypeColors.map((d) => d.type), // Extract the types
    range: materialTypeColors.map((d) => d.color), // Extract the colors
  },
  x: { label: "Number of materials per type" },
  y: { label: null },
  marks: [
    Plot.barX(
      materials,
      Plot.groupY(
        { x: "count" },
        {
          y: (d) => d.type || "N/A",
          sort: { y: "-x" },
          fill: (d) => d.type || "N/A",
          tip: {
            lineWidth: 300,
            textPadding: 12,
            pointerSize: 8,
            lineHeight: 1.1,
            fontSize,
            dx: 0,
            dy: -10,
            format: { opacity: false, type: false, fy: false, stroke: false },
          },
          title: (d) => {
            const typeCount = materials.filter((m) => (m.type || "N/A") === (d.type || "N/A")).length;
            const percentage = ((typeCount / materials.length) * 100).toFixed(1);
            return [`Material Type: ${d.type || "N/A"}`, `Percentage of total: ${percentage}%`].join("\n\n");
          },
        }
      )
    ),
    Plot.text(
      materials,
      Plot.groupY(
        { x: "count", text: "count" },
        { y: (d) => d.type || "N/A", sort: { y: "-x" }, dx: 25, fill: "white", textAnchor: "end", fontSize }
      )
    ),
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

<h2>What is this page? Is it new? Do you like it?</h2>

I wanted a quicker, easier way of finding material reactions than using the wiki's [table of alchemical reactions](https://noita.wiki.gg/wiki/Table_of_Alchemical_Reactions). No such tool existed, so I built one. After that, I've started working on adding more — hopefully — useful features. Check out what's probably [coming in the future](upcoming).

<div class="grid grid-cols-3" style="grid-auto-rows: auto;">
<div class="card grid-colspan-1 grid-rowspan-1">
    <h2>General Info</h2>
    <p>Everything in the world of Noita is made of materials, even the visual effects.</p>
    <p>There are <code class="bigger-number-better">${materials.length}</code> materials total. Each material is described by <code class="bigger-number-better">1</code> to <code class="bigger-number-better">10</code> tags out of <code class="bigger-number-better">${tags.length}</code> unique tags.</p>
    <p>Each material can be of one type: <span class="material-type-solid"><code class="bigger-number-better">solid</code></span>, <span class="material-type-liquid"><code class="bigger-number-better">liquid</code></span>, <span class="material-type-powder"><code class="bigger-number-better">powder</code></span>, <span class="material-type-gas"><code class="bigger-number-better">gas</code></span>, or <span class="material-type-fire"><code class="bigger-number-better">fire</code></span>. There are two exceptions: <code class="bigger-number-better"><a href="https://noita.wiki.gg/wiki/Air">Air</a></code> ("nothing," the non-matter) and a special material <code class="bigger-number-better"><a href="https://noita.wiki.gg/wiki/Fungal_Shift_Particle_Fx">fungal_shift_particle_fx</a></code> — these do not have a type.</p>
</div>

  <div class="card grid-colspan-1 grid-rowspan-1 card-centered-text">
    <h1 class="big"><a href="reactions">Reactions finder&#8288;🪄</a></h1>
  </div>
  
  <div class="card grid-rowspan-1 grid-colspan-1"><h2>Distribution of Material Types</h2>${materialTypesPlot}</div>
</div>
