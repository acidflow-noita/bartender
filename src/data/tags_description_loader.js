// Import required dependencies
import axios from "axios";
import * as cheerio from "cheerio";
import { promises as fs } from "fs";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function scrapeWikiPages(materialTags) {
  const enrichedData = [];

  for (const material of materialTags) {
    try {
      // Fetch the page content
      const response = await axios.get(material.url);
      const $ = cheerio.load(response.data);

      // Try both selector patterns
      let description = $("#mw-content-text > div.mw-parser-output > p").first().text().trim();

      if (!description) {
        description = $(
          "#mw-content-text > div.mw-parser-output > div.spoiler-toggle.noexcerpt > div.spoiler-content > p",
        )
          .first()
          .text()
          .trim();
      }

      // Add the description to the material object
      enrichedData.push({
        ...material,
        description: description || "No description found",
      });

      // Add a small delay to avoid overwhelming the server
      await new Promise((resolve) => setTimeout(resolve, 1000));

      console.log(`Successfully scraped: ${material.tag}`);
    } catch (error) {
      console.error(`Error scraping ${material.tag}: ${error.message}`);
      enrichedData.push({
        ...material,
        description: "Error fetching description",
      });
    }
  }

  return enrichedData;
}

// Usage example:
async function main() {
  try {
    // Read the JSON file
    const rawData = await fs.readFile(new URL("./_material_tags.json", import.meta.url));
    const materialTags = JSON.parse(rawData);

    const enrichedData = await scrapeWikiPages(materialTags);

    // Save the enriched data to a new file
    await fs.writeFile("material_tags_with_descriptions.json", JSON.stringify(enrichedData, null, 2));
    console.log("Scraping completed successfully!");
  } catch (error) {
    console.error("Main process error:", error);
  }
}

main();
