import {isDiggingSpell} from '../../src/digging/model.js';

// Page exports copy reference values from the validated catalog. The full
// datasets remain available; small pages need not download unused fields.
export function pageDatasets(data) {
  const counts = new Map();
  for (const material of data.materials) {
    const type = material.type || 'N/A';
    counts.set(type, (counts.get(type) || 0) + 1);
  }
  const fields = ['id', 'name', 'type', 'image_local', 'wikipage'];
  return {
    homeSummary: {
      materialCount: data.materials.length,
      tagCount: data.tags.length,
      reactionCount: data.reactions.length,
      types: [...counts].map(([type, count]) => ({type, count})),
    },
    reactionMaterials: data.materials.map(row => Object.fromEntries(fields.filter(key => key in row).map(key => [key, row[key]]))),
    diggingSpells: data.spells.filter(isDiggingSpell),
  };
}
