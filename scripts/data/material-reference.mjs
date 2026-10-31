import {XMLParser} from 'fast-xml-parser';
import {resolveMaterialEffects} from './material-effects.mjs';
import {addMaterialInsights} from './material-insights.mjs';

// Keep attribute text, nested elements, repeated definitions and empty values.
// Formatting whitespace is not a material property.
export function parseMaterialDefinitions(text) {
  const options = {ignoreAttributes: false, attributeNamePrefix: '@',
    parseAttributeValue: false, parseTagValue: false, trimValues: false};
  const root = new XMLParser(options).parse(text).Materials;
  if (!root) throw new Error('Missing Materials XML root');
  const clean = value => Array.isArray(value) ? value.map(clean) : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).filter(([key, value]) => key !== '#text' || String(value).trim()).map(([key, value]) => [key, clean(value)])) : value;
  const ordered = new XMLParser({...options, preserveOrder: true}).parse(text).find(node => node.Materials)?.Materials ?? [];
  const counts = {CellData: 0, CellDataChild: 0};
  return ordered.flatMap(entry => {
    const kind = ['CellData', 'CellDataChild'].find(kind => kind in entry);
    if (!kind) return [];
    const nodes = Array.isArray(root[kind]) ? root[kind] : [root[kind]];
    const node = nodes[counts[kind]++];
    if (!node['@name']) throw new Error(`Unnamed ${kind} material`);
    return [{id: node['@name'], kind, definition: clean(node)}];
  });
}

export function materialReferences(data) {
  const native = new Map(data.materialNative.map(row => [row.id, row]));
  if (native.size !== data.materialNative.length) throw new Error('Duplicate runtime material IDs');
  if (native.size !== data.materials.length || data.materials.some(row => !native.has(row.id))) throw new Error('Runtime and material catalog IDs differ; rebuild the material catalog.');
  const definitions = new Map();
  for (const record of data.materialXml) {
    if (!definitions.has(record.id)) definitions.set(record.id, []);
    definitions.get(record.id).push(record);
  }
  if (definitions.size !== native.size || [...definitions.keys()].some(id => !native.has(id))) throw new Error('XML and material catalog IDs differ; refresh the material exports together.');
  const records = data.materials.map(material => {
    if (!native.has(material.id) || !definitions.has(material.id)) throw new Error(`Missing material reference source: ${material.id}`);
    const parents = new Map();
    const visit = (id, path) => {
      if (path.includes(id)) throw new Error(`Circular material parent: ${[...path, id].join(' -> ')}`);
      for (const record of definitions.get(id) ?? []) {
        const parent = record.definition['@_parent'];
        if (!parent) continue;
        if (!definitions.has(parent)) throw new Error(`Missing XML parent ${parent} for ${id}`);
        if (!parents.has(parent)) {
          parents.set(parent, {id: parent, definitions: definitions.get(parent)});
          visit(parent, [...path, id]);
        } else if ([...path, id].includes(parent)) throw new Error(`Circular material parent: ${parent}`);
      }
    };
    visit(material.id, []);
    return {id: material.id, catalog: material, native: native.get(material.id),
      xml: definitions.get(material.id), parents: [...parents.values()]};
  });
  return addMaterialInsights(resolveMaterialEffects(records, data.materialEffectNames ?? []), data);
}
