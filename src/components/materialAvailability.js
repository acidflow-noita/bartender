export const UNUSED_CREATION_ROUTES = [
  "registry-and-flasks", "world-and-entities", "scripts-and-dynamic-loads",
  "reactions-and-transformations", "native-creation",
];

export function hasVerifiedUnusedEvidence(record, build) {
  return record?.status === "unused" && record.verification?.status === "verified"
    && (!build || record.verification.executableSha256 === build.executableSha256
      && record.verification.materialsSha256 === build.gameMaterialsSha256)
    && UNUSED_CREATION_ROUTES.every((route) => {
      const check = record.verification.routes?.[route];
      return check?.conclusion === "ruled-out" && Array.isArray(check.evidence) && check.evidence.length > 0;
    });
}

// Source-search candidates are never active exclusions. Every creation-route
// review must be present; old/incomplete reports fail open and keep materials.
export function getUnusedMaterialIds(audit) {
  if (audit?.schemaVersion !== 2 || audit.scope?.ruleset !== "unmodded"
      || !/^[a-f0-9]{64}$/.test(audit.source?.executableSha256 ?? "")) return new Set();
  const protectedIds = new Set(["air", ...(audit.randomFlaskPool?.liquids ?? []), ...(audit.randomFlaskPool?.sands ?? [])]);
  const excluded = new Set((audit.unusedIds ?? []).filter((id) => !protectedIds.has(id)
    && hasVerifiedUnusedEvidence(audit.materials?.[id], audit.source)));
  // A material whose only producer needs another unused material inherits that
  // dependency. If the supplier's review lapses, retain its dependents too.
  let changed;
  do {
    changed = false;
    for (const id of excluded) {
      if ((audit.materials[id].verification.dependsOnUnused ?? []).some((source) => !excluded.has(source))) {
        excluded.delete(id); changed = true;
      }
    }
  } while (changed);
  return excluded;
}

// Reaction pages need the verified filter set, not the full investigation.
// The complete report and evidence remain versioned separately.
export function materialExclusionIndex(report) {
  return {schemaVersion: report.schemaVersion, scope: report.scope,
    source: {executableSha256: report.source.executableSha256,
      gameMaterialsSha256: report.source.gameMaterialsSha256,
      materialRegistrySha256: report.source.materialRegistrySha256},
    randomFlaskPool: {liquids: report.randomFlaskPool.liquids, sands: report.randomFlaskPool.sands},
    unusedIds: report.unusedIds,
    materials: Object.fromEntries(report.unusedIds.map((id) => [id, {
      status: report.materials[id].status, verification: report.materials[id].verification,
    }])),
  };
}

export function reactionUsesUnusedMaterial(reaction, unusedIds, resolveTag = () => []) {
  const fields = ["reagent1", "reagent2", "reagent3", "product1", "product2", "product3",
    "input_cell1", "input_cell2", "input_cell3", "output_cell1", "output_cell2", "output_cell3"];
  return fields.some((key) => {
    const id = reaction[key];
    if (!id || typeof id !== "string") return false;
    if (id.startsWith("[") && id.endsWith("]")) {
      // A mixed tag remains useful. Exclude it only when every known member
      // is unused; an unresolved tag remains explicitly unclassified.
      const members = resolveTag(id);
      return members.length > 0 && members.every((member) => unusedIds.has(member));
    }
    return unusedIds.has(id);
  });
}
