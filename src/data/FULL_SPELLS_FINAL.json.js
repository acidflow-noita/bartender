import {readFileSync, writeFileSync} from "node:fs";
import {fileURLToPath, pathToFileURL} from "node:url";
import {createEntityReader, enrichSpellWithXMLData, parseComponentDump, parseLuaActions} from "./spell-data.js";

const localFile = (path) => fileURLToPath(new URL(path, import.meta.url));
const read = (path) => readFileSync(localFile(path), "utf8");

function normalizeFilename(filename) {
  return (filename ?? "").toLowerCase().replace(/[_\s]/g, "").replace(/^file:/, "").replace(/\.(png|jpg|jpeg|gif)$/, "");
}

// Rebuild offline from the checked-in game XML, resolved component dump and
// wiki metadata. --game-data can explicitly substitute an extracted data/ tree.
export function buildSpellData({gameDataDirectory, spells = JSON.parse(read("spells.json")), urls = JSON.parse(read("SPELLS_DIRECT_URLS.json"))} = {}) {
  const dump = parseComponentDump(read("spells_xml_parser_for_CE/NEWRAYENERGY.txt"));
  const actions = parseLuaActions(read("spells_xml_parser_for_CE/gun_actions.lua"));
  const readEntity = createEntityReader({rawDirectory: localFile("raw_data"), gameDataDirectory});
  return spells.map((spell) => {
    const enriched = enrichSpellWithXMLData(spell, dump, actions, readEntity);
    const image = urls[normalizeFilename(spell.image)];
    enriched.image_url = image?.url ?? null;
    enriched.image_local = image?.local ?? "no_image_available.png";
    return enriched;
  });
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== "--game-data")) {
    throw new Error("Usage: node src/data/FULL_SPELLS_FINAL.json.js [--game-data /path/to/extracted/data]");
  }
  const spells = buildSpellData({gameDataDirectory: args[1]});
  writeFileSync(localFile("FULL_SPELLS_FINAL.json"), JSON.stringify(spells, null, 2));
  console.log(`Processed ${spells.length} spells from local sources.`);
}
