import {DuckDBInstance} from '@duckdb/node-api';
import {mkdirSync, existsSync, renameSync, rmSync} from 'node:fs';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {digest, sourceFiles} from './sources.mjs';
import {materialReferences} from './material-reference.mjs';

export const CATALOG_SCHEMA = 1;

export function validateSources(data) {
  for (const name of ['materials', 'spells', 'reactions', 'reactionRules', 'associations', 'apotheosisMaterials']) {
    if (!Array.isArray(data[name]) || !data[name].length) throw new Error(`Missing or empty dataset: ${name}`);
  }
  for (const name of ['materials', 'spells']) {
    const ids = data[name].map(row => row.id);
    if (ids.some(id => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length) throw new Error(`Invalid or duplicate ${name} IDs`);
  }
  for (const row of data.materials) for (const key of ['hardness', 'durability', 'density', 'gfx_glow']) {
    if (!(key in row) || (row[key] !== null && (typeof row[key] !== 'number' || !Number.isFinite(row[key])))) {
      throw new Error(`Invalid material ${row.id}.${key}: expected a number or null`);
    }
  }
  for (const row of data.reactions) if (typeof row.reaction_rate !== 'number' || !Number.isFinite(row.reaction_rate)) {
    throw new Error('Invalid expanded reaction rate');
  }
  const ids = new Set(data.materials.map(row => row.id));
  for (const id of data.availability?.unusedIds ?? []) if (!ids.has(id)) throw new Error(`Unknown excluded material: ${id}`);
  // JSON serialization must preserve the complete logical input, including nulls,
  // empty arrays, decimals, ordering and extension fields.
  if (!isDeepStrictEqual(JSON.parse(JSON.stringify(data)), data)) throw new Error('Non-JSON data would be lost in the catalog');
  if (data.materialNative || data.materialXml) materialReferences(data);
}

async function withCatalog(path, run, readOnly = false) {
  const db = await DuckDBInstance.create(path, readOnly ? {access_mode: 'READ_ONLY'} : {});
  const connection = await db.connect();
  try {
    const version = (await connection.runAndReadAll('SELECT version()')).getRows()[0][0];
    if (version !== 'v2.0.0') throw new Error(`Expected DuckDB v2.0.0, got ${version}`);
    return await run(connection);
  } finally {connection.closeSync(); db.closeSync();}
}

async function readData(connection) {
  const definitions = (await connection.runAndReadAll('SELECT name, shape, sha256 FROM catalog_datasets ORDER BY name')).getRows();
  const records = (await connection.runAndReadAll('SELECT dataset, payload::VARCHAR FROM catalog_records ORDER BY dataset, ordinal')).getRows();
  const grouped = new Map(definitions.map(([name]) => [name, []]));
  for (const [name, payload] of records) grouped.get(name).push(JSON.parse(payload));
  const data = {};
  for (const [name, shape, hash] of definitions) {
    data[name] = shape === 'array' ? grouped.get(name) : grouped.get(name)[0];
    if (digest(data[name]) !== hash) throw new Error(`Catalog checksum mismatch: ${name}`);
  }
  return data;
}

export const readCatalog = path => withCatalog(path, readData, true);

export async function buildCatalog(data, path, provenance = {}) {
  validateSources(data);
  if (existsSync(path)) {
    const existing = await readCatalog(path);
    if (isDeepStrictEqual(existing, data)) return existing;
  }
  mkdirSync(dirname(path), {recursive: true});
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    const exported = await withCatalog(temporary, async connection => {
      await connection.run(`
        BEGIN TRANSACTION;
        CREATE TABLE catalog_metadata (name VARCHAR PRIMARY KEY, payload JSON NOT NULL);
        CREATE TABLE catalog_datasets (name VARCHAR PRIMARY KEY, shape VARCHAR NOT NULL, record_count INTEGER NOT NULL, sha256 VARCHAR NOT NULL);
        CREATE TABLE catalog_records (dataset VARCHAR NOT NULL, ordinal INTEGER NOT NULL, payload JSON NOT NULL, PRIMARY KEY(dataset, ordinal));
      `);
      await connection.run('INSERT INTO catalog_metadata VALUES (?, ?::JSON)', ['provenance', JSON.stringify({schemaVersion: CATALOG_SCHEMA, engine: 'v2.0.0', sourceFiles, ...provenance})]);
      const appender = await connection.createAppender('catalog_records');
      try {
        for (const [name, value] of Object.entries(data)) {
          const rows = Array.isArray(value) ? value : [value];
          await connection.run('INSERT INTO catalog_datasets VALUES (?, ?, ?, ?)', [name, Array.isArray(value) ? 'array' : 'object', rows.length, digest(value)]);
          rows.forEach((row, index) => {
            appender.appendVarchar(name); appender.appendInteger(index); appender.appendVarchar(JSON.stringify(row)); appender.endRow();
          });
        }
      } finally {appender.closeSync();}
      await connection.run(`
        CREATE VIEW materials AS SELECT ordinal, payload->>'$.id' AS id, payload->>'$.name' AS name,
          payload->>'$.type' AS type, CAST(payload->>'$.hardness' AS DOUBLE) AS hardness,
          CAST(payload->>'$.durability' AS DOUBLE) AS durability, CAST(payload->>'$.density' AS DOUBLE) AS density,
          CAST(payload->>'$.gfx_glow' AS DOUBLE) AS glow, payload
          FROM catalog_records WHERE dataset = 'materials';
        CREATE VIEW spells AS SELECT ordinal, payload->>'$.id' AS id, payload->>'$.name' AS name,
          CAST(payload->>'$.radius' AS DOUBLE) AS radius, CAST(payload->>'$.rayEnergy' AS DOUBLE) AS ray_energy,
          payload FROM catalog_records WHERE dataset = 'spells';
        CREATE VIEW reactions_expanded AS SELECT ordinal, CAST(payload->>'$.reaction_rate' AS DOUBLE) AS rate,
          payload->>'$.input_cell1' AS input1, payload->>'$.input_cell2' AS input2, payload->>'$.input_cell3' AS input3,
          payload->>'$.output_cell1' AS output1, payload->>'$.output_cell2' AS output2, payload->>'$.output_cell3' AS output3,
          payload FROM catalog_records WHERE dataset = 'reactions';
        CREATE VIEW reaction_rules AS SELECT dataset AS source, ordinal, payload
          FROM catalog_records WHERE dataset IN ('reactionRules', 'apotheosisReactions', 'apotheosisSecretReactions', 'allModReactions');
        CREATE VIEW material_tags AS SELECT m.id, CAST(t.key AS INTEGER) AS ordinal, t.value::VARCHAR AS tag_json
          FROM materials m, json_each(m.payload, '$.tags') t;
        COMMIT;
      `);
      const restored = await readData(connection);
      if (!isDeepStrictEqual(restored, data)) throw new Error('DuckDB round trip changed the source data');
      await connection.run('CHECKPOINT');
      return restored;
    });
    renameSync(temporary, path);
    return exported;
  } finally {
    rmSync(temporary, {force: true}); rmSync(`${temporary}.wal`, {force: true});
  }
}
