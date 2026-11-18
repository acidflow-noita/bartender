// ============================================================================
// REACTION KEY - Stable identity of a reaction, independent of where it sits in a list
// ============================================================================
// Reaction indices depend on the reaction source (base game, Apotheosis, all mods...), so they
// can't identify a reaction in something saved or shared (e.g. excluded reactions). Its content
// can: reagents, products and speed, in slot order. Two reactions with the same key are the
// same reaction for every purpose of the app.

const SLOTS = {
  reagents: ["reagent1", "reagent2", "reagent3"],
  products: ["product1", "product2", "product3"],
};

export function reactionKey(reaction) {
  const side = (fields) => fields.map((field) => reaction?.[field] || "").join("+");
  return `${side(SLOTS.reagents)}>${side(SLOTS.products)}@${reaction?.reactionRate ?? ""}`;
}

// The fields a key is made of, enough to list a reaction again (e.g. an excluded one that the
// current reaction source doesn't have).
export function reactionSnapshot(reaction) {
  const snapshot = { reactionRate: reaction?.reactionRate ?? null };
  [...SLOTS.reagents, ...SLOTS.products].forEach((field) => {
    snapshot[field] = reaction?.[field] || null;
  });
  return snapshot;
}
