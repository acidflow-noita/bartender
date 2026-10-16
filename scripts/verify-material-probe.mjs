import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";

const prefix = "BARTENDER_MATERIAL_PROBE_V1 ";
const equalSet = (actual, expected) => Array.isArray(actual) && Array.isArray(expected) && actual.length === new Set(actual).size
  && actual.length === expected.length && expected.every((value) => actual.includes(value));

export function verifyMaterialProbe(log, {materials, flaskPool, binarySha256, expectedBinarySha256}) {
  const errors = [];
  if (!binarySha256 || binarySha256 !== expectedBinarySha256) errors.push("Executable hash does not match the audited build.");
  const records = [];
  for (const line of log.split(/\r?\n/)) {
    const start = line.indexOf(prefix);
    if (start < 0) continue;
    try {
      const record = JSON.parse(line.slice(start + prefix.length));
      if (!record || typeof record !== "object" || Array.isArray(record) || typeof record.kind !== "string") throw new Error("Invalid record");
      records.push(record);
    }
    catch { errors.push("Malformed probe record."); }
  }
  if (records.filter((record) => record.kind === "begin").length !== 1
      || records.filter((record) => record.kind === "end").length !== 1
      || records[0]?.kind !== "begin" || records.at(-1)?.kind !== "end") {
    errors.push("Provide exactly one complete probe capture, from begin through end.");
  }
  if (!equalSet(records[0]?.activeMods ?? [], ["bartender_material_probe"])) errors.push("The capture must have only the diagnostic probe enabled.");
  const knownKinds = new Set(["begin", "pool", "material", "end"]);
  if (records.some((record) => !knownKinds.has(record.kind))) errors.push("Unknown probe record kind.");
  const rows = records.filter((record) => record.kind === "material");
  if (!equalSet(rows.map((record) => record.name), materials.map((material) => material.id))) errors.push("Material names differ from the audited registry.");
  if (new Set(rows.map((record) => record.id)).size !== rows.length) errors.push("Duplicate numeric material IDs.");
  for (const [id, material] of materials.entries()) {
    const row = rows.find((row) => row.name === material.id);
    if (!row) continue;
    if (row.id !== id || row.roundTripName !== material.id) errors.push(`Registry ID/name mismatch: ${material.id}.`);
    if (!Array.isArray(row.tags) || !equalSet(row.tags, material.tags ?? [])) errors.push(`Material tags differ: ${material.id}.`);
  }
  if (records.at(-1)?.materialCount !== rows.length) errors.push("Capture count does not match its material records.");
  const pools = records.filter((record) => record.kind === "pool");
  const names = ["liquids_all", "sands_all", "gases_all", "fires_all", "solids_all", "liquids_flask", "sands_flask"];
  if (!equalSet(pools.map((pool) => pool.name), names)) errors.push("Missing or duplicate pool records.");
  for (const pool of pools) {
    if (!Array.isArray(pool.materials) || pool.materials.some((name) => !rows.some((row) => row.name === name))) errors.push(`Invalid pool members: ${pool.name}.`);
  }
  for (const [name, expected] of [["liquids_flask", flaskPool.liquids], ["sands_flask", flaskPool.sands]]) {
    const pool = pools.find((pool) => pool.name === name);
    if (!Array.isArray(pool?.materials) || !equalSet(pool.materials, expected)) errors.push(`Runtime flask pool differs: ${name}.`);
  }
  return {valid: errors.length === 0, errors, observedMaterialCount: rows.length,
    binarySha256, scope: "Registry and flask enumeration only; no natural material occurrence is established."};
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== "--log" || args[2] !== "--binary") throw new Error("Usage: node scripts/verify-material-probe.mjs --log /path/to/log --binary /path/to/noita.exe");
  const report = JSON.parse(readFileSync(new URL("../src/data/material-availability.json", import.meta.url)));
  const materials = JSON.parse(readFileSync(new URL("../src/data/materials.json", import.meta.url)));
  const result = verifyMaterialProbe(readFileSync(args[1], "utf8"), {materials,
    flaskPool: report.randomFlaskPool, expectedBinarySha256: report.source.executableSha256,
    binarySha256: createHash("sha256").update(readFileSync(args[3])).digest("hex")});
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.valid ? 0 : 1;
}
