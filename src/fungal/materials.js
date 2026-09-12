// Unmodified noita-fungal dd54fd7 logic; only import paths adapted. See NOTICE.txt.
// From Lymm's Telescope, https://github.com/Lymm37/noita-telescope/blob/main/js/fungal_shifts.js
import { NollaPrng } from './nolla-prng.js';

const materialsFromVanilla = [
  { probability: 1.0, materials: [ "water", "water_static", "water_salt", "water_ice" ], name_material: "water" },
  { probability: 1.0, materials: [ "lava" ] },
  { probability: 1.0, materials: [ "radioactive_liquid", "poison", "material_darkness" ], name_material: "radioactive_liquid"},
  { probability: 1.0, materials: [ "oil", "swamp", "peat" ], name_material: "oil" },
  { probability: 1.0, materials: [ "blood" ] },
  { probability: 1.0, materials: [ "blood_fungi", "fungi", "fungisoil" ], name_material: "fungi" },
  { probability: 1.0, materials: [ "blood_cold", "blood_worm" ] },
  { probability: 1.0, materials: [ "acid" ] },
  { probability: 0.4, materials: [ "acid_gas", "acid_gas_static", "poison_gas", "fungal_gas", "radioactive_gas", "radioactive_gas_static" ], name_material: "acid_gas" },
  { probability: 0.4, materials: [ "magic_liquid_polymorph", "magic_liquid_unstable_polymorph" ], name_material: "magic_liquid_polymorph" },
  { probability: 0.4, materials: [ "magic_liquid_berserk", "magic_liquid_charm", "magic_liquid_invisibility" ] },
  { probability: 0.6, materials: [ "diamond" ] },
  { probability: 0.6, materials: [ "silver", "brass", "copper" ] },
  { probability: 0.2, materials: [ "steam", "smoke" ] },
  { probability: 0.4, materials: [ "sand" ] },
  { probability: 0.4, materials: [ "snow_sticky" ] },
  { probability: 0.05, materials: [ "rock_static" ] },
  { probability: 0.0003, materials: [ "gold", "gold_box2d" ], name_material: "gold" }
];

