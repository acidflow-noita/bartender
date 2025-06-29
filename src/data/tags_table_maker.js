import * as fs from "fs";

const jsonData = JSON.parse(fs.readFileSync("FULL_MATERIALS_FINAL.json", "utf8"));

let uniqueTagsSet = new Set();

jsonData.forEach((material) => {
  if (typeof material.tags === "string") {
    const tags = material.tags.split(",");
    tags.forEach((tag) => tag.trim());
    tags.forEach((tag) => uniqueTagsSet.add(tag));
  } else if (Array.isArray(material.tags)) {
    material.tags.forEach((tag) => uniqueTagsSet.add(tag));
  }
});

const sortedUniqueTags = Array.from(uniqueTagsSet).sort();
const UNIQUE_TAGS = "UNIQUE_TAGS.txt";

fs.writeFileSync(UNIQUE_TAGS, sortedUniqueTags.join("\n"));

console.log("Unique tags written to UNIQUE_tags.txt");
