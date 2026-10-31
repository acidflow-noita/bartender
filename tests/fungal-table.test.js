import test from 'node:test';
import assert from 'node:assert/strict';
import {installDom} from './dom.js';
import {consecutiveGroups, staticTable} from '../src/fungal/table.js';

test('groups join only consecutive alternatives of the same shift without reordering', () => {
  const rows = [1,1,2,3,3,1].map(iteration => ({iteration}));
  assert.deepEqual(consecutiveGroups(rows, 'iteration'), [
    {value: 1, start: 0, length: 2}, {value: 2, start: 2, length: 1},
    {value: 3, start: 3, length: 2}, {value: 1, start: 5, length: 1},
  ]);
});

test('all prediction alternatives render in order with correct row spans and no selection or sorting', t => {
  installDom(t);
  const rows = Array.from({length: 900}, (_, i) => ({iteration: Math.floor(i / 5) + 1, held: `material-${i}`, from: 'water', to: 'blood'}));
  const root = staticTable(rows, {columns: ['iteration','held','from','to'], sort: 'held', height: 500}, {groupBy: 'iteration'});
  const rendered = [...root.querySelectorAll('tbody tr')];
  assert.equal(rendered.length, 900);
  assert.equal(root.querySelectorAll('input, thead button').length, 0);
  assert.equal(root.style.maxHeight, '500px');
  for (const [i, row] of rendered.entries()) {
    assert.equal(row.cells.length, 4);
    assert.equal(row.cells[1].textContent, rows[i].held);
    assert.equal(row.cells[0].hidden, i % 5 !== 0);
    if (i % 5 === 0) assert.equal(row.cells[0].rowSpan, 5);
  }
});
