import * as fs from "fs";

// Helper function to normalize filenames for comparison
function normalizeFilename(filename) {
  return filename
    .toLowerCase()
    .replace(/[_\s]/g, "") // Remove underscores and spaces
    .replace(/^file:/, "") // Remove 'File:' prefix
    .replace(/\.(png|jpg|jpeg|gif)$/, ""); // Remove extension
}

// 1. Process SPELLS_RAW_IMAGES_URLS_RESPONSES.txt into SPELLS_DIRECT_URLS.json
function processRawResponses() {
  const rawContent = fs.readFileSync("./images_downloader/SPELLS_RAW_IMAGES_URLS_RESPONSES.txt", "utf8");
  const responses = rawContent
    .split("--- End of Response ---")
    .filter(response => response.trim())
    .map(response => {
      try {
        return JSON.parse(response.trim());
      } catch (e) {
        return null;
      }
    })
    .filter(response => response !== null);

  // Create a map of normalized filenames to URLs and local filenames
  const urlMap = {};
  responses.forEach(response => {
    if (response.query && response.query.allimages) {
      response.query.allimages.forEach(image => {
        const normalizedName = normalizeFilename(image.name);
        urlMap[normalizedName] = {
          url: image.url,
          local: image.name,
        };
      });
    }
  });

  fs.writeFileSync("SPELLS_DIRECT_URLS.json", JSON.stringify(urlMap, null, 2));
  return urlMap;
}

// 2-4. Match and combine data
function processSpells(urlMap) {
  const spells = JSON.parse(fs.readFileSync("./spells.json", "utf8"));

  const processedSpells = spells.map(spell => {
    const processedSpell = { ...spell };

    // Process image
    if (spell.image) {
      const normalizedImage = normalizeFilename(spell.image);
      if (urlMap[normalizedImage]) {
        processedSpell.image_url = urlMap[normalizedImage].url;
        processedSpell.image_local = `${urlMap[normalizedImage].local}`;
      } else {
        processedSpell.image_url = null;
        processedSpell.image_local = null;
      }
    } else {
      processedSpell.image_url = null;
      processedSpell.image_local = null;
    }

    return processedSpell;
  });

  fs.writeFileSync("./FULL_SPELLS_FINAL.json", JSON.stringify(processedSpells, null, 2));
}

// Main execution
const urlMap = processRawResponses();
processSpells(urlMap);
console.log("Processing complete! Check FULL_SPELLS_FINAL.json for results.");
