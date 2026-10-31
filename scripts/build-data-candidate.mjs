import {readFileSync, mkdirSync, renameSync, rmSync, existsSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs, isDeepStrictEqual} from 'node:util';
import {randomUUID, createHash} from 'node:crypto';
import {loadSources, loadApotheosisMaterials, digest, dataRoot} from './data/sources.mjs';
import {buildCatalog} from './data/catalog.mjs';
import {writeJsonAtomic} from './data/io.mjs';
import {buildMaterialData} from '../src/data/FULL_MATERIALS_FINAL.json.js';
import {buildSpellData} from '../src/data/FULL_SPELLS_FINAL.json.js';
import {parseSpell} from '../src/data/spells.json.js';

export function datasetDiff(before, after) {
  if (isDeepStrictEqual(before, after)) return {changed: false};
  if (!Array.isArray(before) || !Array.isArray(after)) return {changed: true, before, after};
  const keyed = before.every(row => typeof row?.id === 'string') && after.every(row => typeof row?.id === 'string');
  const previous = new Map(before.map((row, index) => [keyed ? row.id : index, row]));
  const next = new Map(after.map((row, index) => [keyed ? row.id : index, row]));
  const changed = [];
  for (const [id, row] of next) {
    const old = previous.get(id);
    if (old === undefined || isDeepStrictEqual(old, row)) continue;
    if (old === null || row === null || typeof old !== 'object' || typeof row !== 'object') {
      changed.push({id, before: old, after: row}); continue;
    }
    changed.push({id, fields: Object.fromEntries([...new Set([...Object.keys(old), ...Object.keys(row)])]
      .filter(key => !isDeepStrictEqual(old[key], row[key]))
      .map(key => [key, {before: old[key], after: row[key], removed: !(key in row), added: !(key in old)}]))});
  }
  return {changed: true, beforeCount: before.length, afterCount: after.length,
    added: [...next.keys()].filter(id => !previous.has(id)), removed: [...previous.keys()].filter(id => !next.has(id)),
    orderChanged: keyed && !isDeepStrictEqual([...previous.keys()], [...next.keys()]), records: changed};
}

export async function buildCandidate(snapshotDirectory, outputDirectory) {
  const snapshot = resolve(snapshotDirectory), output = resolve(outputDirectory);
  if (existsSync(output)) throw new Error(`Candidate already exists: ${output}`);
  const manifest = JSON.parse(readFileSync(join(snapshot, 'manifest.json'), 'utf8'));
  if (manifest.schemaVersion !== 1) throw new Error('Unsupported refresh manifest');
  const wiki = {};
  for (const name of ['materials', 'spells', 'reactions']) {
    const data = JSON.parse(readFileSync(join(snapshot, `${name}-wiki.json`), 'utf8'));
    if (digest(data) !== manifest.wiki[name]?.sha256) throw new Error(`Snapshot checksum mismatch: ${name}`);
    wiki[name] = data;
  }
  // A new game tree requires the game extractors and native evidence to be
  // refreshed first. Never combine a new XML build with old engine defaults.
  const audit = JSON.parse(readFileSync(new URL('material-availability.json', dataRoot), 'utf8'));
  if (manifest.game?.executableSha256 && manifest.game.executableSha256 !== audit.source.executableSha256) {
    throw new Error('Game executable changed. Refresh the native evidence before assembling a candidate.');
  }
  for (const file of manifest.game?.files ?? []) {
    const checked = file.file === 'materials.xml' ? new URL('materials.xml', dataRoot)
      : file.file === 'scripts/gun/gun_actions.lua' ? new URL('spells_xml_parser_for_CE/gun_actions.lua', dataRoot)
      : file.file === 'scripts/status_effects/status_list.lua' ? new URL('raw_data/status_list.lua', dataRoot) : null;
    if (!checked) throw new Error(`Unrecognized game source: ${file.file}`);
    const textHash = path => createHash('sha256').update(readFileSync(path, 'utf8').replace(/\r\n/g, '\n')).digest('hex');
    if (textHash(join(snapshot, 'game', file.file)) !== file.sha256) throw new Error(`Snapshot checksum mismatch: ${file.file}`);
    const hash = textHash(checked);
    if (hash !== file.sha256) throw new Error(`Game source changed: ${file.file}. Refresh the game exports and their verified evidence before assembling a candidate.`);
  }
  const before = loadSources();
  const after = {...before, materials: buildMaterialData({wikiMaterials: wiki.materials}),
    spells: buildSpellData({spells: wiki.spells.map(parseSpell)}),
    allModReactions: [...wiki.reactions, ...before.apotheosisReactions, ...before.apotheosisSecretReactions]};
  after.apotheosisMaterials = loadApotheosisMaterials(after.materials);
  const diff = Object.fromEntries(Object.keys(after).map(name => [name, datasetDiff(before[name], after[name])]));
  const temporary = `${output}.${randomUUID()}.tmp`;
  try {
    mkdirSync(temporary, {recursive: true});
    const exported = await buildCatalog(after, join(temporary, 'catalog.duckdb'), {snapshotIdentity: manifest.identity});
    for (const [name, data] of Object.entries(exported)) writeJsonAtomic(join(temporary, `${name}.json`), data);
    writeJsonAtomic(join(temporary, 'diff.json'), diff);
    writeJsonAtomic(join(temporary, 'manifest.json'), {schemaVersion: 1, snapshotIdentity: manifest.identity,
      datasets: Object.fromEntries(Object.entries(exported).map(([name, data]) => [name, digest(data)]))});
    renameSync(temporary, output);
  } finally {rmSync(temporary, {recursive: true, force: true});}
  return diff;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const {values} = parseArgs({options: {snapshot: {type: 'string'}, output: {type: 'string'}}});
  if (!values.snapshot || !values.output) throw new Error('Usage: npm run data:candidate -- --snapshot build/refresh-ID --output build/candidate-ID');
  const diff = await buildCandidate(values.snapshot, values.output);
  console.log(`Candidate ready in ${resolve(values.output)}. Changed datasets: ${Object.keys(diff).filter(name => diff[name].changed).join(', ') || 'none'}.`);
}