export const materialsFrom = {
  vanilla: materialsFromVanilla,
  apotheosis: [
    ...materialsFromVanilla,
    { probability: 0.2, materials: [ "apotheosis_cursed_liquid_red_static", "apotheosis_cursed_liquid_red" ], name_material: "apotheosis_cursed_liquid_red_static" }
  ],
  apotheosis_bungal: [
    { probability: 1.0, materials: [ "water", "water_static", "water_salt", "water_ice" ], name_material: "water" },
    { probability: 1.0, materials: [ "lava" ] },
    { probability: 1.0, materials: [ "radioactive_liquid", "poison", "material_darkness" ], name_material: "radioactive_liquid"},
    { probability: 1.0, materials: [ "oil", "swamp", "peat" ], name_material: "oil" },
    { probability: 1.0, materials: [ "blood" ] },
    { probability: 1.0, materials: [ "blood_fungi", "fungi", "fungisoil" ], name_material: "fungi" },
    { probability: 1.0, materials: [ "blood_cold", "blood_worm" ] },
    { probability: 1.0, materials: [ "acid" ] },
    { probability: 0.4, materials: [ "acid_gas", "acid_gas_static", "poison_gas", "fungal_gas", "radioactive_gas", "radioactive_gas_static" ], name_material: "acid_gas" },
    { probability: 0.4, materials: [ "magic_liquid_polymorph", "magic_liquid_unstable_polymorph" ], name_material: "magic_liquid_polymorph" },
    { probability: 0.4, materials: [ "magic_liquid_berserk", "magic_liquid_charm", "magic_liquid_invisibility" ] },
    { probability: 0.6, materials: [ "diamond" ] },
    { probability: 0.6, materials: [ "silver", "brass", "copper" ] },
    { probability: 0.2, materials: [ "steam", "smoke" ] },
    { probability: 0.4, materials: [ "sand" ] },
    { probability: 0.4, materials: [ "snow_sticky" ] },
    { probability: 0.2, materials: [ "apotheosis_cursed_liquid_red_static", "apotheosis_cursed_liquid_red" ], name_material: "apotheosis_cursed_liquid_red_static" },
    { probability: 0.05, materials: [ "rock_static" ] },
    { probability: 0.0003, materials: [ "gold", "gold_box2d" ], name_material: "gold" }
  ],
  apotheosis_bungal_spam: [
    { probability: 1.0, materials: [ "water", "water_static", "water_salt", "water_ice" ], name_material: "water" },
    { probability: 1.0, materials: [ "lava" ] },
    { probability: 1.0, materials: [ "radioactive_liquid", "poison", "material_darkness" ], name_material: "radioactive_liquid"},
    { probability: 1.0, materials: [ "oil", "swamp", "peat" ], name_material: "oil" },
    { probability: 1.0, materials: [ "blood" ] },
    { probability: 1.0, materials: [ "blood_fungi", "fungi", "fungisoil" ], name_material: "fungi" },
    { probability: 1.0, materials: [ "blood_cold", "blood_worm" ] },
    { probability: 1.0, materials: [ "acid" ] },
    { probability: 0.8, materials: [ "meat" ] },
    { probability: 0.6, materials: [ "diamond" ] },
    { probability: 0.6, materials: [ "silver", "brass", "copper" ] },
    { probability: 0.4, materials: [ "apotheosis_cursed_liquid_red_static", "apotheosis_cursed_liquid_red" ], name_material: "apotheosis_cursed_liquid_red_static" },
    { probability: 0.4, materials: [ "acid_gas", "acid_gas_static", "poison_gas", "fungal_gas", "radioactive_gas", "radioactive_gas_static" ], name_material: "acid_gas" },
    { probability: 0.4, materials: [ "magic_liquid_polymorph", "magic_liquid_unstable_polymorph" ], name_material: "magic_liquid_polymorph" },
    { probability: 0.4, materials: [ "magic_liquid_berserk", "magic_liquid_charm", "magic_liquid_invisibility" ] },
    { probability: 0.4, materials: [ "magic_liquid_mana_regeneration" ] },
    { probability: 0.4, materials: [ "sand" ] },
    { probability: 0.4, materials: [ "soil" ] },
    { probability: 0.4, materials: [ "coal", "coal_static" ], name_material: "coal_static" },
    { probability: 0.4, materials: [ "plasma_fading" ] },
    { probability: 0.4, materials: [ "steel_static", "steelmoss_static", "metal_rust" ], name_material: "steel_static" },
    { probability: 0.4, materials: [ "templeslab_static", "templeslab_crumbling_static" ] },
    { probability: 0.4, materials: [ "snow_sticky" ] },
    { probability: 0.4, materials: [ "snow_static" ] },
    { probability: 0.4, materials: [ "ice_static" ] },
    { probability: 0.2, materials: [ "apotheosis_insect_husk" ] },
    { probability: 0.2, materials: [ "steam", "smoke" ] },
    { probability: 0.2, materials: [ "apotheosis_cloud_poison" ] },
    { probability: 0.15, materials: [ "rock_static_wet" ] },
    { probability: 0.15, materials: [ "cloud_radioactive" ] },
    { probability: 0.15, materials: [ "spark_white", "spark_white_bright" ], name_material: "spark_white" },
    { probability: 0.15, materials: [ "wood_static", "wood", "wood_loose" ], name_material: "wood" },
    { probability: 0.15, materials: [ "templebrick_static", "templebrick_static_ruined" ], name_material: "templebrick_static" },
    { probability: 0.15, materials: [ "apotheosis_redstone" ] },
    { probability: 0.15, materials: [ "rock_static" ] },
    { probability: 0.15, materials: [ "rock_hard" ] },
    { probability: 0.15, materials: [ "rock_hard_border" ] },
    { probability: 0.15, materials: [ "rock_static_cursed" ] },
    { probability: 0.01, materials: [ "apotheosis_magic_liquid_divine" ] }
  ],
};

