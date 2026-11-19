import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync} from 'node:fs';

const ledgerFile = new URL('../../src/data/reaction-share-ids.json', import.meta.url);

function ordered(value) {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])]));
  return value;
}

// The array index plus one is a public ID. Removed rules keep their slots forever.
export function assignRecipeIds(rules, ledger, append = false) {
  const numbers = new Map();
  ledger.forEach((hash, index) => {
    if (!numbers.has(hash)) numbers.set(hash, []);
    numbers.get(hash).push(index + 1);
  });
  const used = new Map();
  return rules.map(rule => {
    const hash = createHash('sha256').update(JSON.stringify(ordered(rule))).digest('hex');
    const n = used.get(hash) ?? 0;
    used.set(hash, n + 1);
    const existing = numbers.get(hash)?.[n];
    if (existing) return existing;
    if (!append) throw new Error('A new reaction needs a permanent ID. Run npm run recipes:render.');
    ledger.push(hash);
    return ledger.length;
  });
}

export function recipeIds(rules, append = false) {
  let ledger;
  try {ledger = JSON.parse(readFileSync(ledgerFile, 'utf8'));}
  catch (error) {if (!append || error.code !== 'ENOENT') throw error; ledger = [];}
  const previous = ledger.length, ids = assignRecipeIds(rules, ledger, append);
  if (ledger.length !== previous) writeFileSync(ledgerFile, '[\n' + ledger.map(value => '  "' + value + '"').join(',\n') + '\n]\n');
  return ids;
}
