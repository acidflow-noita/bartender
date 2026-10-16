import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {verifyMaterialProbe} from "../scripts/verify-material-probe.mjs";
import {sourceDigest, validateMaterialAvailability} from "../scripts/validate-material-availability.mjs";
import {certifyUnusedMaterials} from "../scripts/certify-unused-materials.mjs";

const binarySha256 = "a".repeat(64);
const materials = [{id: "air", tags: []}, {id: "water", tags: ["[water]"]}];
const records = [
  {kind: "begin", activeMods: ["bartender_material_probe"]},
  ...["liquids_all", "sands_all", "gases_all", "fires_all", "solids_all", "liquids_flask", "sands_flask"]
    .map((name) => ({kind: "pool", name, materials: name.startsWith("liquids") ? ["water"] : []})),
  ...materials.map((material, id) => ({kind: "material", name: material.id, id, roundTripName: material.id, tags: material.tags})),
  {kind: "end", materialCount: 2},
];
const log = (rows) => rows.map((row) => "BARTENDER_MATERIAL_PROBE_V1 " + JSON.stringify(row)).join("\n");
const verify = (rows, options = {}) => verifyMaterialProbe(log(rows), {materials, flaskPool: {liquids: ["water"], sands: []}, binarySha256,
  expectedBinarySha256: binarySha256, ...options});

test("probe imports a complete capture without interpreting it as gameplay occurrence", () => {
  const result = verify(records);
  assert.equal(result.valid, true);
  assert.match(result.scope, /no natural material occurrence/);
});

test("probe rejects incomplete, mixed-mod, duplicate and contradictory observations", () => {
  for (const mutate of [
    (rows) => rows.pop(),
    (rows) => rows[0].activeMods.push("some_material_mod"),
    (rows) => rows.splice(1, 0, {...rows[1]}),
    (rows) => { rows.find((row) => row.kind === "material" && row.id === 1).id = 0; },
    (rows) => { rows.find((row) => row.kind === "material" && row.id === 1).roundTripName = "other"; },
    (rows) => { rows.find((row) => row.name === "liquids_flask").materials.push("air"); },
    (rows) => { rows.at(-1).materialCount = 500; },
  ]) {
    const rows = structuredClone(records); mutate(rows);
    assert.equal(verify(rows).valid, false);
  }
  assert.equal(verify(records, {binarySha256: "b".repeat(64)}).valid, false);
  assert.equal(verify([...records, ...records]).valid, false);
});

function auditFixture() {
  const materialsText = JSON.stringify(materials), definitionsText = "<Materials/>\n";
  const evidenceText = '{"review":"pending"}\n';
  const report = {schemaVersion: 2, scope: {ruleset: "unmodded"}, unusedIds: [],
    materials: {air: {status: "obtainable"}, water: {status: "obtainable"}},
    randomFlaskPool: {liquids: ["water"], sands: []},
    source: {executableSha256: binarySha256, materialRegistrySha256: sourceDigest(materialsText),
      gameMaterialsSha256: sourceDigest(definitionsText),
      reviewInputs: [{path: "src/data/review.json", sha256: sourceDigest(evidenceText)}]},
  };
  return {report, inputs: {materialsText, definitionsText, readSource: () => evidenceText}};
}

test("audit validation rejects stale registry, definitions and review artifacts", () => {
  const {report, inputs} = auditFixture();
  assert.equal(validateMaterialAvailability(report, inputs).valid, true);
  for (const changes of [
    {materialsText: JSON.stringify([...materials, {id: "new_material"}])},
    {definitionsText: '<Materials changed="1"/>\n'},
    {readSource: () => '{"review":"changed"}\n'},
    {readSource: () => { throw new Error("missing"); }},
  ]) assert.equal(validateMaterialAvailability(report, {...inputs, ...changes}).valid, false);
});

test("an unused label cannot pass validation without its creation-route evidence", () => {
  const {report, inputs} = auditFixture();
  report.materials.water = {status: "unused", confidence: "strong-source-evidence"};
  report.unusedIds.push("water");
  const result = validateMaterialAvailability(report, inputs);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("creation-route")));
});

const readRepo = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("certificate materialization preserves reviewed dependencies and protects positive or unresolved native uses", () => {
  const result = certifyUnusedMaterials(readRepo);
  const closure = JSON.parse(readRepo("src/data/material-availability/closure-review.json"));
  assert.deepEqual(Object.keys(result.materials).sort(), [...closure.summary.verifiedUnusedIds].sort());
  assert.deepEqual(result.materials.aluminium_oxide.verification.dependsOnUnused, ["aluminium"]);
  assert.equal(result.materials.fungal_shift_particle_fx, undefined);
  assert.equal(result.materials.rainbow_gas, undefined);
  assert.equal(result.materials.spark_player, undefined);
});

test("changed evidence and reopened creation routes cannot silently produce exclusion certificates", () => {
  const sourcePath = "src/data/material-availability/source-review.json";
  assert.throws(() => certifyUnusedMaterials((path) => readRepo(path) + (path === sourcePath ? " " : "")), /stale/);
  const closurePath = "src/data/material-availability/closure-review.json";
  const mutateClosure = (mutate) => certifyUnusedMaterials((path) => {
    if (path !== closurePath) return readRepo(path);
    const closure = JSON.parse(readRepo(path)); mutate(closure); return JSON.stringify(closure);
  });
  assert.throws(() => mutateClosure((closure) => closure.materials.corruption_static.remainingConcreteRoutes.push("new-spawn-source")), /Incomplete joint review/);
  assert.throws(() => mutateClosure((closure) => { closure.materials.aluminium_oxide.conditionalDependencies = ["water"]; }), /Unverified source dependency/);
});
