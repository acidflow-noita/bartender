import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {writeJsonAtomic} from '../../../scripts/data/io.mjs';

export function groupTagMaterials(associations) {
  const groups = new Map();
  for (const {id, tag} of associations) {
    if (typeof id !== 'string' || !id || !/^[a-zA-Z0-9_]+$/.test(tag)) throw new Error('Invalid material/tag association');
    if (!groups.has(tag)) groups.set(tag, new Set());
    groups.get(tag).add(id);
  }
  return Object.fromEntries([...groups].map(([tag, ids]) => [tag, [...ids]]));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const groups = groupTagMaterials(JSON.parse(readFileSync(new URL('./material_associations.json', import.meta.url))));
  for (const [tag, ids] of Object.entries(groups)) writeJsonAtomic(new URL(`./tags/${tag}.json`, import.meta.url), ids);
  console.log(`Generated ${Object.keys(groups).length} tag files.`);
}
