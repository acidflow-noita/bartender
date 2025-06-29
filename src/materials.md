---
title: Materials Explorer
draft: true
---

<link href="custom.css" rel="stylesheet"></link>

<h1 id="acidTitle" class="bartender-heading-decrypted">Materials Explorer</h1>
<h2>Everything in the world of Noita is made of materials, even the visual effects.</h2>

```js
const materials = await FileAttachment("./data/FULL_MATERIALS_FINAL.json").json();
const biomes = await FileAttachment("./data/jsons/biomes.json").json();

const getImagePath = (filename) => {
  const baseUrl = "https://noita-bartender-images.acidflow.stream/images/materials";
  return `${baseUrl}/${filename ? filename : "no_image_available.png"}`;
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
  columns: ["combinedMaterialName", "image_local", "icon_local", "pouch_local"],
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
    image_local: (d) =>
      htl.html`<img src="https://noita-bartender-images.acidflow.stream/images/materials/${d}" width=${tableImageWidth} height="auto" style="image-rendering: pixelated;" />`,
    icon_local: (d) =>
      htl.html`<img src="https://noita-bartender-images.acidflow.stream/images/materials/${d}" width=${tableImageWidth} height="auto" style="image-rendering: pixelated;" />`,
    pouch_local: (d) =>
      htl.html`<img src="https://noita-bartender-images.acidflow.stream/images/materials/${d}" width=${tableImageWidth} height="auto" style="image-rendering: pixelated;" />`,
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

  const formatValue = (value) => {
    if (value === null || value === undefined) return "N/A";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (value === 0 || value === 1) return value === 1 ? "Yes" : "No";
    return value;
  };

  const basicProperties = [
    { label: "ID", value: material.id },
    { label: "Type", value: material.type },
    { label: "Wang Color", value: material.wang },
  ];

  const physicalProperties = [
    { label: "Density", value: material.density },
    { label: "Hardness", value: material.hardness },
    { label: "Durability", value: material.durability },
    { label: "HP", value: material.hp },
    { label: "Viscosity", value: material.viscosity },
    { label: "Solid Friction", value: material.solid_friction },
    { label: "Lifetime", value: material.lifetime },
    { label: "Stickiness", value: material.stickyness },
  ];

  const thermalProperties = [
    { label: "Temperature of Fire", value: material.temperature_of_fire },
    { label: "Fire HP", value: material.fire_hp },
    { label: "Autoignition Temperature", value: material.autoignition_temperature },
    { label: "Danger Fire", value: material.danger_fire },
  ];

  const behaviorFlags = [
    { label: "Conductive", value: material.conductive },
    { label: "Burnable", value: material.burnable },
    { label: "Freezes", value: material.freezes },
    { label: "Melts", value: material.melts },
    { label: "Slippery", value: material.slippery },
    { label: "Requires Oxygen", value: material.requires_oxygen },
    { label: "Generates Smoke", value: material.generates_smoke },
    { label: "Solid on Collision Explode", value: material.solid_on_collision_explode },
    { label: "Solid Go Through Sand", value: material.solid_go_through_sand },
    { label: "Always Ignites Damage Model", value: material.always_ignites_damagemodel },
    { label: "On Fire", value: material.on_fire },
  ];

  const liquidProperties = [
    { label: "Liquid Gravity", value: material.liquid_gravity },
    { label: "Liquid Sand", value: material.liquid_sand },
    { label: "Liquid Sticks to Ceiling", value: material.liquid_sticks_to_ceiling },
    { label: "Liquid Slime", value: material.liquid_slime },
    { label: "Liquid Stains", value: material.liquid_stains },
  ];

  const dangerProperties = [
    { label: "Danger Water", value: material.danger_water },
    { label: "Danger Radioactive", value: material.danger_radioactive },
    { label: "Danger Poison", value: material.danger_poison },
  ];

  const effectProperties = [
    { label: "Submerge Effect", value: material.submergeEffect },
    { label: "Stain Effect", value: material.stainEffect },
    { label: "Ingest Effect", value: material.ingestEffect },
  ];

  const visualAudioProperties = [
    { label: "GFX Glow", value: material.gfx_glow },
    { label: "Audio Physics Material Wall", value: material.audio_physics_material_wall },
    { label: "Audio Physics Material Solid", value: material.audio_physics_material_solid },
    { label: "Platform Type", value: material.platform_type },
  ];

  const relationshipProperties = [
    { label: "Parent Material", value: material.parent_material },
    { label: "Break Into", value: material.breakInto },
  ];

  const renderPropertySection = (title, properties) => {
    const visibleProperties = properties.filter((p) => p.value !== null && p.value !== undefined);
    if (visibleProperties.length === 0) return "";

    return html`
      <div class="property-section">
        <h4>${title}</h4>
        <dl>
          ${visibleProperties.map(
            ({ label, value }) => html`
              <dt>${label}:</dt>
              <dd>${formatValue(value)}</dd>
            `
          )}
        </dl>
      </div>
    `;
  };

  return html`
    <div class="material-details">
      <h3>${material.name} (${material.id})</h3>

      <div class="material-images">
        ${material.image_local && material.image_local !== "no_image_available.png"
          ? html`<img
              src="${getImagePath(material.image_local)}"
              alt="${material.name}"
              width=${tableImageWidth}
              height="auto"
              style="image-rendering: pixelated;"
            />`
          : ""} ${material.icon_local && material.icon_local !== "no_image_available.png"
          ? html`<img
              src="${getImagePath(material.icon_local)}"
              alt="${material.name} icon"
              width=${tableImageWidth}
              height="auto"
              style="image-rendering: pixelated;"
            />`
          : ""} ${material.pouch_local && material.pouch_local !== "no_image_available.png"
          ? html`<img
              src="${getImagePath(material.pouch_local)}"
              alt="${material.name} pouch"
              width=${tableImageWidth}
              height="auto"
              style="image-rendering: pixelated;"
            />`
          : ""}
      </div>

      ${material.wang
        ? html`<div class="wang-color-display">
            <h4>Wang Color:</h4>
            <div
              style="width: 60px; height: 20px; background-color: #${material.wang.length === 8
                ? material.wang.substring(2, 8)
                : material.wang}; border: 1px solid #ccc; display: inline-block; margin-right: 10px;"
            ></div>
            <code>${material.wang}</code>
          </div>`
        : ""} ${material.tags?.length
        ? html`<div class="material-tags">
            <h4>Tags:</h4>
            <div class="tags-container">${material.tags.map((tag) => html`<span class="tag">${tag}</span>`)}</div>
          </div>`
        : ""} ${material.biomes?.length
        ? html`<div class="material-biomes">
            <h4>Biomes:</h4>
            <div class="biomes-container">
              ${material.biomes.map((biome) => html`<span class="biome">${biome}</span>`)}
            </div>
          </div>`
        : ""} ${renderPropertySection("Basic Properties", basicProperties)} ${renderPropertySection(
        "Physical Properties",
        physicalProperties
      )} ${renderPropertySection("Thermal Properties", thermalProperties)} ${renderPropertySection(
        "Behavior Flags",
        behaviorFlags
      )} ${renderPropertySection("Liquid Properties", liquidProperties)} ${renderPropertySection(
        "Danger Properties",
        dangerProperties
      )} ${renderPropertySection("Effects", effectProperties)} ${renderPropertySection(
        "Visual & Audio",
        visualAudioProperties
      )} ${renderPropertySection("Relationships", relationshipProperties)} ${material.status_effects
        ? html`
            <div class="status-effects">
              <h4>Status Effects:</h4>
              <pre>${material.status_effects}</pre>
            </div>
          `
        : ""} ${material.notes
        ? html`
            <div class="material-notes">
              <h4>Notes:</h4>
              <p>${material.notes}</p>
            </div>
          `
        : ""}

      <div class="material-links">
        <a
          href="https://noita.wiki.gg/wiki/${encodeURIComponent(material.wikipage)}"
          target="_blank"
          class="wiki-link"
          >View on Wiki</a
        >
      </div>
    </div>
  `;
};

const selectedMaterial = Generators.input(materialsTable);
```

<div class="grid grid-cols-4 gap-4">
  <div clasBomb (BOMB)s="card grid-colspan-1">${searchMaterials}</div>
  <div class="card grid-colspan-1">${resetButton}</div>
</div>

<div class="grid grid-cols-4 gap-4">
  <div class="card grid-colspan-1" style="padding: 0;">
    ${materialsTable}
  </div>
  <div class="card grid-colspan-3">
    <h2>Selected material details</h2>
    ${materialDetails(selectedMaterial)}
  </div>
</div>
