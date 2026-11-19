import {readFileSync} from 'node:fs';

export function socialDataset(data, ids) {
  const media = JSON.parse(readFileSync(new URL('../../src/data/recipe-card-media.json', import.meta.url)));
  const names = new Map(data.materials.map(m => [m.id, m.name]));
  const side = (rule, column) => [1, 2, 3].map(n => rule[column + '_cell' + n]).filter(Boolean).map(id => {
    if (!names.has(id)) throw new Error('Unknown recipe material: ' + id);
    return names.get(id);
  }).join(' + ');
  return Object.fromEntries(data.reactions.map((rule, i) => {
    const id = ids[i], entry = media[id];
    if (!entry || !/^[a-f0-9]{20}$/.test(entry[0])) throw new Error('Missing rendered media for recipe ' + id);
    const title = side(rule, 'input') + ' produces ' + side(rule, 'output');
    let description = entry[1] ? 'Watch this Noita material reaction in Bartender.' : 'No conversion occurred in the recorded run.';
    if (rule.entity_file) description += ' In game, this recipe also creates an entity.';
    return [id, {title, description, version: entry[0]}];
  }));
}
