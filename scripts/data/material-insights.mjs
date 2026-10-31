import {evaluateComparison} from '../../src/digging/comparison.js';

export const SUMMARY_DIGGING_SPELLS = ['DIGGER', 'LUMINOUS_DRILL', 'BOMB', 'BLACK_HOLE'];

export function addMaterialInsights(records, data) {
  if (!Array.isArray(data.reactions) || !Array.isArray(data.spells)) return records;
  const relations = new Map(records.map(record => [record.id, {usedIn: 0, producedBy: 0}]));
  for (const row of data.reactions) {
    const inputs = new Set(['input_cell1','input_cell2','input_cell3'].map(key => row[key]).filter(id => relations.has(id)));
    const outputs = new Set(['output_cell1','output_cell2','output_cell3'].map(key => row[key]).filter(id => relations.has(id)));
    for (const id of inputs) relations.get(id).usedIn++;
    for (const id of outputs) relations.get(id).producedBy++;
  }
  const spells = SUMMARY_DIGGING_SPELLS.map(id => data.spells.find(spell => spell.id === id)).filter(Boolean);
  return records.map(record => {
    const relation = relations.get(record.id);
    return {...record, insights: {
      reactions: {usedIn: relation.usedIn, producedBy: relation.producedBy},
      digging: ['Solid', 'Powder'].includes(record.catalog.type) ? evaluateComparison(spells, record.catalog).map(({spell,result}) => ({
        id: spell.id, name: spell.name, status: result.status, reason: result.reason,
      })) : [],
    }};
  });
}
