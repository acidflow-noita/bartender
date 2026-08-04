// ============================================================================
// TEST FIXTURES - Small hand-crafted dataset used by the unit tests
// ============================================================================

export const materials = [
  { id: "water", name: "Water", type: "liquid" },
  { id: "oil", name: "Oil", type: "liquid" },
  { id: "fire", name: "Fire", type: "fire" },
  { id: "steam", name: "Steam", type: "gas" },
  { id: "mud", name: "Mud", type: "solid" },
  { id: "fungus", name: "Fungus", type: "solid" }, // acts as a catalyst in the "swamp" reaction
  { id: "acid", name: "Acid", type: "liquid" },
  { id: "blood", name: "Blood", type: "liquid" },
  { id: "gold", name: "Gold", type: "solid" },
];

// One tag "liquids" grouping the liquid materials, used to test tag resolution.
export const materialAssociations = [
  { tag: "liquids", id: "water" },
  { tag: "liquids", id: "oil" },
  { tag: "liquids", id: "acid" },
  { tag: "liquids", id: "blood" },
];

export const reactions = [
  // 0: water + fire -> steam (simple, no catalyst)
  { reagent1: "water", reagent2: "fire", product1: "steam", reactionRate: 80 },
  // 1: fungus + water -> fungus + mud (fungus is a catalyst: present in input AND output)
  { reagent1: "fungus", reagent2: "water", product1: "fungus", product2: "mud", reactionRate: 20 },
  // 2: oil + fire -> steam (2 reagents, 1 product, no catalyst)
  { reagent1: "oil", reagent2: "fire", product1: "steam", reactionRate: 60 },
  // 3: acid + gold -> acid + blood (acid catalyst; also matches the [liquids] tag on input)
  { reagent1: "acid", reagent2: "gold", product1: "acid", product2: "blood", reactionRate: 10 },
  // 4: [liquids] + fire -> steam (tag-based reagent slot)
  { reagent1: "[liquids]", reagent2: "fire", product1: "steam", reactionRate: 40 },
  // 5: mud -> mud (single reagent, self reaction / trivial catalyst, low speed)
  { reagent1: "mud", product1: "mud", reactionRate: 5 },
];

export const reactionSources = {
  base: { name: "Base game", reactions },
};
