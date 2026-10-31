import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {processRawResponses, processImageField} from './FULL_MATERIALS_FINAL.json.js';
import {writeJsonAtomic} from '../../scripts/data/io.mjs';

// Refresh images in the merged catalog while preserving every other property.
export function refreshMaterialImages({outputRoot = new URL('./', import.meta.url),
  materials = JSON.parse(readFileSync(new URL('./FULL_MATERIALS_FINAL.json', import.meta.url), 'utf8')),
  rawResponses} = {}) {
  const urls = processRawResponses(rawResponses);
  if (!Object.keys(urls).length) throw new Error('No material images found in the cached wiki responses.');
  const catalog = materials.map(material => {
    const row = {...material};
    for (const [field, prefix] of [['image', 'image'], ['icon', 'icon'], ['pouchIcon', 'pouch']]) {
      const image = processImageField(material, urls, field);
      row[`${prefix}_url`] = image.url;
      row[`${prefix}_local`] = image.local;
    }
    return row;
  });
  writeJsonAtomic(new URL('DIRECT_URLS.json', outputRoot), urls);
  writeJsonAtomic(new URL('FULL_MATERIALS_FINAL.json', outputRoot), catalog);
  return {urls, materials: catalog};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const {materials} = refreshMaterialImages();
  console.log(`Updated image metadata for ${materials.length} materials in src/data/.`);
}
