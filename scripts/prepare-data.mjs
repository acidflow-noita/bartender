import {mkdirSync, writeFileSync, renameSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {loadSources, digest} from './data/sources.mjs';
import {buildCatalog, CATALOG_SCHEMA} from './data/catalog.mjs';
import {pageDatasets} from './data/page-datasets.mjs';
import {materialReferences} from './data/material-reference.mjs';

export async function prepareData() {
  const sources = loadSources();
  const identity = digest({schema: CATALOG_SCHEMA, sources});
  const path = fileURLToPath(new URL(`../build/catalog-${identity.slice(0, 16)}.duckdb`, import.meta.url));
  const data = await buildCatalog(sources, path, {inputSha256: identity,
    materialAudit: JSON.parse(readFileSync(new URL('../src/data/material-availability.json', import.meta.url), 'utf8')).source,
    spellSources: JSON.parse(readFileSync(new URL('../src/data/raw_data/digging-source-hashes.json', import.meta.url), 'utf8'))});
  const output = new URL('../public/data/', import.meta.url);
  const generated = new URL('../src/generated/', import.meta.url);
  mkdirSync(output, {recursive: true}); mkdirSync(generated, {recursive: true});
  const manifest = {};
  const writeDataset = (name, value) => {
    const filename = `${name}-${digest(value).slice(0, 16)}.json`;
    const target = new URL(filename, output);
    const content = JSON.stringify(value);
    try { if (readFileSync(target, 'utf8') === content) return `/data/${filename}`; } catch {}
    const temporary = new URL(`${filename}.tmp`, output);
    writeFileSync(temporary, content); renameSync(temporary, target);
    return `/data/${filename}`;
  };
  for (const [name, value] of Object.entries({...data, ...pageDatasets(data)})) {
    manifest[name] = writeDataset(name, value);
  }
  const references = Object.fromEntries(materialReferences(data).map(record => [record.id, writeDataset(`material-${record.id}`, record)]));
  manifest.materialDetails = writeDataset('materialDetails', references);
  const target = new URL('data-manifest.json', generated), content = JSON.stringify(manifest, null, 2) + '\n';
  try { if (readFileSync(target, 'utf8') === content) return manifest; } catch {}
  writeFileSync(new URL('data-manifest.json.tmp', generated), content);
  renameSync(new URL('data-manifest.json.tmp', generated), target);
  return manifest;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await prepareData();
