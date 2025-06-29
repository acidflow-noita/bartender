---
title: "Interactive Noita Reactions Explorer"
draft: true
---

<script src="https://cdn.jsdelivr.net/npm/choices.js/public/assets/scripts/choices.min.js"></script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/choices.js/public/assets/styles/choices.min.css"/>
<link href="custom.css" rel="stylesheet"></link>

```js
const creatures = await FileAttachment("./data/FULL_CREATURES_FINAL.json").json();
```

```js
const creaturesTable = Inputs.table(creatures, {
  rows: 43,
  columns: [
    "wikipage",
    "name",
    "id",
    "entity_name",
    "blood_material_id",
    "corpse_material_id",
    "blood",
    "spawnLocation",
  ],
});
```

<div class="grid grid-cols-4">
  <div class="card grid-colspan-4" style="padding:0">${creaturesTable}</div>
</div>
