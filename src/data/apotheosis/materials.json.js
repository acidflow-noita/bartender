import { readFileSync } from "node:fs";
import { XMLParser } from "fast-xml-parser";
import { apotheosisMaterials } from "../../fungal/catalog.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const parser = new XMLParser({ignoreAttributes: false, attributeNamePrefix: ""});
const base = JSON.parse(read("../FULL_MATERIALS_FINAL.json"));
const documents = [
  {data: parser.parse(read("./custom_materials.xml")), secret: false},
  {data: parser.parse(read("./secret_materials.xml")), secret: true},
];
process.stdout.write(JSON.stringify(apotheosisMaterials(base, documents)));
