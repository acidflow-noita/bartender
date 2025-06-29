---
title: Liquids
draft: true
---

<link href="custom.css" rel="stylesheet"></link>

<h1 id="acidTitle" class="bartender-heading-decrypted">Liquids</h1>
<h2>Only Slush (slush) and Slime (slime) have .</h2>

```js
const materials = await FileAttachment("./data/FULL_MATERIALS_FINAL.json").json();
const biomes = await FileAttachment("./data/jsons/biomes.json").json();

const getImagePath = (filename) => {
  const baseUrl = "https://noita-bartender-images.acidflow.stream/images/materials";
  return `${baseUrl}/${filename ? filename : "no_image_available.png"}`;
};

// FIXED: Better image URL helper that constructs URLs directly
const getMaterialImageUrl = (material, type = "image") => {
  if (!material || !material.id) return getImagePath("no_image_available.png");

  let filename;
  switch (type) {
    case "image":
      filename = `Material_${material.id}.png`;
      break;
    case "icon":
      filename = `Materialpotion_${material.id}.png`;
      break;
    case "pouch":
      filename = `Materialpouch_${material.id}.png`;
      break;
    default:
      filename = `Material_${material.id}.png`;
  }

  return getImagePath(filename);
};
```

```js
import { initializeTitleAnimation } from "./components/titleAnimation.js";
initializeTitleAnimation();
```

```js
const tableImageWidth = 32;
```

```js
materials.forEach((material) => {
  material.combinedMaterialName = {
    name: material.name,
    id: material.id,
    type: material.type,
    fullName: `${material.name} (${material.id})`,
    wikiUrl: material.wikipage,
    url: `https://noita.wiki.gg/wiki/${encodeURIComponent(material.wikipage)}`,
  };

  // Add a name_and_id field for the full table
  material.name_and_id = `${material.name} (${material.id})`;

  // Add parent material display name
  material.parent_material = material._parent || "None";
});

const searchMaterials = Inputs.search(materials, {
  datalist: materials.map((material) => material.combinedMaterialName.fullName),
  placeholder: "Search materials",
  query: "",
  autocomplete: true,
});

const searchMaterialsValue = Generators.input(searchMaterials);
```

```js
const searchMaterialsFull = Inputs.search(materialsLiquids, {
  datalist: materialsLiquids.map((material) => material.name_and_id),
  placeholder: "Search materials",
  query: "",
  autocomplete: true,
});

