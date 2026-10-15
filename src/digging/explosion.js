// A circular size estimate, not a reconstructed in-game crater contour.
// Native evidence establishes that a ray spends cell HP from its energy
// budget. Dividing energy by fresh-cell hardness estimates its axial reach;
// projecting that value into a circle omits directional/RNG details that
// have not been validated against in-game explosion footprints.
export function evaluateExplosionFootprint({radius, rayEnergy, hardness, durability, maxDurability}) {
  if (!Number.isFinite(radius) || radius < 0 || radius > 4096
    || ![rayEnergy, hardness, durability, maxDurability]
      .every((value) => Number.isInteger(value) && value >= 0 && value <= 2147483647)) return null;
  const eligible = durability <= maxDurability && rayEnergy > 0;
  const estimatedRadius = eligible
    ? Math.min(radius, hardness === 0 ? radius : Math.floor(rayEnergy / hardness)) : 0;
  return {kind: "explosion", radius: estimatedRadius, sourceRadius: radius,
    damagePerCell: eligible ? Math.min(rayEnergy, hardness) : 0, estimated: true};
}
