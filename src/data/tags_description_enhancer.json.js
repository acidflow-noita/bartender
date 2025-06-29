import fetch from 'node-fetch';
import fs from 'fs';
import * as cheerio from 'cheerio';

// Load the JSON data
const data = JSON.parse(fs.readFileSync('./src/data/jsons/tags.json', 'utf8'));

// Function to fetch and parse description from URL
async function fetchDescription(url) {
  try {
    const response = await fetch(url);
    const html = await response.text();
    const $ = cheerio.load(html);

    // Check both possible selectors for description
    let description = $("#mw-content-text > div.mw-parser-output > p").first().text().trim();
    if (!description) {
      description = $("#mw-content-text > div.mw-parser-output > div.spoiler-toggle.noexcerpt > div.spoiler-content > p")
        .first()
        .text()
        .trim();
    }

    // Return description or default message if empty
    return description || "No additional description";
  } catch (error) {
    console.error(`Failed to fetch description from ${url}:`, error);
    return "No additional description";
  }
}

// Main function to update descriptions
async function updateDescriptions() {
  for (const item of data) {
    item.description = await fetchDescription(item.url);
    console.log(`Fetched description for ${item.tag}: ${item.description}`);
  }

  // Save updated data back to JSON file
  fs.writeFileSync('./src/data/jsons/tags_enhanced.json', JSON.stringify(data, null, 2), 'utf8');
  console.log("Updated tags.json saved as tags_updated.json with descriptions.");
}

// Run the script
updateDescriptions();
