import * as fs from "fs";

// File paths
const PATHS = {
  spells: "./src/data/spells.json",
  xmlData: "./src/data/spells_xml_parser_for_CE/NEWRAYENERGY.txt",
  luaActions: "./src/data/spells_xml_parser_for_CE/gun_actions.lua",
  urlResponses: "./src/data/images_downloader/SPELLS_RAW_IMAGES_URLS_RESPONSES.txt",
  output: "./src/data/FULL_SPELLS_FINAL.json",
  urlMap: "./src/data/SPELLS_DIRECT_URLS.json",
};

function normalizeFilename(filename) {
  if (!filename) return "";
  return filename
    .toLowerCase()
    .replace(/[_\s]/g, "")
    .replace(/^file:/, "")
    .replace(/\.(png|jpg|jpeg|gif)$/, "");
}

function processRawResponses() {
  const rawContent = fs.readFileSync(PATHS.urlResponses, "utf8");
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

  fs.writeFileSync(PATHS.urlMap, JSON.stringify(urlMap, null, 2));
  return urlMap;
}

function parseXMLData() {
  const xmlContent = fs.readFileSync(PATHS.xmlData, "utf8");
  const xmlMap = new Map();

  // Split by XML file sections
  const sections = xmlContent.split(/=== (.+\.xml) ===/);

  for (let i = 1; i < sections.length; i += 2) {
    const filename = sections[i];
    const content = sections[i + 1];

    if (!content) continue;

    const xmlData = {};
    let currentComponent = null;

    const lines = content.trim().split("\n");

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      // Check if it's a component header
      if (trimmedLine.endsWith(":") && !trimmedLine.includes("  ")) {
        currentComponent = trimmedLine.replace(":", "");
        xmlData[currentComponent] = {};
        continue;
      }

      // Parse property within component
      if (currentComponent && trimmedLine.includes(":")) {
        const [key, ...valueParts] = trimmedLine.split(":");
        const value = valueParts.join(":").trim();

        // Convert numeric values
        let parsedValue = value;
        if (value === "true") parsedValue = true;
        else if (value === "false") parsedValue = false;
        else if (value === "") parsedValue = null;
        else if (!isNaN(value) && value !== "") parsedValue = Number(value);

        xmlData[currentComponent][key.trim()] = parsedValue;
      }
    }

    // Extract filename without path and extension for matching
    const baseFilename = filename.replace(/^.*\//, "").replace(/\.xml$/, "");
    xmlMap.set(baseFilename, xmlData);
  }

  console.log(`Parsed ${xmlMap.size} XML files`);
  return xmlMap;
}

function parseLuaActions() {
  const luaContent = fs.readFileSync(PATHS.luaActions, "utf8");
  const actionMap = new Map();

  // Extract action entries
  const actionMatches = luaContent.matchAll(/{\s*id\s*=\s*"([^"]+)"[\s\S]*?related_projectiles\s*=\s*{\s*([^}]+)\s*}/g);

  for (const match of actionMatches) {
    const id = match[1];
    const projectilesStr = match[2];

    // Extract projectile paths
    const projectilePaths = [];
    const pathMatches = projectilesStr.matchAll(/"([^"]+)"/g);

    for (const pathMatch of pathMatches) {
      projectilePaths.push(pathMatch[1]);
    }

    actionMap.set(id, projectilePaths);
  }

  console.log(`Parsed ${actionMap.size} Lua actions`);
  return actionMap;
}

