import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadSources, digest} from '../scripts/data/sources.mjs';
import {pageDatasets} from '../scripts/data/page-datasets.mjs';
import {createReactionFinder} from '../src/reactions/model.js';
import {getUnusedMaterialIds} from '../src/components/materialAvailability.js';
import {isDiggingSpell} from '../src/digging/model.js';

const data = loadSources();
const pages = pageDatasets(data);

test('digging exports preserve every field and the exact selectable spell population', () => {
  assert.deepEqual(pages.diggingSpells, data.spells.filter(isDiggingSpell));
});

test('compact homepage data preserves every type count and total', () => {
  assert.equal(pages.homeSummary.materialCount, data.materials.length);
  assert.equal(pages.homeSummary.tagCount, data.tags.length);
  assert.equal(pages.homeSummary.reactionCount, data.reactions.length);
  assert.equal(pages.homeSummary.types.reduce((sum, row) => sum + row.count, 0), data.materials.length);
  for (const row of pages.homeSummary.types) {
    assert.equal(row.count, data.materials.filter(material => (material.type || 'N/A') === row.type).length);
  }
});

test('compact reaction material data preserves IDs, metadata, order and every baseline filter/choice result', () => {
  assert.deepEqual(pages.reactionMaterials.map(row => row.id), data.materials.map(row => row.id));
  for (const [index, material] of pages.reactionMaterials.entries()) {
    for (const [key, value] of Object.entries(material)) assert.deepEqual(value, data.materials[index][key]);
  }
  const baseline = JSON.parse(readFileSync(new URL('./fixtures/frontend-baseline.json', import.meta.url)));
  const unused = getUnusedMaterialIds(data.availability);
  for (const {state, rows, reagents, products} of baseline.reactions) {
    const finder = createReactionFinder(pages.reactionMaterials, data.reactions, unused, structuredClone(state));
    assert.equal(digest(finder.getFilteredReactions(state.selectedReagents, state.selectedProduct)), rows);
    assert.equal(digest(finder.getAvailableReagents(state.selectedReagents, state.selectedProduct)), reagents);
    assert.equal(digest(finder.getAvailableProducts(state.selectedReagents)), products);
  }
});
