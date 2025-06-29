---
title: Durability
draft: true
---

<link href="custom.css" rel="stylesheet"></link>

<h1 id="acidTitle" class="bartender-heading-decrypted">Durability</h1>
<h2>Durability determines material's resistance to damage.</h2>

```js
const materials = await FileAttachment("./data/FULL_MATERIALS_FINAL.json").json();
```

```js
import { initializeTitleAnimation } from "./components/titleAnimation.js";
initializeTitleAnimation();
import { wuoteLogo } from "./components/wuoteLogo.js";
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
  combinedName: { name: material.name, id: material.id, wikipage: material.wikipage },
}));
```

```js
const durabilityPlot = Plot.plot({
  inset: 20,
  // width: 500,
  marks: [
    Plot.image(
      materials,
      Plot.dodgeX({
        anchor: "left",
        y: "durability",
        strokeWidth: 40,
        r: (d) => d.durability * 5,
        src: (d) => `https://noita-bartender-images.acidflow.stream/images/materials/${d.image_local}`,
        target: "_blank",
        href: (d) => `https://noita.wiki.gg/wiki/${d.wikipage}`,
        tip: true,
        channels: { durability: "durability", name: "name", id: "id" },
      })
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

```js
const durabilityPlot33 = Plot.auto(materials, {
  filter: (d) => d.durability !== null,
  x: "type",
  y: "durability",
  tip: true,
  channels: { durability: "durability", name: "type", id: "id" },
}).plot();
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
const durabilityTable = Inputs.table(
  materialsWithCombined.filter((d) => d.durability !== null && d.durability <= durabilitySelectorValue),
  {
    width: {
      durability: 60,
      combinedName: 250,
    },
    align: {
      durability: "right",
    },
    layout: "fixed",
    select: true,
    multiple: false,
    sort: "durability",
    reverse: true,
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
        htl.html`<img src="https://noita-bartender-images.acidflow.stream/images/materials/${d}" width=${tableImageWidth} height="auto" style="image-rendering: pixelated; vertical-align: middle;" />`,
      icon_local: (d) =>
        htl.html`<img src="https://noita-bartender-images.acidflow.stream/images/materials/${d}" width=${tableImageWidth} height="auto" style="image-rendering: pixelated; vertical-align: middle;" />`,
      pouch_local: (d) =>
        htl.html`<img src="https://noita-bartender-images.acidflow.stream/images/materials/${d}" width=${tableImageWidth} height="auto" style="image-rendering: pixelated; vertical-align: middle;" />`,
    },
  }
);
```

<div class="grid grid-cols-4">
  <div class="card grid-rowspan-1 grid-colspan-2"><h2>Durability</h2>${durabilityPlot}</div>
<div class="card grid-colspan-2 grid-rowspan-1" style="padding: 0">
  <div style="padding: 1rem"><h2>Durability</h2>${durabilitySelectorInput}</div>
  ${durabilityTable}
</div>
</div>

<div class="grid grid-cols-4">
  <div class="card grid-rowspan-1 grid-colspan-2"><h2>Durability</h2>${durabilityPlot33}</div>
</div>
