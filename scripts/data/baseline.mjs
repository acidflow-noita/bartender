import {getUnusedMaterialIds} from '../../src/components/materialAvailability.js';
import {createReactionFinder} from '../../src/reactions/model.js';
import {isDiggingSpell} from '../../src/digging/model.js';
import {evaluateComparison} from '../../src/digging/comparison.js';
import {digest} from './sources.mjs';

export function frontendBaseline(data) {
  const datasets = Object.fromEntries(Object.entries(data).map(([key, rows]) =>
    [key, {count: Array.isArray(rows) ? rows.length : null, sha256: digest(rows)}]));
  const reactions = [];
  const unused = getUnusedMaterialIds(data.availability);
  for (const excludeUnusedMaterials of [false, true]) for (const excludeSpecialMaterials of [false, true])
    for (const onlyPracticalReactions of [false, true]) for (const [selectedReagents, selectedProduct] of [
      [[], ''], [['water'], ''], [['water', 'lava'], ''], [[], 'steam'], [['blood'], ''],
      [['spark_player'], ''], [['creepy_liquid'], ''], [[], 'midas'],
    ]) {
      const state = {excludeUnusedMaterials, excludeSpecialMaterials, onlyPracticalReactions, selectedReagents, selectedProduct};
      const finder = createReactionFinder(data.materials, data.reactions, unused, state);
      reactions.push({state, rows: digest(finder.getFilteredReactions(selectedReagents, selectedProduct)),
        reagents: digest(finder.getAvailableReagents(selectedReagents, selectedProduct)),
        products: digest(finder.getAvailableProducts(selectedReagents))});
    }
  const digging = [];
  const spells = data.spells.filter(isDiggingSpell);
  for (const id of ['soil', 'rock_static', 'rock_hard', 'templebrick_noedge_static', 'water', 'air', 'steel_static', 'wood', 'glass', 'sand']) {
    const material = data.materials.find(m => m.id === id);
    if (!material) throw new Error(`Missing baseline material: ${id}`);
    for (const glassCannon of [0, 1, 2]) for (const berserkium of [false, true]) {
      digging.push({material: id, glassCannon, berserkium,
        sha256: digest(evaluateComparison(spells, material, {glassCannon, berserkium}))});
    }
  }
  return {schemaVersion: 1, datasets, reactions, digging};
}
