// Engine cell classes, not the wiki's presentation categories. In this build,
// ordinary rock and powders are CLiquidCell with liquid_sand set; CSolidCell
// includes rigid/object cells.
// Native evidence and model boundaries: data/raw_data/digging-material-rules.json.
export function classifyDiggingMaterial(material) {
  if (!material || material.id === "air") return "air";
  if (material.is_just_particle_fx === true) return "particle";
  if (material.cell_type === "solid" || material.tags?.includes("[box2d]")) return "rigid";
  if (material.cell_type === "liquid") {
    if (material.liquid_sand === true) return "terrain";
    if (material.liquid_sand === false && material.liquid_static === false) return "liquid";
    if (material.liquid_sand === false && material.liquid_static === true) return "static-liquid";
    return "unknown";
  }
  if (material.cell_type === "gas" || material.cell_type === "fire") return material.cell_type;
  return "unknown";
}

// The native gate is ((state >> 16) & 32767) % 101 < eat_probability.
// This fraction is the nominal per-visit chance, not a whole-cast guarantee;
// the finite RNG also gives the modulo residues a small bias.
export function cellEatingProbability(setting) {
  return Number.isInteger(setting) ? Math.max(0, Math.min(101, setting)) / 101 : null;
}
