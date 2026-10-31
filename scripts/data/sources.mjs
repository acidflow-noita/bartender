import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {XMLParser} from 'fast-xml-parser';
import {apotheosisMaterials} from '../../src/fungal/catalog.js';
import {parseMaterialDefinitions} from './material-reference.mjs';
import {parseMaterialEffectNames} from './material-effects.mjs';

export const sourceFiles = {
  materials: 'FULL_MATERIALS_FINAL.json',
  materialNative: 'materials.json',
  materialXml: 'materials.xml',
  materialEffectNames: 'raw_data/status_list.lua',
  spells: 'FULL_SPELLS_FINAL.json',
  reactions: 'jsons/reactions.json',
  reactionRules: 'reactions_from_materials.json',
  associations: 'jsons/material_associations.json',
  availability: 'unused-materials.json',
  apotheosisReactions: 'apotheosis/reactions_apotheosis.json',
  apotheosisSecretReactions: 'apotheosis/reactions_apotheosis_secret.json',
  allModReactions: 'reactions_all_mods.json',
  tags: 'jsons/tags.json',
};
export const dataRoot = new URL('../../src/data/', import.meta.url);
export const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function loadApotheosisMaterials(materials, root = dataRoot) {
  const parser = new XMLParser({ignoreAttributes: false, attributeNamePrefix: ''});
  return apotheosisMaterials(materials, [
    {data: parser.parse(readFileSync(new URL('apotheosis/custom_materials.xml', root), 'utf8')), secret: false},
    {data: parser.parse(readFileSync(new URL('apotheosis/secret_materials.xml', root), 'utf8')), secret: true},
  ]);
}

export function loadSources(root = dataRoot) {
  const data = Object.fromEntries(Object.entries(sourceFiles).map(([name, file]) => {
    const text = readFileSync(new URL(file, root), 'utf8');
    return [name, name === 'materialXml' ? parseMaterialDefinitions(text)
      : name === 'materialEffectNames' ? parseMaterialEffectNames(text, readFileSync(new URL('noita_translations.csv', root), 'utf8'))
      : JSON.parse(text)];
  }));
  data.apotheosisMaterials = loadApotheosisMaterials(data.materials, root);
  return data;
}
