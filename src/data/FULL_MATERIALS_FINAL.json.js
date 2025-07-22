import * as fs from "fs";

function normalizeFilename(filename) {
  if (!filename) return "";
  return filename
    .toLowerCase()
    .replace(/[_\s]/g, "") // Remove underscores and spaces
    .replace(/^file:/, "") // Remove 'File:' prefix
    .replace(/\.(png|jpg|jpeg|gif)$/, ""); // Remove extension
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

function extractHealthPoints(xmlContent) {
  const healthPoints = {};

  // Break the XML into chunks at each CellData or CellDataChild tag
  const chunks = xmlContent.split(/(?=<CellData|<CellDataChild)/);

  for (const chunk of chunks) {
    // Find name and hp in each chunk
    const nameMatch = chunk.match(/name="([^"]+)"/);
    const hpMatch = chunk.match(/hp="([^"]+)"/);

    // If both are found in the same chunk, they belong to the same material
    if (nameMatch && hpMatch) {
      const [_, name] = nameMatch;
      const [__, hp] = hpMatch;
      healthPoints[name] = Number(hp);
    }
  }

  return healthPoints;
}

async function fetchWikiData() {
  console.log("Fetching wiki data...");
  const response = await fetch(
    "https://noita.wiki.gg/api.php?action=cargoquery&tables=Materials&fields=Materials.name,Materials.id,Materials.type,Materials.image,Materials.icon,Materials.pouchIcon,Materials._pageName=wikipage&group_by=Materials.id&order_by=Materials.name&limit=500&offset=0&format=json"
  );

  if (!response.ok) throw new Error(`Wiki fetch failed: ${response.status}`);
  const data = await response.json();

  return data.cargoquery.map((item) => item.title);
}

async function processMaterials(urlMap) {
  const technicalMaterials = JSON.parse(fs.readFileSync("./src/data/materials.json", "utf8"));
  const materialsXml = fs.readFileSync("./src/data/materials.xml", "utf8");
  const healthPoints = extractHealthPoints(materialsXml);

  // Fetch wiki data
  const wikiMaterials = await fetchWikiData();
  console.log(`Loaded ${wikiMaterials.length} materials from wiki`);

  const processedMaterials = technicalMaterials.map((material) => {
    // Start with the existing material data
    const processedMaterial = { ...material };

    // Find corresponding wiki data
    const wikiMaterial = wikiMaterials.find((wiki) => wiki.id === material.id);

    // Use wiki's type if available, otherwise keep original cell_type
    if (wikiMaterial && wikiMaterial.type) {
      processedMaterial.type = wikiMaterial.type;
    } else {
      processedMaterial.type = processedMaterial.cell_type || "";
    }

    // Handle special cases that should be "no type"
    if (material.id === "air" || material.id === "fungal_shift_particle_fx") {
      processedMaterial.type = "no type";
    }

    // Keep original cell_type for reference
    processedMaterial.original_cell_type = processedMaterial.cell_type;

    // Rename hp to hardness to avoid confusion
    if (processedMaterial.hp !== undefined) {
      processedMaterial.hardness = processedMaterial.hp;
      delete processedMaterial.hp;
    }

    // Add actual health points from XML
    if (healthPoints[material.id] !== undefined) {
      processedMaterial.hp = healthPoints[material.id];
    }

    // Add parent material info
    processedMaterial.parent_material = findParentMaterial(materialsXml, material.id);

    // Add wiki data (name, images, wikipage)
    if (wikiMaterial) {
      processedMaterial.name = decodeHtmlEntities(wikiMaterial.name);
      processedMaterial.image = wikiMaterial.image;
      processedMaterial.icon = wikiMaterial.icon;
      processedMaterial.pouchIcon = wikiMaterial.pouchIcon;
      processedMaterial.wikipage = wikiMaterial.wikipage;
    } else {
      console.warn(`No wiki data found for material: ${material.id}`);
      // Use ID as fallback name
      processedMaterial.name = material.id;
    }

    // Add name_and_id field
    processedMaterial.name_and_id = `${processedMaterial.name || processedMaterial.id} (${processedMaterial.id})`;

    // Process image fields
    const image = processImageField(processedMaterial, urlMap, "image");
    const icon = processImageField(processedMaterial, urlMap, "icon");
    const pouch = processImageField(processedMaterial, urlMap, "pouchIcon");

    processedMaterial.image_url = image.url;
    processedMaterial.image_local = image.local;
    processedMaterial.icon_url = icon.url;
    processedMaterial.icon_local = icon.local;
    processedMaterial.pouch_url = pouch.url;
    processedMaterial.pouch_local = pouch.local;

    // Clean up tags array if it's a string
    if (typeof processedMaterial.tags === "string") {
      processedMaterial.tags = processedMaterial.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
    }

    return processedMaterial;
  });

  fs.writeFileSync("./src/data/FULL_MATERIALS_FINAL.json", JSON.stringify(processedMaterials, null, 2));
}

// Main execution
async function main() {
  try {
    const urlMap = processRawResponses();
    await processMaterials(urlMap);
    console.log("Processing complete! Check FULL_MATERIALS_FINAL.json for results.");
  } catch (error) {
    console.error("Error during processing:", error);
  }
}

main();
