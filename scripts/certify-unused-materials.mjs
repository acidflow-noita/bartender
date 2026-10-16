// Materialize already-reviewed conclusions. This script does not perform a
// scientific review or promote source-search candidates on its own.
import {readFileSync, writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";

const digest = (text) => createHash("sha256").update(text).digest("hex");
const directory = "src/data/material-availability/";

export function certifyUnusedMaterials(read) {
  const texts = Object.fromEntries(["source-review.json", "native-evidence.json", "closure-review.json", "validation-review.json"]
    .map((name) => [name, read(directory + name).replace(/\r\n/g, "\n")]));
  const source = JSON.parse(texts["source-review.json"]), native = JSON.parse(texts["native-evidence.json"]);
  const closure = JSON.parse(texts["closure-review.json"]);
  for (const [key, name] of [["sourceReview", "source-review.json"], ["nativeEvidence", "native-evidence.json"]]) {
    if (closure.inputSnapshots?.[key]?.sha256 !== digest(texts[name])) throw new Error(`Independent closure review is stale: ${name}`);
  }
  const executableSha256 = native.executable?.sha256;
  if (source.supportedBuild?.executableSha256 !== executableSha256) throw new Error("Source and native reviews target different builds");
  if (native.normalCreationClosure?.status !== "closed-for-listed-source-candidates") throw new Error("Native creation review is incomplete");
  const ids = Object.entries(closure.materials).filter(([, record]) => record.excludeAsUnused === true).map(([id]) => id).sort();
  const candidates = new Set(native.normalCreationClosure.candidateIds);
  const expected = [...(closure.summary.verifiedUnusedIds ?? [])].sort();
  if (JSON.stringify(ids) !== JSON.stringify(expected)) throw new Error("Independent review summary and material conclusions disagree");
  const materialsSha256 = digest(read("src/data/materials.xml").replace(/\r\n/g, "\n"));
  const evidence = (path, locator) => ({path: directory + path, locator});
  const materials = {};
  for (const id of ids) {
    const record = closure.materials[id], sourceRecord = source.allCandidateSourceClosure?.materials?.[id];
    if (record.status !== "unused" || record.verificationStatus !== "reviewed-source-and-native-closure"
        || record.remainingConcreteRoutes?.length !== 0 || !candidates.has(id)
        || !["source-mechanisms-closed-without-initial-seed", "source-closed-with-joint-unused-review"].includes(sourceRecord?.sourceVerdict)) {
      throw new Error(`Incomplete joint review: ${id}`);
    }
    const dependencies = record.conditionalDependencies ?? [];
    if (dependencies.some((dependency) => !ids.includes(dependency))) throw new Error(`Unverified source dependency: ${id}`);
    const ruledOut = (...refs) => ({conclusion: "ruled-out", evidence: refs});
    materials[id] = {reason: record.reason, sourceFinding: sourceRecord.sourceEntityOrTerrain.finding,
      evidence: [evidence("closure-review.json", `materials.${id}`)],
      verification: {status: "verified", executableSha256, materialsSha256,
        scope: record.scope, runtimeObserved: false, dependsOnUnused: dependencies,
        routes: {
          "registry-and-flasks": ruledOut(evidence("native-evidence.json", "flaskEnumeration"), evidence("validation-review.json", "flaskEligibilityReconstruction")),
          "world-and-entities": ruledOut(evidence("source-review.json", `allCandidateSourceClosure.materials.${id}`), evidence("closure-review.json", "nativeAssetCrossJoin")),
          "scripts-and-dynamic-loads": ruledOut(evidence("source-review.json", "sourceClosure.domains"), evidence("source-review.json", "corpusBindings")),
          "reactions-and-transformations": ruledOut(evidence("closure-review.json", `materials.${id}.incomingDefinitionReferences`), evidence("source-review.json", `allCandidateSourceClosure.materials.${id}.conditionalSourceDependencies`)),
          "native-creation": ruledOut(evidence("native-evidence.json", "normalCreationClosure"), evidence("closure-review.json", "satisfiedJoins")),
        }},
    };
  }
  return {schemaVersion: 2, scope: "Reviewed unused original material definitions in the pinned unmodified release. Unknown cases and actual cosmetic uses are retained.",
    basis: {executableSha256, materialsSha256, reviewDigests: Object.fromEntries(Object.entries(texts).map(([name, text]) => [name, digest(text)]))}, materials};
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const result = certifyUnusedMaterials((path) => readFileSync(resolve(root, path), "utf8"));
  writeFileSync(resolve(root, directory, "reviewed-unused.json"), JSON.stringify(result, null, 2) + "\n");
  console.log(`Materialized ${Object.keys(result.materials).length} reviewed unused certificates.`);
}