const searchMaterialsFullValue = Generators.input(searchMaterialsFull);
```

```js
const resetButtonFull = Inputs.button(
  htl.html`<img src="https://noita-bartender-images.acidflow.stream/images/icons/arrow-counterclockwise.svg" />Reset`,
  {
    label: "",
    reduce: () => {
      searchMaterialsFull.query = "";
      searchMaterialsFull.dispatchEvent(new Event("input"));
      return null;
    },
  }
);
```

```js
const resetButton = Inputs.button(
  htl.html`<img src="https://noita-bartender-images.acidflow.stream/images/icons/arrow-counterclockwise.svg" />Reset`,
  {
    label: "",
    reduce: () => {
      searchMaterials.query = "";
      searchMaterials.dispatchEvent(new Event("input"));
      return null;
    },
  }
);
```

```js
const materialsTable = Inputs.table(searchMaterialsValue, {
  width: {
    combinedMaterialName: 250,
  },
  align: {
    hardness: "right",
  },
  layout: "fixed",
  sort: "name",
  reverse: true,
  select: true,
  multiple: false,
  rows: 42,
  columns: ["combinedMaterialName", "image_local", "icon_local", "pouch_local", "type", "wang"],
  header: {
    combinedMaterialName: "Material",
    image_local: "Material Image",
    icon_local: "Icon",
    pouch_local: "Pouch",
    type: "Type",
    wang: "Wang color",
  },
  format: {
    combinedMaterialName: (d) => htl.html`<a href="${d.url}" target="_blank">
            <span class="material-name-text">${d.name}</span>
            <span class="material-name-text"><br />(</span><span class="material-type-${
              d.type ? d.type.toLowerCase() : "unknown"
            }"><code>${d.id}</code></span><span class="material-name-text">)</span>
      </a>`,
    image_local: (d, i) => {
      // FIXED: Use the material object to get proper image URL
      const material = searchMaterialsValue[i];
      const imageUrl = getMaterialImageUrl(material, "image");
      return htl.html`<img src="${imageUrl}" width=${tableImageWidth} height="auto" style="image-rendering: pixelated;" />`;
    },
    icon_local: (d, i) => {
      // FIXED: Use the material object to get proper icon URL
      const material = searchMaterialsValue[i];
      const iconUrl = getMaterialImageUrl(material, "icon");
      return htl.html`<img src="${iconUrl}" width=${tableImageWidth} height="auto" style="image-rendering: pixelated;" />`;
    },
    pouch_local: (d, i) => {
      // FIXED: Use the material object to get proper pouch URL
      const material = searchMaterialsValue[i];
      const pouchUrl = getMaterialImageUrl(material, "pouch");
      return htl.html`<img src="${pouchUrl}" width=${tableImageWidth} height="auto" style="image-rendering: pixelated;" />`;
    },
    wang: (d) => {
      const fallbackBackgroundColor = "cccccc";

      let displayColor = fallbackBackgroundColor;
      let textColorInput = fallbackBackgroundColor;

      if (d && typeof d === "string" && (d.length === 6 || d.length === 8)) {
        if (d.length === 8) {
          displayColor = d.substring(2, 8);
          textColorInput = displayColor;
        } else {
          displayColor = d;
          textColorInput = d;
        }
      }
      const textColor = getContrastingTextColor(textColorInput);
      const backgroundColorCSS = `#${displayColor}`;
      return htl.html`<div style="width: 100%; height: ${tableImageWidth}px; background-color: ${backgroundColorCSS}; position: relative; display: flex; align-items: center; justify-content: center;">
        <code style="color: ${textColor}; font-size: 0.8em; font-family: monospace;">${d || "N/A"}</code>
      </div>`;
    },
  },
});
```

```js
const getContrastingTextColor = (hexcolor) => {
  let rgbHex = hexcolor;
  if (hexcolor && typeof hexcolor === "string" && hexcolor.length === 8) {
    rgbHex = hexcolor.substring(2, 8); // Extract RRGGBB from AARRGGBB
  } else if (!hexcolor || typeof hexcolor !== "string" || hexcolor.length !== 6) {
    console.warn(`Invalid hex color provided to getContrastingTextColor: ${hexcolor}`);
    return "black";
  }

  // Parse RGB components
  const r = parseInt(rgbHex.substring(0, 2), 16);
  const g = parseInt(rgbHex.substring(2, 4), 16);
  const b = parseInt(rgbHex.substring(4, 6), 16);

  if (isNaN(r) || isNaN(g) || isNaN(b)) {
    console.warn(`Failed to parse RGB components from ${rgbHex}`);
    return "black";
  }

  // APCA Implementation
  const sRGBtoY = (colorValue) => {
    const normalized = colorValue / 255.0;
    return normalized <= 0.04045 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
  };

  // Convert to luminance using APCA coefficients
  const backgroundY = sRGBtoY(r) * 0.2126729 + sRGBtoY(g) * 0.7151522 + sRGBtoY(b) * 0.072175;

  // APCA contrast calculation for white text (Y = 1.0) and black text (Y = 0.0)
  const calcAPCAContrast = (textY, bgY) => {
    const brightY = Math.max(textY, bgY);
    const darkY = Math.min(textY, bgY);

    // APCA magic numbers
    const normBG = 0.56;
    const normTXT = 0.57;
    const revTXT = 0.62;
    const revBG = 0.65;

    let saPC;

    if (brightY === textY) {
      // Light text on dark background
      saPC = (Math.pow(brightY, normBG) - Math.pow(darkY, revBG)) * 1.14;
    } else {
      // Dark text on light background
      saPC = (Math.pow(brightY, revTXT) - Math.pow(darkY, normTXT)) * 1.14;
    }

    return saPC * 100; // Convert to percentage
  };

  // Calculate contrast for white text (Y=1.0) and black text (Y=0.0)
  const whiteContrast = Math.abs(calcAPCAContrast(1.0, backgroundY));
  const blackContrast = Math.abs(calcAPCAContrast(0.0, backgroundY));

  // Return the color with higher contrast
  // APCA minimum readable contrast is around 60 for body text
  return whiteContrast > blackContrast ? "white" : "black";
};
```

```js
const materialDetails = (material) => {
  if (!material) return html`<p>Select a material from the table to see details</p>`;

  return html`
    <div>
      <h3>${material.name}</h3>
      <div>
        ${material.image_local
          ? html`<img
              src="${getImagePath(material.image_local)}"
              alt="${material.name}"
              width="252"
              height="auto"
            />`
          : ""} ${material.icon_local
          ? html`<img
              src="${getImagePath(material.icon_local)}"
              alt="${material.name} icon"
              width="32"
              height="auto"
            />`
          : ""}
      </div>

      <dl>
        <dt>ID:</dt>
        <dd>${material.id}</dd>
        <dt>Type:</dt>
        <dd>${material.type}</dd>
        ${material.tags?.length
          ? html`<dt>Tags:</dt>
              <dd>${material.tags.join(", ")}</dd>`
          : ""} ${material.density
          ? html`<dt>Density:</dt>
              <dd>${material.density}</dd>`
          : ""} ${material.hardness
          ? html`<dt>Hardness:</dt>
              <dd>${material.hardness}</dd>`
          : ""} ${material.durability
          ? html`<dt>Durability:</dt>
              <dd>${material.durability}</dd>`
          : ""}
      </dl>

      <div>
        ${[
          material.conductive && "Conductive",
          material.burnable && "Burnable",
          material.freezes && "Can freeze",
          material.melts && "Can melt",
          material.slippery && "Slippery",
        ]
          .filter(Boolean)
          .map((flag) => html`<span>${flag}</span>`)}
      </div>

      <a
        href="https://noita.wiki.gg/wiki/${encodeURIComponent(material.wikipage)}"
        target="_blank"
        >View on the Wiki</a
      >
    </div>
  `;
};

