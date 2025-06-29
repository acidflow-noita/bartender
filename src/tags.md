---
title: Material Tags
draft: true
---

<link href="custom.css" rel="stylesheet"></link>

<h1 id="acidTitle" class="bartender-heading-decrypted">Material Tags</h1>
<h2>Work in progress.</h2>

```js
// Load JSON data
const materials = await FileAttachment("./data/FULL_MATERIALS_FINAL.json").json();
const reactions = await FileAttachment("./data/reactions.json").json();
const tags = await FileAttachment("./data/material_tags_with_descriptions.json").json();
```

```js
import { initializeTitleAnimation } from "./components/titleAnimation.js";
initializeTitleAnimation();
```

```js
const materialSelector = view(
  Inputs.select(
    d3.group(materials, (d) => d.id),
    { sort: true, label: "Material" }
  )
);
```

```js
view(
  Inputs.table(materialSelector, {
    sort: "name",
    reverse: false,
    select: true,
    multiple: false,
    columns: ["name", "id", "image_local", "icon_local", "pouch_local", "freezes", "melts", "breakInto"],
    header: {
      name: "name",
      id: "id",
      image_local: "image_local",
      icon_local: "icon_local",
      pouch_local: "pouch_local",
    },
  })
);
```

<br>

```js
const tagSelector = view(
  Inputs.select(
    d3.group(tags, (d) => d.tag),
    { sort: true, label: "Tag" }
  )
);
```

```js
view(
  Inputs.table(tagSelector, {
    sort: "tag",
    reverse: false,
    select: true,
    multiple: false,
    columns: ["tag", "url", "title", "description"],
    header: {
      tag: "tag",
      url: "url",
      title: "title",
      description: "description",
    },
  })
);
```

```js
const tagsTable = Inputs.table(tags, {
  width: {
    tag: 200,
  },
  align: {
    tag: "left",
    name: "left",
    description: "left",
    url: "left",
  },
  sort: "name",
  reverse: false,
  rows: 22,
  columns: ["tag", "name", "description", "url"],
  header: {
    tag: "Tag",
    name: "Name",
    description: "Description",
    url: "url",
  },
});
```

<div class="grid grid-cols-4">
  <div class="card grid-rowspan-4 grid-colspan-4"><h2>Material Tags</h2><h3>There are ${tags.length} material tags</h3>${tagsTable}</div>
</div>
