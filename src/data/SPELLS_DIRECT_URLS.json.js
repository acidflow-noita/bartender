import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {processRawResponses} from './FULL_MATERIALS_FINAL.json.js';
import {buildSpellData} from './FULL_SPELLS_FINAL.json.js';
import {writeJsonAtomic} from '../../scripts/data/io.mjs';

// Refresh cached wiki image metadata without discarding the game's spell fields.
export function refreshSpellImages({outputRoot = new URL('./', import.meta.url), spells,
  rawResponses = readFileSync(new URL('./images_downloader/SPELLS_RAW_IMAGES_URLS_RESPONSES.txt', import.meta.url), 'utf8')} = {}) {
  const urls = processRawResponses(rawResponses);
  if (!Object.keys(urls).length) throw new Error('No spell images found in the cached wiki responses.');
  const catalog = buildSpellData({spells, urls});
  writeJsonAtomic(new URL('SPELLS_DIRECT_URLS.json', outputRoot), urls);
  writeJsonAtomic(new URL('FULL_SPELLS_FINAL.json', outputRoot), catalog);
  return {urls, spells: catalog};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const {spells} = refreshSpellImages();
  console.log(`Updated image metadata and rebuilt ${spells.length} spells in src/data/.`);
}
