import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resetMutations, queueMaterialCreation, flushMaterialCreations,
  queueBlobMutation, flushBlobMutations, queueExplosion, flushExplosions} from '../src/liquids/mutations.mjs';
import {convertReactionBlob} from '../src/liquids/reactions.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/noita-poison-reactions.json', import.meta.url), 'utf8'));
function world() {
  const w = {width: 32, height: 32, cells: new Uint16Array(1024), writes: [], _inStep: true,
    _index(x, y) { return x < 0 || y < 0 || x >= this.width || y >= this.height ? -1 : y * this.width + x; },
    _replaceMaterial(index, id, options) {
      this.writes.push({index, id, options});
      this.cells[index] = id;
    }};
  resetMutations(w);
  return w;
}

test('queued creation records preserve original native FIFO fields without touching cells', () => {
  const w = world();
  for (const [x, y, material, replace] of fixture.creation_records.input) {
    if (x < 0) continue;
    queueMaterialCreation(w, w._index(x, y), material, {replace});
  }
  assert.deepEqual(w.materialMutations.creations, fixture.creation_records.records.filter(row => row.x >= 0));
  assert.equal(w.cells.some(Boolean), false);
  assert.deepEqual(fixture.creation_records.returns, [0, 0, 0, 0]);
});

test('commit-time occupancy follows the original creation helper gate', () => {
  for (const entry of fixture.creation_gate) {
    const w = world(), index = w._index(5, 5);
    if (entry.occupied) w.cells[index] = 1;
    queueMaterialCreation(w, index, 2, {replace: entry.replace});
    flushMaterialCreations(w);
    assert.equal(w.cells[index], entry.result === 'blocked' ? 1 : 2, JSON.stringify(entry));
    if (entry.result !== 'blocked') assert.deepEqual(w.writes[0].options, {fresh: true, immediate: true});
  }
});

test('earlier queued creation can block a later non-replacing creation at the same coordinate', () => {
  const w = world(), index = w._index(5, 5);
  queueMaterialCreation(w, index, 1, {replace: false});
  queueMaterialCreation(w, index, 2, {replace: false});
  assert.equal(flushMaterialCreations(w), 1);
  assert.equal(w.cells[index], 1);
  assert.equal(w.materialMutations.creations.length, 0);
  queueMaterialCreation(w, index, 2, {replace: true});
  queueMaterialCreation(w, index, 0, {replace: true});
  assert.equal(flushMaterialCreations(w), 2);
  assert.equal(w.cells[index], 0);
});

test('creation commits before blob evaluation and explosion evaluation', () => {
  const w = world(), index = w._index(5, 5), observed = [];
  queueMaterialCreation(w, index, 1);
  queueBlobMutation(w, index, 1, 2, 1, true);
  queueExplosion(w, {type: 'explosion', x: 5, y: 5, config: {explosion_radius: 5}});
  flushMaterialCreations(w);
  assert.equal(w.cells[index], 1);
  flushBlobMutations(w, (world, command) => {
    observed.push('blob');
    assert.equal(world._committing, true);
    return convertReactionBlob(world, world._index(command.x, command.y), command.input,
      command.output, command.radius, command.restricted);
  });
  assert.equal(w.cells[index], 2);
  flushExplosions(w, (world, effects) => {
    observed.push('explosion');
    assert.equal(world.cells[index], 2);
    assert.equal(world._committing, true);
    assert.equal(effects.length, 1);
    return 0;
  });
  assert.deepEqual(observed, ['blob', 'explosion']);
  assert.equal(w.materialMutations.blobs.length, 0);
  assert.equal(w.materialMutations.explosions.length, 0);
  assert.equal(w._committing, undefined);
});

test('a queued blob samples the grid at commit, not when requested', () => {
  const w = world(), index = w._index(5, 5);
  w.cells[index] = 1;
  convertReactionBlob(w, index, 1, 2, 2, true);
  assert.equal(w.cells[index], 1);
  assert.equal(w.materialMutations.blobs.length, 1);
  w.cells[index] = 3;
  assert.equal(flushBlobMutations(w, (world, command) => convertReactionBlob(world,
    world._index(command.x, command.y), command.input, command.output, command.radius, command.restricted)), 0);
  assert.equal(w.cells[index], 3);
});

test('queued effects capture settings and reset drops pending commands', () => {
  const w = world(), effect = {type: 'explosion', config: {explosion_radius: 5, damage_critical: {chance: 0}}};
  queueExplosion(w, effect);
  effect.config.damage_critical.chance = 100;
  assert.equal(w.materialMutations.explosions[0].config.damage_critical.chance, 0);
  queueMaterialCreation(w, 3, 1);
  queueBlobMutation(w, 3, 1, 2, 1);
  resetMutations(w);
  assert.deepEqual(w.materialMutations, {creations: [], blobs: [], explosions: []});
});
