import * as fs from "fs";

function normalizeFilename(filename) {
  if (!filename) return "";
  return filename
    .toLowerCase()
    .replace(/[_\s]/g, "") // Remove underscores and spaces
    .replace(/^file:/, "") // Remove 'File:' prefix
    .replace(/\.(png|jpg|jpeg|gif)$/, ""); // Remove extension
}

function generateExpectedFilename(materialId, type) {
  switch (type) {
    case "image":
      return `Material_${materialId}.png`;
    case "icon":
      return `Material_icon_${materialId}.png`;
    case "pouch":
      return `Material_pouch_${materialId}.png`;
    default:
      return null;
  }
}

function processRawResponses() {
  const rawContent = fs.readFileSync("./src/data/images_downloader/MATERIALS_RAW_IMAGES_URLS_RESPONSES.txt", "utf8");
  const responses = rawContent
    .split("--- End of Response ---")
    .filter((response) => response.trim())
    .map((response) => {
      try {
        return JSON.parse(response.trim());
      } catch (e) {
        return null;
      }
    })
    .filter((response) => response !== null);

  const urlMap = {};
  responses.forEach((response) => {
    if (response.query && response.query.allimages) {
      response.query.allimages.forEach((image) => {
        const normalizedName = normalizeFilename(image.name);
        urlMap[normalizedName] = {
          url: image.url,
          local: image.name,
        };
      });
    }
  });

  fs.writeFileSync("DIRECT_URLS.json", JSON.stringify(urlMap, null, 2));
  return urlMap;
}

function processImageField(material, urlMap, type) {
  const normalizedName = normalizeFilename(material[type]);
  const matchedImage = urlMap[normalizedName];

  return {
    url: matchedImage ? matchedImage.url : null,
    local: matchedImage ? matchedImage.local : "no_image_available.png",
  };
}

function decodeHtmlEntities(text) {
  if (!text) return text;
  return text.replace(/&#039;/g, "'");
}

function findParentMaterial(xml, materialName) {
  const materialNodes =
    xml.match(/<CellData[^>]*>[\s\S]*?<\/CellData>|<CellDataChild[^>]*>[\s\S]*?<\/CellDataChild>/g) || [];

  for (const node of materialNodes) {
    if (node.includes(`name="${materialName}"`) && node.includes('_parent="')) {
      const parentMatch = node.match(/_parent="([^"]+)"/);
      if (parentMatch) {
        return parentMatch[1];
      }
    }
  }
  return null;
}

function extractWangColors(xmlContent) {
  const wangColors = {};

  // Break the XML into chunks at each CellData or CellDataChild tag
  const chunks = xmlContent.split(/(?=<CellData|<CellDataChild)/);

  for (const chunk of chunks) {
    // Find name and wang_color in each chunk, regardless of XML structure
    const nameMatch = chunk.match(/name="([^"]+)"/);
    const wangMatch = chunk.match(/wang_color="([^"]+)"/);

    // If both are found in the same chunk, they belong to the same material
    if (nameMatch && wangMatch) {
      const [_, name] = nameMatch;
      const [__, wang] = wangMatch;
      wangColors[name] = wang;
    }
  }

  return wangColors;
}

