import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import {getUnusedMaterialIds, materialExclusionIndex} from "../src/components/materialAvailability.js";

export const sourceDigest = (value) => createHash("sha256").update(value).digest("hex");
const canonicalJson = (text) => JSON.stringify(JSON.parse(text));

export function validateMaterialAvailability(report, {materialsText, definitionsText, readSource}) {
  const errors = [];
  const sourceTexts = new Map(), evidenceDocuments = new Map();
  if (report.schemaVersion !== 2) errors.push("Unsupported material audit schema; regenerate the report.");
  if (report.scope?.ruleset !== "unmodded") errors.push("Material audit scope is not the unmodified game.");
  if (!/^[a-f0-9]{64}$/.test(report.source?.executableSha256 ?? "")) errors.push("Material audit lacks an executable identity.");
  const materials = JSON.parse(materialsText);
  const ids = materials.map((material) => material.id);
  if (ids.length !== new Set(ids).size || ids.length !== Object.keys(report.materials ?? {}).length
      || ids.some((id) => !report.materials?.[id])) errors.push("Material audit registry does not match materials.json.");
  if (sourceDigest(canonicalJson(materialsText)) !== report.source?.materialRegistrySha256) errors.push("Material data changed after the audit.");
  if (sourceDigest(definitionsText.replace(/\r\n/g, "\n")) !== report.source?.gameMaterialsSha256) errors.push("Material definitions changed after the audit.");
  if (!Array.isArray(report.source?.reviewInputs) || report.source.reviewInputs.length === 0) errors.push("Audit review inputs are not bound to file hashes.");
  for (const input of report.source?.reviewInputs ?? []) {
    try {
      if (!/^(scripts|src)\//.test(input.path) || input.path.split("/").includes("..")) throw new Error("Invalid source path");
      const text = readSource(input.path).replace(/\r\n/g, "\n");
      sourceTexts.set(input.path, text);
      if (sourceDigest(text) !== input.sha256) errors.push(`Audit input changed: ${input.path}.`);
    } catch { errors.push(`Audit input is unavailable: ${input.path}.`); }
  }
  const excluded = getUnusedMaterialIds(report);
  const declared = report.unusedIds ?? [];
  if (declared.length !== new Set(declared).size || declared.length !== excluded.size
      || declared.some((id) => !excluded.has(id))) errors.push("An exclusion lacks a complete creation-route review.");
  for (const [id, material] of Object.entries(report.materials ?? {})) {
    if (material.status === "unused" && !excluded.has(id)) errors.push(`Unverified unused claim: ${id}.`);
    if (!excluded.has(id)) continue;
    for (const route of Object.values(material.verification.routes)) {
      for (const reference of route.evidence) {
        if (!reference || typeof reference !== "object" || typeof reference.path !== "string"
            || typeof reference.locator !== "string"
            || !(report.source.reviewInputs ?? []).some((input) => input.path === reference.path)) {
          errors.push(`Unbound exclusion evidence: ${id}.`); continue;
        }
        try {
          if (!evidenceDocuments.has(reference.path)) evidenceDocuments.set(reference.path, JSON.parse(sourceTexts.get(reference.path)));
          const value = reference.locator.split(".").reduce((node, key) => node?.[key], evidenceDocuments.get(reference.path));
          if (value === undefined) errors.push(`Missing exclusion evidence: ${id} / ${reference.locator}.`);
        } catch { errors.push(`Unreadable exclusion evidence: ${id} / ${reference.path}.`); }
      }
    }
  }
  for (const id of [...(report.randomFlaskPool?.liquids ?? []), ...(report.randomFlaskPool?.sands ?? [])]) {
    if (excluded.has(id)) errors.push(`A flask-pool material is excluded: ${id}.`);
    if (!ids.includes(id)) errors.push(`Flask pool names an unknown material: ${id}.`);
  }
  return {valid: errors.length === 0, errors, excludedCount: excluded.size};
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const read = (path) => readFileSync(resolve(root, path), "utf8");
  const report = JSON.parse(read("src/data/material-availability.json"));
  const result = validateMaterialAvailability(report, {
    materialsText: read("src/data/materials.json"), definitionsText: read("src/data/materials.xml"), readSource: read,
  });
  if (!result.valid) throw new Error(result.errors.join("\n"));
  if (JSON.stringify(JSON.parse(read("src/data/unused-materials.json"))) !== JSON.stringify(materialExclusionIndex(report))) {
    throw new Error("The reaction filter index does not match the reviewed audit; regenerate it.");
  }
  console.log(`Material audit validated: ${result.excludedCount} verified exclusions.`);
}
