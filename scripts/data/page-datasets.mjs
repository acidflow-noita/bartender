import {readFileSync} from 'node:fs';
import {recipeIds} from './recipe-ids.mjs';
import {isDiggingSpell} from '../../src/digging/model.js';
import {liquidMaterialRecords, simulationMaterialRecords} from '../../src/liquids/materials.mjs';

// Page exports copy reference values from the validated catalog. The full
// datasets remain available; small pages need not download unused fields.
export function pageDatasets(data) {
  const counts = new Map();
  for (const material of data.materials) {
    const type = material.type || 'N/A';
    counts.set(type, (counts.get(type) || 0) + 1);
  }
  const fields = ['id', 'name', 'type', 'image_local', 'wikipage'];
  const media = JSON.parse(readFileSync(new URL('../../src/data/recipe-card-media.json', import.meta.url)));
  const versions = Object.fromEntries(Object.entries(media).map(([id, [version]]) => [id, version]));
  const seeds = Object.fromEntries(Object.entries(media).filter(([, entry]) => entry[2] > 1).map(([id, entry]) => [id, entry[2]]));
  return {
    homeSummary: {
      materialCount: data.materials.length,
      tagCount: data.tags.length,
      reactionCount: data.reactions.length,
      types: [...counts].map(([type, count]) => ({type, count})),
    },
    reactionMaterials: data.materials.map(row => Object.fromEntries(fields.filter(key => key in row).map(key => [key, row[key]]))),
    diggingSpells: data.spells.filter(isDiggingSpell),
    liquidMaterials: liquidMaterialRecords(data.materials),
    liquidSimulation: {materials: simulationMaterialRecords(data.materials), reactions: data.reactions, recipeIds: recipeIds(data.reactions), recipeSeeds: seeds, recipeImageVersions: versions},
  };
}
