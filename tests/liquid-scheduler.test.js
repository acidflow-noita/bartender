import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CELL_REGION_SIZE, CellReactionScheduler, workerReactionPass} from '../src/liquids/scheduler.mjs';
import {LiquidRandom} from '../src/liquids/native-rules.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/noita-liquid-scheduler.json', import.meta.url)));

test('reaction regions use the native 64-cell grid', () => {
  assert.equal(CELL_REGION_SIZE, fixture.region.size);
  const scheduler = new CellReactionScheduler(256, 160);
  assert.equal(scheduler.region(63 + 63 * 256), 0);
  assert.equal(scheduler.region(64 + 64 * 256), 5);
  assert.equal(scheduler.region(255 + 159 * 256), 11);
});

test('active-region refresh matches native selections and random consumption', () => {
  for (const row of fixture.selection) {
    const scheduler = new CellReactionScheduler(row.count * CELL_REGION_SIZE, CELL_REGION_SIZE);
    scheduler.pending.fill(1);
    const random = new LiquidRandom(row.seed);
    assert.equal(scheduler.advance(random).selected, row.selected, JSON.stringify(row));
    assert.equal(random.state, row.random_state, JSON.stringify(row));
  }
});

test('forced and periodic region passes match original worker instructions', () => {
  for (const row of fixture.worker) {
    assert.deepEqual(workerReactionPass(row.before, row.forced),
      {counter: row.counter, normal: row.normal}, JSON.stringify(row));
    assert.equal(row.force_cleared, true);
  }
});

test('the loaded-area sweep revisits every region even after its cells settle', () => {
  const scheduler = new CellReactionScheduler(256, 160), random = new LiquidRandom(17);
  for (let cycle = 0; cycle < 3; cycle++) {
    const swept = new Set();
    for (let tick = 0; tick < 12; tick++) {
      const pass = scheduler.advance(random);
      swept.add(pass.swept);
      assert.equal(scheduler.normal[pass.swept], 1);
    }
    assert.equal(swept.size, 12);
  }
});
