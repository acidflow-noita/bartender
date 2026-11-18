import test from 'node:test';
import assert from 'node:assert/strict';
import {installDom} from './dom.js';
import {createMaterialHover, hoveredMaterial} from '../src/liquids/hover.mjs';

test('hover identifies the current material without changing the brush or cells', t => {
  const view = installDom(t);
  view.ResizeObserver = class {observe() {} disconnect() {}};
  const host = document.createElement('div'), canvas = document.createElement('canvas');
  host.append(canvas); document.body.append(host); canvas.setAttribute('aria-describedby', 'help');
  let measurements = 0;
  host.getBoundingClientRect = () => ({left: 10, top: 20, width: 400, height: 200});
  canvas.getBoundingClientRect = () => {measurements++; return {left: 10, top: 20, width: 400, height: 200};};
  const world = {width: 4, height: 2, cells: new Uint16Array([1, 2, 0, 65535, 0, 0, 0, 0]),
    materials: [null, {id: 'honey', name: 'Honey', type: 'Powder'}, {id: 'magic_liquid_protection_all', name: 'Ambrosia', type: 'Liquid'}]};
  const hover = createMaterialHover(canvas, world); t.after(() => hover.dispose());
  hover.element.getBoundingClientRect = () => ({width: 190, height: 70});
  hover.update({x: 1.2, y: .5});
  assert.match(hover.element.textContent, /Ambrosia/);
  assert.match(hover.element.textContent, /magic_liquid_protection_all/);
  assert.equal(document.activeElement, document.body);
  world.cells[1] = 1;
  hover.update({x: 1.2, y: .5});
  assert.match(hover.element.textContent, /Honey/);
  assert.equal(measurements, 1, 'stationary updates use cached geometry');
  hover.update({x: 3.9, y: 1.9});
  const [x, y] = hover.element.style.transform.match(/-?\d+/g).map(Number);
  assert.ok(x >= 0 && x + 190 <= 400 && y >= 0 && y + 70 <= 200);
  hover.update(null); assert.equal(hover.element.hidden, true);
  hover.dispose(); assert.equal(canvas.getAttribute('aria-describedby'), 'help');
});

test('hover distinguishes a rendered liquid surface from the physical cell', () => {
  const world = {width: 2, height: 1, cells: new Uint16Array([1, 0]),
    materials: [null, {id: 'water', name: 'Water', type: 'Liquid'}]};
  const info = hoveredMaterial(world, {x: 1, y: 0}, new Uint16Array([1, 1]));
  assert.equal(info.id, 'water'); assert.equal(info.surface, true); assert.equal(info.physicalCell, 0);
  assert.equal(hoveredMaterial(world, null), null);
});