function extractAllMaterialProperties(xmlContent) {
  const materialProperties = {};

  // Break the XML into chunks at each CellData or CellDataChild tag
  const chunks = xmlContent.split(/(?=<CellData|<CellDataChild)/);

  for (const chunk of chunks) {
    const nameMatch = chunk.match(/name="([^"]+)"/);
    if (!nameMatch) continue;

    const materialName = nameMatch[1];
    const properties = {};

    // Extract all the properties we need
    const propertyPatterns = {
      wang_color: /wang_color="([^"]+)"/,
      viscosity: /viscosity="([^"]+)"/,
      temperature_of_fire: /temperature_of_fire="([^"]+)"/,
      solid_on_collision_explode: /solid_on_collision_explode="([^"]+)"/,
      solid_go_through_sand: /solid_go_through_sand="([^"]+)"/,
      solid_friction: /solid_friction="([^"]+)"/,
      requires_oxygen: /requires_oxygen="([^"]+)"/,
      hp: /hp="([^"]+)"/,
      generates_smoke: /generates_smoke="([^"]+)"/,
      fire_hp: /fire_hp="([^"]+)"/,
      danger_fire: /danger_fire="([^"]+)"/,
      autoignition_temperature: /autoignition_temperature="([^"]+)"/,
      audio_physics_material_wall: /audio_physics_material_wall="([^"]+)"/,
      audio_physics_material_solid: /audio_physics_material_solid="([^"]+)"/,
      always_ignites_damagemodel: /always_ignites_damagemodel="([^"]+)"/,
      gfx_glow: /gfx_glow="([^"]+)"/,
      platform_type: /platform_type="([^"]+)"/,
      liquid_gravity: /liquid_gravity="([^"]+)"/,
      danger_water: /danger_water="([^"]+)"/,
      danger_radioactive: /danger_radioactive="([^"]+)"/,
      danger_poison: /danger_poison="([^"]+)"/,
      liquid_sand: /liquid_sand="([^"]+)"/,
      liquid_sticks_to_ceiling: /liquid_sticks_to_ceiling="([^"]+)"/,
      liquid_slime: /liquid_slime="([^"]+)"/,
      liquid_stains: /liquid_stains="([^"]+)"/,
      stickyness: /stickyness="([^"]+)"/,
      on_fire: /on_fire="([^"]+)"/,
      _parent: /_parent="([^"]+)"/,
    };

    // Extract each property
    for (const [propName, pattern] of Object.entries(propertyPatterns)) {
      const match = chunk.match(pattern);
      if (match) {
        properties[propName] = match[1];
      }
    }

    // Extract status effects
    const statusEffectsMatch = chunk.match(/<StatusEffects>([\s\S]*?)<\/StatusEffects>/);
    if (statusEffectsMatch) {
      properties.status_effects = statusEffectsMatch[1].trim();
    }

    materialProperties[materialName] = properties;
  }

  return materialProperties;
}

