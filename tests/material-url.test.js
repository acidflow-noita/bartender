import test from 'node:test';
import assert from 'node:assert/strict';
import {loadSources} from '../scripts/data/sources.mjs';
import {initialMaterial, materialUrl, DEFAULT_MATERIAL} from '../src/materials/url.js';

const {materials}=loadSources();
test('Ambrosia is the initial example only when no material parameter is present', () => {
  for (const suffix of ['', '?from=link', '#plots']) assert.equal(initialMaterial('https://example.test/materials'+suffix,materials),DEFAULT_MATERIAL);
  assert.equal(initialMaterial('https://example.test/materials?material=water',materials),'water');
  for (const id of ['', 'unknown']) assert.equal(initialMaterial('https://example.test/materials?material='+id,materials),null);
  assert.equal(materialUrl('https://example.test/materials',null),'https://example.test/materials');
});

test('every material has a readable share URL below 500 characters and restores the exact ID', () => {
  for (const material of materials) {
    const url=materialUrl('https://bartender.runfast.stream/materials?tracking=a,b%20c#notes',material.id);
    assert.ok(url.length<500);assert.match(url,/^[A-Za-z0-9_./:?=&-]+$/);
    assert.equal(initialMaterial(url,materials),material.id);
    assert.equal(new URL(url).searchParams.size,1);assert.equal(new URL(url).hash,'');
  }
});

test('unsafe IDs and oversized URLs cannot be copied', () => {
  for (const id of ['a,b','a b','%41','a&b',0]) assert.throws(()=>materialUrl('https://example.test/materials',id),/plain material ID/);
  assert.throws(()=>materialUrl('https://example.test/'+'a'.repeat(480),'water'),/shorter than 500/);
});
