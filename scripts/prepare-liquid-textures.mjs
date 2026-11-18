// Explicit asset refresh. Normal builds use the checked-in PNGs and need no game install.
import {readFileSync, writeFileSync, mkdirSync, copyFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve, basename, join} from 'node:path';
import {createHash} from 'node:crypto';
import {simulationMaterialRecords, WORLD_RENDER_IMAGES} from '../src/liquids/materials.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--data')) {
  throw new Error('Usage: node scripts/prepare-liquid-textures.mjs [--data /path/to/noita/data]');
}
const data = resolve(args[1] ?? fileURLToPath(new URL('../../noita-sources/data', import.meta.url)));
const source = readFileSync(new URL('../src/data/FULL_MATERIALS_FINAL.json', import.meta.url));
const materials = simulationMaterialRecords(JSON.parse(source));
const paths = [...new Set([...materials.map(material => material.graphics?.texture_file).filter(Boolean),
  ...Object.values(WORLD_RENDER_IMAGES)])].sort();
const output = fileURLToPath(new URL('../public/liquids/textures/', import.meta.url));
const files = [];
mkdirSync(output, {recursive: true});
for (const path of paths) {
  if (!/^data\/materials_gfx\/[\w-]+\.png$/.test(path) && !Object.values(WORLD_RENDER_IMAGES).includes(path))
    throw new Error(`Unexpected texture path: ${path}`);
  const input = join(data, path.slice('data/'.length));
  const bytes = readFileSync(input);
  const valid = path.endsWith('.bmp') ? bytes.toString('ascii', 0, 2) === 'BM'
    : bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a';
  if (!valid) throw new Error(`Invalid texture: ${path}`);
  copyFileSync(input, join(output, basename(path)));
  files.push({source: path, file: basename(path), bytes: bytes.length, sha256: hash(bytes)});
}
writeFileSync(new URL('../public/liquids/texture-manifest.json', import.meta.url), JSON.stringify({
  schema: 1, materialSource: 'src/data/FULL_MATERIALS_FINAL.json', materialSourceSha256: hash(source), files,
}, null, 2) + '\n');
console.log(`Prepared ${files.length} liquid textures (${files.reduce((sum, file) => sum + file.bytes, 0)} bytes).`);