const selectedMaterial = Generators.input(materialsTable);
```

```js
const materialsLiquids = materials.filter((d) => d.type === "Liquid");
```

```js
const materialsTableFull = Inputs.table(searchMaterialsFullValue, {
  columns: [
    "name_and_id",
    "parent_material",
    "density",
    "hardness",
    "lifetime",
    "conductive",
    "burnable",
    "freezes",
    "melts",
    "viscosity",
    "temperature_of_fire",
    "solid_friction",
    "requires_oxygen",
    "hp",
    "generates_smoke",
    "fire_hp",
    "danger_fire",
    "autoignition_temperature",
    "audio_physics_material_wall",
    "audio_physics_material_solid",
    "always_ignites_damagemodel",
    "gfx_glow",
    "platform_type",
    "liquid_gravity",
    "danger_water",
    "danger_radioactive",
    "danger_poison",
    "liquid_sand",
    "liquid_sticks_to_ceiling",
    "liquid_slime",
    "liquid_stains",
    "stickyness",
    "on_fire",
  ],
});
```

<div class="grid grid-cols-4 gap-4" style="grid-auto-rows: auto;">
  <div class="card grid-colspan-1">${searchMaterialsFull}</div>
  <div class="card grid-colspan-1">${resetButtonFull}</div>
  <div class="card grid-colspan-4">${materialsTableFull}</div>
</div>

<div class="grid grid-cols-4 gap-4">
  <div class="card grid-colspan-1">${searchMaterials}</div>
  <div class="card grid-colspan-1">${resetButton}</div>
</div>

<div class="grid grid-cols-4 gap-4">
  <div class="card grid-colspan-2" style="padding: 0;">
    ${materialsTable}
  </div>
  <div class="card">
    <h2>Selected material details</h2>
    ${materialDetails(selectedMaterial)}
  </div>
</div>

"name_and_id",
"parent_material",
"density",
"hardness",
"lifetime",
"conductive",
"burnable",
"freezes",
"melts",
"breakInto",
"slippery",
"viscosity",
"temperature_of_fire",
"solid_on_collision_explode",
"solid_go_through_sand",
"solid_friction",
"requires_oxygen",
"hp",
"generates_smoke",
"fire_hp",
"danger_fire",
"autoignition_temperature",
"audio_physics_material_wall",
"audio_physics_material_solid",
"always_ignites_damagemodel",
"gfx_glow",
"platform_type",
"liquid_gravity",
"danger_water",
"danger_radioactive",
"danger_poison",
"liquid_sand",
"liquid_sticks_to_ceiling",
"liquid_slime",
"liquid_stains",
"stickyness",
"on_fire",
