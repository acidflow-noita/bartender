import {readFileSync, writeFileSync, mkdirSync} from "node:fs";
import {resolve, join} from "node:path";
import {fileURLToPath} from "node:url";

export const modules = ["main", "fungal", "fungal_materials", "nolla_prng"];
const root = fileURLToPath(new URL("../", import.meta.url));
export const banner = "// Generated from the pinned noita-fungal submodule. Only import extensions change. Do not edit.\n";

export function compatibleSource(source) {
  for (const name of modules) {
    for (const quote of ['"', "'"]) {
      source = source.replaceAll(`${quote}./${name}.mjs${quote}`, `${quote}./${name}.js${quote}`);
    }
  }
  if (/\b(?:from|import)\s*["']\.\.?\/[^"']+\.mjs["']/.test(source)) {
    throw new Error("New noita-fungal module dependency: update the preview bridge before proceeding.");
  }
  return banner + source;
}

export function prepareFungal({sourceRoot = join(root, "src/vendor/noita-fungal"), outputRoot = join(root, "src/fungal/_upstream")} = {}) {
  // Read all inputs first. Never leave a half-updated bridge if a submodule is missing.
  const files = modules.map((name) => {
    let source;
    try { source = readFileSync(join(sourceRoot, `${name}.mjs`), "utf8"); }
    catch (error) {
      if (error.code !== "ENOENT") throw error;
      throw new Error("Fungal submodule is missing. Run: git submodule update --init --recursive");
    }
    return [join(outputRoot, `${name}.js`), compatibleSource(source)];
  });
  mkdirSync(outputRoot, {recursive: true});
  for (const [path, source] of files) {
    let current;
    try { current = readFileSync(path, "utf8"); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    if (current !== source) writeFileSync(path, source);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) prepareFungal();
