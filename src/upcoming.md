---
title: (Hopefully) Upcoming Features
draft: false
---

<link href="custom.css" rel="stylesheet"></link>

<h1 id="acidTitle" class="bartender-heading-decrypted">(Hopefully) Upcoming Features</h1>

```js
import { materialTypeColors } from "./components/materialTypeColors.js";
import { wuoteLogo } from "./components/wuoteLogo.js";
import { initializeTitleAnimation } from "./components/titleAnimation.js";
initializeTitleAnimation();
```

```js
const isMobile = width < 500;
const marginLeft = isMobile ? 50 : 60;
const marginRight = isMobile ? 20 : 30;
const marginBottom = isMobile ? 50 : 40;
const fontSize = isMobile ? 12 : 14;
```

I've been working on this for a long time, and in the future you will probably see <span class="bigger-number-better material-type-acid">_some_</span> of these features as I gradually finish them:

```js
const upcomingFeaturesList = [
  { feature: "Spells' digging ability visualizer", readiness: 30, sortOrder: 1 },
  { feature: "An exploratory page for each material type", readiness: 10, sortOrder: 2 },
  { feature: "Materials biome map", readiness: 0, sortOrder: 5 },
  { feature: "Material source finder", readiness: 0, sortOrder: 3 },
  {
    feature: "Automatic reaction finder\nfor your in-game inventory\n(Streamer Wands integration)",
    readiness: 20,
    sortOrder: 4,
  },
  { feature: "Materials taste test (crazy, I know)", readiness: 13, sortOrder: 6 },
];
```

```js
const upcomingFeaturesPlot = Plot.plot({
  marginLeft: 200,
  height: 300,
  color: {
    scheme: "Blues",
    legend: false,
  },
  y: {
    label: null,
    tickPadding: 6,
    tickSize: 0,
    sort: upcomingFeaturesList.sortOrder,
    reverse: true,
  },
  x: { domain: [0, 100], label: "Estimated readiness %" },
  marks: [
    Plot.ruleY(upcomingFeaturesList, { y: "feature", x: "readiness", strokeWidth: 2, stroke: "readiness" }),
    Plot.dot(upcomingFeaturesList, {
      y: "feature",
      x: "readiness",
      fill: "readiness",
      r: 4,
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
        return [`Feature: ${d.feature}`, `Readiness: ${d.readiness}%`].join("\n\n");
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

${upcomingFeaturesPlot}
