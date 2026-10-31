import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {writeJsonAtomic} from '../../scripts/data/io.mjs';

export function buildCombinedReactions() {
  const read = file => JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8'));
  // Keep raw wiki/mod rules distinct from the engine's expanded reaction table.
  return [...read('./reactions.json'), ...read('./apotheosis/reactions_apotheosis.json'), ...read('./apotheosis/reactions_apotheosis_secret.json')];
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const reactions = buildCombinedReactions();
  writeJsonAtomic(new URL('./reactions_all_mods.json', import.meta.url), reactions);
  console.log(`Generated ${reactions.length} combined reaction rules.`);
}
