// A circular size estimate, not a reconstructed in-game crater contour.
// Native evidence establishes that a ray spends cell HP from its energy
// budget. Dividing energy by fresh-cell hardness estimates its axial reach;
// projecting that value into a circle omits directional/RNG details that
// have not been validated against in-game explosion footprints. The native
// ray helper caps an axial trace at 2048 pixels (0x656b10); other directions
// can take an extra unit step. Keep the configured radius separate from this
// nominal axial estimate rather than rejecting boosted radii above 4096.
export function evaluateExplosionFootprint({radius, rayEnergy, hardness, durability, maxDurability}) {
  // Squared length is converted to int32 before that native cap is applied.
  if (!Number.isFinite(radius) || radius < 0 || radius > 46340
    || ![rayEnergy, hardness, durability, maxDurability]
      .every((value) => Number.isInteger(value) && value >= 0 && value <= 2147483647)) return null;
  const eligible = durability <= maxDurability && rayEnergy > 0;
  const estimatedRadius = eligible
    ? Math.min(radius, 2048, hardness === 0 ? radius : Math.floor(rayEnergy / hardness)) : 0;
  return {kind: "explosion", radius: estimatedRadius, sourceRadius: radius,
    damagePerCell: eligible ? Math.min(rayEnergy, hardness) : 0, estimated: true};
}
