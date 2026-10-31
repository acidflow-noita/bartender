import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadSources} from '../scripts/data/sources.mjs';
import {frontendBaseline} from '../scripts/data/baseline.mjs';

test('frontend migration preserves every input record, filter result and digging calculation', () => {
  const expected = JSON.parse(readFileSync(new URL('./fixtures/frontend-baseline.json', import.meta.url)));
  const sources = loadSources();
  // The new reference exports add raw sources; all original data and algorithm
  // hashes must still match the frozen pre-migration baseline exactly.
  const original = Object.fromEntries(Object.keys(expected.datasets).map(name => [name, sources[name]]));
  assert.deepEqual(frontendBaseline(original), expected);
  assert.deepEqual(Object.keys(sources).filter(name => !(name in expected.datasets)).sort(), ['materialEffectNames', 'materialNative', 'materialXml']);
});
