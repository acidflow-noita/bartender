import * as fs from "fs";

// Read the creatures_ce.json file
const creaturesCE = JSON.parse(fs.readFileSync("./src/data/jsons/creatures_ce.json", "utf-8"));

// Define language keys in order
const languageKeys = ["en", "ru", "pt-br", "es-es", "de", "fr-fr", "it", "pl", "zh-cn", "jp", "ko"];

// Read and parse translations
const translations = new Map();
const translationsText = fs.readFileSync("./src/data/noita_translations.csv", "utf-8");
const translationsLines = translationsText.split("\n");

// Skip first two lines (header and language names)
for (let i = 2; i < translationsLines.length; i++) {
  const line = translationsLines[i].trim();
  if (line) {
    const parts = line.split(",");
    const key = parts[0];
    // Get translations (entries 1-11) and pair them with language keys
    const values = parts.slice(1, 12).map((v, index) => ({
      lang: languageKeys[index],
      text: v.trim(),
    }));
    translations.set(key, values);
  }
}

// Create a map for quick lookup of blood and corpse by creature id
const creaturesCEMap = new Map(
  creaturesCE.map((creature) => [
    creature.id,
    {
      blood_material_id: creature.blood,
      corpse_material_id: creature.corpse,
      entity_name: creature.entity_name,
    },
  ])
);

const response = await fetch(
  "https://noita.wiki.gg/api.php?action=cargoquery&tables=Enemies&fields=_pageName=wikipage,image,icon,name,alias,health,critResist,attackType,blood,corpse,spawnLocation,ngplusSpawnLocation,ngplus2SpawnLocation,ngplus3SpawnLocation,immunities,dmgMultMelee,dmgMultProjectile,dmgMultSlice,dmgMultExplosion,dmgMultElectricity,dmgMultFire,dmgMultIce,dmgMultDrill,dmgMultRadioactive,dmgMultHoly,dmgMultNotes,faction,id,category,chaosPolymorph,unstablePolymorph&limit=500&format=json"
);

const cargoData = await response.json();
const data = cargoData.cargoquery.map((item) => {
  const creature = item.title;
  // Get the additional data from creatures_ce.json if it exists
  const ceData = creaturesCEMap.get(creature.id) || {
    blood_material_id: null,
    corpse_material_id: null,
    entity_name: null,
  };

  // Get translations if they exist
  const translatedNames = ceData.entity_name ? translations.get(ceData.entity_name) || [] : [];

  // Reorder fields for better readability
  return {
    wikipage: creature.wikipage,
    name: creature.name,
    id: creature.id,
    entity_name: ceData.entity_name,
    blood_material_id: ceData.blood_material_id,
    corpse_material_id: ceData.corpse_material_id,
    blood: creature.blood,
    corpse: creature.corpse,
    image: creature.image,
    icon: creature.icon,
    alias: creature.alias,
    health: creature.health,
    critResist: creature.critResist,
    attackType: creature.attackType,
    spawnLocation: creature.spawnLocation,
    ngplusSpawnLocation: creature.ngplusSpawnLocation,
    ngplus2SpawnLocation: creature.ngplus2SpawnLocation,
    ngplus3SpawnLocation: creature.ngplus3SpawnLocation,
    immunities: creature.immunities,
    dmgMultMelee: creature.dmgMultMelee,
    dmgMultProjectile: creature.dmgMultProjectile,
    dmgMultSlice: creature.dmgMultSlice,
    dmgMultExplosion: creature.dmgMultExplosion,
    dmgMultElectricity: creature.dmgMultElectricity,
    dmgMultFire: creature.dmgMultFire,
    dmgMultIce: creature.dmgMultIce,
    dmgMultDrill: creature.dmgMultDrill,
    dmgMultRadioactive: creature.dmgMultRadioactive,
    dmgMultHoly: creature.dmgMultHoly,
    dmgMultNotes: creature.dmgMultNotes,
    faction: creature.faction,
    category: creature.category,
    chaosPolymorph: creature.chaosPolymorph,
    unstablePolymorph: creature.unstablePolymorph,
    translations: translatedNames,
  };
});

// Count and identify creatures with and without material IDs
const creaturesWithMaterials = data.filter(
  (creature) => creature.blood_material_id !== null || creature.corpse_material_id !== null
).length;

const missingMaterialsCreatures = data
  .filter((creature) => creature.blood_material_id === null && creature.corpse_material_id === null)
  .map((creature) => ({
    id: creature.id,
    name: creature.name,
    blood: creature.blood,
    corpse: creature.corpse,
  }));

fs.writeFileSync("./src/data/FULL_CREATURES_FINAL.json", JSON.stringify(data, null, 2), "utf-8");
console.log(`\nSuccessfully saved ${data.length} creatures to creatures.json`);
console.log(`${creaturesWithMaterials} creatures have blood or corpse material IDs`);
console.log(`${data.length - creaturesWithMaterials} creatures are missing material IDs\n`);
console.log("Creatures missing material IDs:");
console.table(missingMaterialsCreatures);
