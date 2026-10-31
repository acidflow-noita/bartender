import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {fetchCargo} from '../../scripts/data/wiki.mjs';
import {queries} from '../../scripts/refresh-data.mjs';
import {writeJsonAtomic} from '../../scripts/data/io.mjs';

export const fetchReactions = () => fetchCargo(queries.reactions);
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeJsonAtomic(new URL('./reactions.json', import.meta.url), await fetchReactions());
}
