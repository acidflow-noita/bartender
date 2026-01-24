import * as fs from "fs";

// Load all reactions files
const reactionsVanilla = JSON.parse(fs.readFileSync("./src/data/reactions.json", "utf-8"));

const reactionsApotheosis = JSON.parse(fs.readFileSync("./src/data/apotheosis/reactions_apotheosis.json", "utf-8"));

const reactionsApotheosisSecret = JSON.parse(
  fs.readFileSync("./src/data/apotheosis/reactions_apotheosis_secret.json", "utf-8"),
);

// Combine all reactions into a single array
const allModsReactions = [...reactionsVanilla, ...reactionsApotheosis, ...reactionsApotheosisSecret];

// Save to file
fs.writeFileSync("./src/data/reactions_all_mods.json", JSON.stringify(allModsReactions, null, 2), "utf-8");

console.log(`✓ Generated reactions_all_mods.json with ${allModsReactions.length} reactions`);