const materialsToVanilla = [
  { probability: 1.00, material: "water" },
  { probability: 1.00, material: "lava" },
  { probability: 1.00, material: "radioactive_liquid" },
  { probability: 1.00, material: "oil" },
  { probability: 1.00, material: "blood" },
  { probability: 1.00, material: "blood_fungi" },
  { probability: 1.00, material: "acid" },
  { probability: 1.00, material: "water_swamp" },
  { probability: 1.00, material: "alcohol" },
  { probability: 1.00, material: "sima" },
  { probability: 1.00, material: "blood_worm" },
  { probability: 1.00, material: "poison" },
  { probability: 1.00, material: "vomit" },
  { probability: 1.00, material: "pea_soup" },
  { probability: 1.00, material: "fungi" },
  { probability: 0.80, material: "sand" },
  { probability: 0.80, material: "diamond" },
  { probability: 0.80, material: "silver" },
  { probability: 0.80, material: "steam" },
  { probability: 0.50, material: "rock_static" },
  { probability: 0.50, material: "gunpowder" },
  { probability: 0.50, material: "material_darkness" },
  { probability: 0.50, material: "material_confusion" },
  { probability: 0.20, material: "rock_static_radioactive" },
  { probability: 0.02, material: "magic_liquid_polymorph" },
  { probability: 0.02, material: "magic_liquid_random_polymorph" },
  { probability: 0.15, material: "magic_liquid_teleportation" },
  { probability: 0.10, material: "mimic_liquid" },
  { probability: 0.01, material: "urine" },
  { probability: 0.01, material: "poo" },
  { probability: 0.01, material: "void_liquid" },
  { probability: 0.01, material: "cheese_static" }
];