function processMaterials(urlMap) {
  const materials = JSON.parse(fs.readFileSync("./src/data/materials.json", "utf8"));
  const materialsXml = fs.readFileSync("./src/data/materials.xml", "utf8");
  const allProperties = extractAllMaterialProperties(materialsXml);

  // Define all possible fields with their default values
  const defaultFields = {
    id: null,
    name: null,
    name_and_id: null,
    image: null,
    icon: null,
    pouchIcon: null,
    type: null,
    wang: null,
    tags: [],
    density: null,
    hardness: null,
    durability: null,
    lifetime: null,
    biomes: [],
    submergeEffect: null,
    stainEffect: null,
    ingestEffect: null,
    conductive: null,
    burnable: null,
    freezes: null,
    melts: null,
    breakInto: null,
    slippery: null,
    notes: null,
    wikipage: null,
    parent_material: null,
    image_url: null,
    image_local: null,
    icon_url: null,
    icon_local: null,
    pouch_url: null,
    pouch_local: null,
    // New XML-extracted fields
    viscosity: null,
    temperature_of_fire: null,
    solid_on_collision_explode: null,
    solid_go_through_sand: null,
    solid_friction: null,
    requires_oxygen: null,
    hp: null,
    generates_smoke: null,
    fire_hp: null,
    danger_fire: null,
    autoignition_temperature: null,
    audio_physics_material_wall: null,
    audio_physics_material_solid: null,
    always_ignites_damagemodel: null,
    gfx_glow: null,
    platform_type: null,
    liquid_gravity: null,
    danger_water: null,
    danger_radioactive: null,
    danger_poison: null,
    liquid_sand: null,
    liquid_sticks_to_ceiling: null,
    liquid_slime: null,
    liquid_stains: null,
    stickyness: null,
    on_fire: null,
    status_effects: null,
  };

  const processedMaterials = materials.map((material) => {
    // Start with default fields
    const processedMaterial = { ...defaultFields };

    // Copy all original material properties
    Object.keys(material).forEach((key) => {
      processedMaterial[key] = material[key];
    });

    // Add parent material info
    processedMaterial.parent_material = findParentMaterial(materialsXml, material.id);

    // Decode HTML entities
    processedMaterial.name = decodeHtmlEntities(processedMaterial.name);

    // Add name_and_id field
    processedMaterial.name_and_id = `${processedMaterial.name} (${processedMaterial.id})`;

    // Convert arrays
    processedMaterial.biomes = Array.isArray(material.biomes)
      ? material.biomes
      : material.biomes
          ?.split(",")
          .map((b) => b.trim())
          .filter(Boolean) || [];

    processedMaterial.tags = Array.isArray(material.tags)
      ? material.tags
      : material.tags
          ?.split(",")
          .map((t) => t.trim())
          .filter(Boolean) || [];

    // Process image fields
    const image = processImageField(material, urlMap, "image");
    const icon = processImageField(material, urlMap, "icon");
    const pouch = processImageField(material, urlMap, "pouchIcon");

    processedMaterial.image_url = image.url;
    processedMaterial.image_local = image.local;
    processedMaterial.icon_url = icon.url;
    processedMaterial.icon_local = icon.local;
    processedMaterial.pouch_url = pouch.url;
    processedMaterial.pouch_local = pouch.local;

    // Convert numeric fields from original material
    const numericFields = ["density", "hardness", "durability", "conductive", "burnable", "slippery", "lifetime"];
    numericFields.forEach((field) => {
      if (processedMaterial[field] != null) {
        processedMaterial[field] = Number(processedMaterial[field]);
      }
    });

    // Add XML-extracted properties
    const xmlProps = allProperties[material.id] || {};

    // Handle parent inheritance - if material has a parent, inherit parent's properties first
    let inheritedProps = {};
    if (xmlProps._parent && allProperties[xmlProps._parent]) {
      inheritedProps = { ...allProperties[xmlProps._parent] };
    }

    // Merge inherited properties with material's own properties
    const finalProps = { ...inheritedProps, ...xmlProps };

    // Convert numeric XML fields
    const xmlNumericFields = [
      "viscosity",
      "temperature_of_fire",
      "hp",
      "fire_hp",
      "autoignition_temperature",
      "gfx_glow",
      "platform_type",
      "liquid_gravity",
      "liquid_sand",
      "liquid_stains",
      "stickyness",
      "solid_friction",
    ];

    // Convert boolean XML fields
    const xmlBooleanFields = [
      "solid_on_collision_explode",
      "solid_go_through_sand",
      "requires_oxygen",
      "generates_smoke",
      "danger_fire",
      "always_ignites_damagemodel",
      "danger_water",
      "danger_radioactive",
      "danger_poison",
      "liquid_sticks_to_ceiling",
      "liquid_slime",
      "on_fire",
    ];

    // Apply XML properties to processed material
    Object.keys(finalProps).forEach((prop) => {
      if (prop === "_parent") return; // Skip internal parent reference

      let value = finalProps[prop];

      if (xmlNumericFields.includes(prop) && value != null) {
        processedMaterial[prop] = Number(value);
      } else if (xmlBooleanFields.includes(prop) && value != null) {
        processedMaterial[prop] = value === "1" || value === "true";
      } else if (prop === "wang_color") {
        processedMaterial.wang = value;
      } else {
        processedMaterial[prop] = value;
      }
    });

    return processedMaterial;
  });

  fs.writeFileSync("./src/data/FULL_MATERIALS_FINAL.json", JSON.stringify(processedMaterials, null, 2));
}

// Main execution
const urlMap = processRawResponses();
processMaterials(urlMap);
console.log("Processing complete! Check FULL_MATERIALS_FINAL.json for results.");
