import * as fs from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {fetchCargo} from "../../scripts/data/wiki.mjs";
import {queries} from "../../scripts/refresh-data.mjs";
import {writeJsonAtomic} from "../../scripts/data/io.mjs";
const read = path => fs.readFileSync(new URL(path, import.meta.url), "utf8");

function normalizeFilename(filename) {
  if (!filename) return "";
  return filename
    .toLowerCase()
    .replace(/[_\s]/g, "") // Remove underscores and spaces
    .replace(/^file:/, "") // Remove 'File:' prefix
    .replace(/\.(png|jpg|jpeg|gif)$/, ""); // Remove extension
}

export function processRawResponses(rawContent = read("./images_downloader/MATERIALS_RAW_IMAGES_URLS_RESPONSES.txt")) {
  const responses = rawContent
    .split("--- End of Response ---")
    .filter((response) => response.trim())
    .map((response) => {
      return JSON.parse(response.trim());
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

  return urlMap;
}

export function processImageField(material, urlMap, type) {
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

export function buildMaterialData({wikiMaterials, urlMap = processRawResponses(),
  technicalMaterials = JSON.parse(read("./materials.json")), materialsXml = read("./materials.xml")} = {}) {
  if (!Array.isArray(wikiMaterials)) throw new Error("Provide a cached wiki materials snapshot");
  const healthPoints = extractHealthPoints(materialsXml);

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

  return processedMaterials;
}

// Explicit refresh only. Normal dev/build never fetches the wiki.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== "--wiki-snapshot")) throw new Error("Usage: node src/data/FULL_MATERIALS_FINAL.json.js [--wiki-snapshot materials-wiki.json]");
  const wikiMaterials = args[1] ? JSON.parse(fs.readFileSync(resolve(args[1]), "utf8")) : await fetchCargo(queries.materials);
  const urlMap = processRawResponses();
  const materials = buildMaterialData({wikiMaterials, urlMap});
  writeJsonAtomic(new URL("./DIRECT_URLS.json", import.meta.url), urlMap);
  writeJsonAtomic(new URL("./FULL_MATERIALS_FINAL.json", import.meta.url), materials);
  console.log(`Processed ${materials.length} materials.`);
}