function findBestXMLMatch(spellId, xmlMap, luaActions) {
  // First, try to find from lua actions
  const projectilePaths = luaActions.get(spellId);

  if (projectilePaths && projectilePaths.length > 0) {
    for (const path of projectilePaths) {
      const filename = path.replace(/^.*\//, "").replace(/\.xml$/, "");
      if (xmlMap.has(filename)) {
        return xmlMap.get(filename);
      }
    }
  }

  // Fallback: try direct filename matching
  const possibleFilenames = [
    spellId.toLowerCase(),
    spellId.toLowerCase().replace(/_/g, ""),
    spellId.toLowerCase().replace(/shot$/, ""),
    spellId.toLowerCase().replace(/^material_/, ""),
  ];

  for (const filename of possibleFilenames) {
    if (xmlMap.has(filename)) {
      return xmlMap.get(filename);
    }
  }

  return null;
}

function enrichSpellWithXMLData(spell, xmlMap, luaActions) {
  const xmlData = findBestXMLMatch(spell.id, xmlMap, luaActions);

  // Create enriched spell with all original data
  const enrichedSpell = { ...spell };

  // Add name_and_id field
  enrichedSpell.name_and_id = `${spell.name} (${spell.id})`;

  // Extract and add XML data if available
  if (xmlData) {
    // ProjectileComponent data
    const projectileComponent = xmlData.ProjectileComponent;
    if (projectileComponent) {
      enrichedSpell.rayEnergy = projectileComponent.ray_energy !== undefined ? projectileComponent.ray_energy : null;
      enrichedSpell.maxDuraToDestroy =
        projectileComponent.explosion_max_durability_to_destroy !== undefined
          ? projectileComponent.explosion_max_durability_to_destroy
          : null;
      enrichedSpell.groundPenetrationCoeff =
        projectileComponent.ground_penetration_coeff !== undefined
          ? projectileComponent.ground_penetration_coeff
          : null;
      enrichedSpell.groundPenetrationMaxDura =
        projectileComponent.ground_penetration_max_durability_to_destroy !== undefined
          ? projectileComponent.ground_penetration_max_durability_to_destroy
          : null;
      enrichedSpell.spawnEntity =
        projectileComponent.spawn_entity !== undefined ? projectileComponent.spawn_entity : null;
      enrichedSpell.spawnEntityIsProjectile =
        projectileComponent.spawn_entity_is_projectile !== undefined
          ? projectileComponent.spawn_entity_is_projectile
          : null;
    }

    // LaserEmitterComponent data
    const laserEmitterComponent = xmlData.LaserEmitterComponent;
    if (laserEmitterComponent) {
      // Map LaserEmitterComponent properties to your desired field names
      enrichedSpell.radius = laserEmitterComponent.beam_radius !== undefined ? laserEmitterComponent.beam_radius : null;

      // For maxDuraToDestroy, prioritize LaserEmitterComponent over ProjectileComponent if both exist
      if (laserEmitterComponent.max_cell_durability_to_destroy !== undefined) {
        enrichedSpell.maxDuraToDestroy = laserEmitterComponent.max_cell_durability_to_destroy;
      } else if (!enrichedSpell.maxDuraToDestroy) {
        enrichedSpell.maxDuraToDestroy = null;
      }

      // For rayEnergy, prioritize LaserEmitterComponent over ProjectileComponent if both exist
      if (laserEmitterComponent.damage_to_cells !== undefined) {
        enrichedSpell.rayEnergy = laserEmitterComponent.damage_to_cells;
      } else if (!enrichedSpell.rayEnergy) {
        enrichedSpell.rayEnergy = null;
      }
    }

    // CellEaterComponent data
    const cellEaterComponent = xmlData.CellEaterComponent;
    if (cellEaterComponent) {
      enrichedSpell.cellEaterRadius = cellEaterComponent.radius !== undefined ? cellEaterComponent.radius : null;
      enrichedSpell.cellEaterLimitedMaterials =
        cellEaterComponent.limited_materials !== undefined ? cellEaterComponent.limited_materials : null;
      enrichedSpell.cellEaterIgnoredMaterialTag =
        cellEaterComponent.ignored_material_tag !== undefined ? cellEaterComponent.ignored_material_tag : null;
      enrichedSpell.cellEaterMaterials =
        cellEaterComponent.materials !== undefined ? cellEaterComponent.materials : null;
    }

    // BlackHoleComponent data
    const blackHoleComponent = xmlData.BlackHoleComponent;
    if (blackHoleComponent) {
      enrichedSpell.blackHoleRadius = blackHoleComponent.radius !== undefined ? blackHoleComponent.radius : null;
    }

    // MagicConvertMaterialComponent data
    const magicConvertComponent = xmlData.MagicConvertMaterialComponent;
    if (magicConvertComponent) {
      enrichedSpell.magicConvertRadius =
        magicConvertComponent.radius !== undefined ? magicConvertComponent.radius : null;
      enrichedSpell.magicConvertIsCircle =
        magicConvertComponent.is_circle !== undefined ? magicConvertComponent.is_circle : null;
      enrichedSpell.magicConvertFromAnyMaterial =
        magicConvertComponent.from_any_material !== undefined ? magicConvertComponent.from_any_material : null;
    }

    // PhysicsBodyComponent (just mark if present)
    enrichedSpell.hasPhysicsBody = xmlData.PhysicsBodyComponent !== undefined ? true : null;

    // Add source tracking
    enrichedSpell.xmlDataSource = "parsed";
  } else {
    // Set all XML fields to null if no data found
    enrichedSpell.rayEnergy = null;
    enrichedSpell.maxDuraToDestroy = null;
    enrichedSpell.radius = null;
    enrichedSpell.groundPenetrationCoeff = null;
    enrichedSpell.groundPenetrationMaxDura = null;
    enrichedSpell.spawnEntity = null;
    enrichedSpell.spawnEntityIsProjectile = null;
    enrichedSpell.cellEaterRadius = null;
    enrichedSpell.cellEaterLimitedMaterials = null;
    enrichedSpell.cellEaterIgnoredMaterialTag = null;
    enrichedSpell.cellEaterMaterials = null;
    enrichedSpell.blackHoleRadius = null;
    enrichedSpell.magicConvertRadius = null;
    enrichedSpell.magicConvertIsCircle = null;
    enrichedSpell.magicConvertFromAnyMaterial = null;
    enrichedSpell.hasPhysicsBody = null;
    enrichedSpell.xmlDataSource = null;
  }

  return enrichedSpell;
}

function processSpells(urlMap) {
  const spells = JSON.parse(fs.readFileSync(PATHS.spells, "utf8"));

  // Parse XML and Lua data
  const xmlMap = parseXMLData();
  const luaActions = parseLuaActions();

  const processedSpells = spells.map((spell) => {
    // Enrich with XML data
    let processedSpell = enrichSpellWithXMLData(spell, xmlMap, luaActions);

    // Process image URLs
    if (spell.image) {
      const normalizedImage = normalizeFilename(spell.image);
      if (urlMap[normalizedImage]) {
        processedSpell.image_url = urlMap[normalizedImage].url;
        processedSpell.image_local = urlMap[normalizedImage].local;
      } else {
        processedSpell.image_url = null;
        processedSpell.image_local = "no_image_available.png";
      }
    } else {
      processedSpell.image_url = null;
      processedSpell.image_local = "no_image_available.png";
    }

    return processedSpell;
  });

  fs.writeFileSync(PATHS.output, JSON.stringify(processedSpells, null, 2));
  console.log(`Processed ${processedSpells.length} spells`);

  // Log statistics
  const withXMLData = processedSpells.filter((s) => s.xmlDataSource === "parsed").length;
  const withRayEnergy = processedSpells.filter((s) => s.rayEnergy !== null).length;
  const withMaxDura = processedSpells.filter((s) => s.maxDuraToDestroy !== null).length;
  const withRadius = processedSpells.filter((s) => s.radius !== null).length;

  console.log(`Statistics:`);
  console.log(`- Spells with XML data: ${withXMLData}`);
  console.log(`- Spells with ray energy: ${withRayEnergy}`);
  console.log(`- Spells with max durability: ${withMaxDura}`);
  console.log(`- Spells with radius: ${withRadius}`);
}

// Main execution
try {
  console.log("Starting enhanced spell processing...");

  const urlMap = processRawResponses();
  processSpells(urlMap);

  console.log("Processing complete! Check FULL_SPELLS_FINAL.json for results.");
} catch (error) {
  console.error("Error during processing:", error);
}
