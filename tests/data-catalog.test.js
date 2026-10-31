import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, readFileSync, statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DuckDBInstance} from '@duckdb/node-api';
import {loadSources} from '../scripts/data/sources.mjs';
import {buildCatalog, readCatalog} from '../scripts/data/catalog.mjs';

test('DuckDB 2 preserves every input field, record order, duplicate reaction and numeric value', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'bartender-catalog-'));
  t.after(() => rmSync(directory, {recursive: true, force: true}));
  const path = join(directory, 'catalog.duckdb'), input = loadSources();
  assert.deepEqual(await buildCatalog(input, path), input);
  assert.deepEqual(await readCatalog(path), input);
  const modified = statSync(path).mtimeMs;
  assert.deepEqual(await buildCatalog(input, path), input);
  assert.equal(statSync(path).mtimeMs, modified, 'unchanged inputs reuse the validated catalog');
  const db = await DuckDBInstance.create(path, {access_mode: 'READ_ONLY'}), connection = await db.connect();
  try {
    const values = (await connection.runAndReadAll('SELECT id, hardness, durability, density, glow FROM materials ORDER BY ordinal')).getRows();
    assert.deepEqual(values, input.materials.map(row => [row.id, row.hardness, row.durability, row.density, row.gfx_glow]));
    const count = (await connection.runAndReadAll('SELECT count(*)::INTEGER FROM reactions_expanded')).getRows()[0][0];
    assert.equal(count, input.reactions.length);
  } finally {connection.closeSync(); db.closeSync();}
  const bytes = readFileSync(path);
  const invalid = structuredClone(input); invalid.materials[0].hardness = 'not a number';
  await assert.rejects(buildCatalog(invalid, path), /Invalid material/);
  assert.deepEqual(readFileSync(path), bytes, 'a rejected refresh must not damage the last valid catalog');
});
