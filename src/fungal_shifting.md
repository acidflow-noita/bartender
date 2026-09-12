---
title: Fungal Shift Planner
draft: false
---

<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/choices.js@11.1.0/public/assets/styles/choices.min.css">
<link rel="stylesheet" href="./custom.css">
<link rel="stylesheet" href="./fungal/fungal.css">

```js
import { createFungalApp } from "./fungal/app.js";
const base = await FileAttachment("./data/FULL_MATERIALS_FINAL.json").json();
const apotheosis = await FileAttachment("./data/apotheosis/materials.json").json();
const app = createFungalApp({base, apotheosis});
display(app);
invalidation.then(() => app.dispose());
```

```js
const attributionUrl = await FileAttachment("./fungal/NOTICE.txt").url();
```

<div class="fs-attribution">

Logic from [noita-fungal](https://github.com/liquidcake1/noita-fungal), [Lymm’s Telescope](https://github.com/Lymm37/noita-telescope), and [Noitool](https://github.com/TwoAbove/noita-tools). ${htl.html`<a href=${attributionUrl}>Licenses and attribution</a>`}.

</div>
