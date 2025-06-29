---
title: Status Effects
draft: true
---

<link href="custom.css" rel="stylesheet"></link>

<h1 id="acidTitle" class="bartender-heading-decrypted">Status Effects</h1>
<h2>Status effects are various positive or negative afflictions that can affect most creatures in the world, including yourself, separately from perks.</h2>

```js
const materials = await FileAttachment("./data/FULL_MATERIALS_FINAL.json").json();
const effects = await FileAttachment("./data/status_effects.json").json();
```

```js
import { initializeTitleAnimation } from "./components/titleAnimation.js";
initializeTitleAnimation();
```

```js
const tableImageWidth = 32;
```

```js
const distinctStatusEffects = [...new Set(effects.flatMap(({ name }) => name))];
```

```js
const searchStatusEffects = Inputs.search(effects, {
  datalist: distinctStatusEffects,
  placeholder: "Search status effects",
});

const searchStatusEffectssValue = Generators.input(searchStatusEffects);
```

```js
const resetButton = Inputs.button(
  htl.html`<img src="https://noita-bartender-images.acidflow.stream/images/icons/arrow-counterclockwise.svg" />Reset`,
  {
    label: "",
    reduce: () => {
      searchStatusEffects.query = "";
      searchStatusEffects.dispatchEvent(new Event("input"));
      return null;
    },
  }
);
```

```js
const effectsTable = Inputs.table(searchStatusEffectssValue, {
  sort: "durability",
  reverse: true,
  columns: ["icon", "name", "description"],
  rows: 22,
  header: {
    name: "Effect",
    in_game_description: "In-game description",
    effect: "effect",
    icon: "icon",
  },
  format: {
    icon: (d) =>
      htl.html`<img src="https://noita-bartender-images.acidflow.stream/images/status_effects/${d}" width=${tableImageWidth} height="auto" style="image-rendering: pixelated;" />`,
  },
});
```

<div class="grid grid-cols-4 gap-4">
  <div class="card grid-colspan-1">${searchStatusEffects}</div>
  <div class="card grid-colspan-1">${resetButton}</div>
</div>

<div class="grid grid-cols-4 gap-4">
  <div class="card grid-colspan-2" style="padding: 0;">
    ${effectsTable}
  </div>
  <div class="card grid-colspan-2">
    <h2>Selected status effect details</h2>
    ${materialDetails(selectedMaterial)}
  </div>
</div>