export const materialsTo = {
  vanilla: materialsToVanilla,
  apotheosis: materialsToVanilla,
  apotheosis_bungal: [
    { probability: 1.00, material: "water" },
    { probability: 1.00, material: "lava" },
    { probability: 1.00, material: "radioactive_liquid" },
    { probability: 1.00, material: "oil" },
    { probability: 1.00, material: "blood" },
    { probability: 1.00, material: "blood_fungi" },
    { probability: 1.00, material: "acid" },
    { probability: 1.00, material: "water_swamp" },
    { probability: 1.00, material: "alcohol" },
    { probability: 1.00, material: "sima" },
    { probability: 1.00, material: "blood_worm" },
    { probability: 1.00, material: "poison" },
    { probability: 1.00, material: "vomit" },
    { probability: 1.00, material: "pea_soup" },
    { probability: 1.00, material: "fungi" },
    { probability: 0.80, material: "sand" },
    { probability: 0.80, material: "diamond" },
    { probability: 0.80, material: "silver" },
    { probability: 0.80, material: "steam" },
    { probability: 0.50, material: "rock_static" },
    { probability: 0.50, material: "gunpowder" },
    { probability: 0.50, material: "material_darkness" },
    { probability: 0.50, material: "material_confusion" },
    { probability: 0.50, material: "apotheosis_redstone" },
    { probability: 0.20, material: "rock_static_radioactive" },
    { probability: 0.02, material: "magic_liquid_polymorph" },
    { probability: 0.02, material: "magic_liquid_random_polymorph" },
    { probability: 0.15, material: "magic_liquid_teleportation" },
    { probability: 0.01, material: "urine" },
    { probability: 0.01, material: "poo" },
    { probability: 0.01, material: "void_liquid" },
    { probability: 0.01, material: "cheese_static" }
  ],
  apotheosis_bungal_spam: [
    { probability: 1.00, material: "water" },
    { probability: 1.00, material: "lava" },
    { probability: 1.00, material: "radioactive_liquid" },
    { probability: 1.00, material: "oil" },
    { probability: 1.00, material: "blood" },
    { probability: 1.00, material: "blood_fungi" },
    { probability: 1.00, material: "acid" },
    { probability: 1.00, material: "water_swamp" },
    { probability: 1.00, material: "alcohol" },
    { probability: 1.00, material: "sima" },
    { probability: 1.00, material: "blood_worm" },
    { probability: 1.00, material: "apotheosis_blood_worm_centipede" },
    { probability: 1.00, material: "poison" },
    { probability: 1.00, material: "vomit" },
    { probability: 1.00, material: "pea_soup" },
    { probability: 1.00, material: "fungi" },
    { probability: 0.80, material: "sand" },
    { probability: 0.80, material: "diamond" },
    { probability: 0.80, material: "silver" },
    { probability: 0.80, material: "steam" },
    { probability: 0.50, material: "rock_static" },
    { probability: 0.50, material: "gunpowder" },
    { probability: 0.50, material: "material_darkness" },
    { probability: 0.50, material: "material_confusion" },
    { probability: 0.50, material: "cloud" },
    { probability: 0.50, material: "soil" },
    { probability: 0.50, material: "apotheosis_redstone" },
    { probability: 0.20, material: "rock_static_radioactive" },
    { probability: 0.20, material: "apotheosis_insect_husk" },
    { probability: 0.15, material: "magic_liquid_teleportation" },
    { probability: 0.15, material: "templebrick_static_ruined" },
    { probability: 0.10, material: "the_end" },
    { probability: 0.1, material: "magic_liquid_polymorph" },
    { probability: 0.1, material: "magic_liquid_random_polymorph" },
    { probability: 0.1, material: "plasma_fading" },
    { probability: 0.1, material: "urine" },
    { probability: 0.1, material: "poo" },
    { probability: 0.05, material: "void_liquid" },
    { probability: 0.05, material: "cheese_static" },
    { probability: 0.03, material: "gold" },
    { probability: 0.03, material: "magic_liquid_hp_regeneration" },
    { probability: 0.03, material: "midas" },
    { probability: 0.01, material: "apotheosis_magic_liquid_divine" }
  ],
};

export const greedyMaterialsBase = [
  "brass", "silver", "radioactive_liquid", "pea_soup",
  "acid_gas", "poo", "mammi", "rotten_meat_radioactive", "vomit"
];

export const greedOutputs = {
  vanilla: greedyMaterialsBase,
  apotheosis: greedyMaterialsBase,
  apotheosis_bungal: null,
  apotheosis_bungal_spam: null,
};

export const maxShifts = {
  vanilla: 20,
  apotheosis: 20,
  apotheosis_bungal: 20,
  apotheosis_bungal_spam: 200
};

export const baseSeedY = {
  vanilla: 42345,
  apotheosis: 42345,
  apotheosis_bungal: 58925,
  apotheosis_bungal_spam: 58925
};

export const convertMaxTries = {
  vanilla: 20,
  apotheosis: 20,
  apotheosis_bungal: 1,
  apotheosis_bungal_spam: 1
};

export const convertFailIncrementsShiftCounter = {
  vanilla: false,
  apotheosis: false,
  apotheosis_bungal: true,
  apotheosis_bungal_spam: true,
};

export const apotheosisExtraFromUnions = {
  apotheosis_cursed_liquid_red: ["apotheosis_cursed_liquid_red", "apotheosis_cursed_liquid_red_static"],
  apotheosis_cursed_liquid_red_static: ["apotheosis_cursed_liquid_red", "apotheosis_cursed_liquid_red_static"]
};

export const extraUnions = {
  vanilla: {},
  apotheosis: apotheosisExtraFromUnions,
  apotheosis_bungal: apotheosisExtraFromUnions,
  apotheosis_bungal_spam: apotheosisExtraFromUnions,
};

// TODO NO_FUNGAL_SHIFT (on for vanilla/apoth, off for bungal)
// TODO support pouches (on for vanilla/apoth, off for bungal)
