import test from 'node:test';
import assert from 'node:assert/strict';
import {installDom} from './dom.js';
import {bindLiquidInput} from '../src/liquids/input.mjs';

function harness(t) {
  const view = installDom(t);
  const canvas = document.createElement('canvas'); canvas.tabIndex = 0; document.body.append(canvas);
  canvas.getBoundingClientRect = () => ({left: 10, top: 20, width: 200, height: 100});
  let captured = null;
  canvas.setPointerCapture = id => {captured = id;};
  canvas.hasPointerCapture = id => captured === id;
  canvas.releasePointerCapture = () => {captured = null;};
  const paints = [];
  const input = bindLiquidInput(canvas, {width: 100, height: 50, radius: () => 4, paint: point => paints.push({...point}), draw() {}});
  t.after(() => input.dispose());
  const send = (target, type, x, y, buttons = 1, id = 1) => {
    const event = new view.MouseEvent(type, {bubbles: true, cancelable: true, button: 0, buttons, clientX: x, clientY: y});
    Object.defineProperties(event, {pointerId: {value: id}, pointerType: {value: 'mouse'}, isPrimary: {value: true}});
    target.dispatchEvent(event); return event;
  };
  return {view, canvas, paints, input, send};
}

test('a drag paints a continuous line without selecting or focusing the canvas', t => {
  const {canvas, paints, input, send} = harness(t);
  const down = send(canvas, 'pointerdown', 30, 40);
  assert.equal(down.defaultPrevented, true);
  assert.notEqual(document.activeElement, canvas);
  canvas.dispatchEvent(new window.Event('blur'));
  send(canvas, 'lostpointercapture', 30, 40);
  send(window, 'pointermove', 190, 100);
  assert.ok(paints.length > 30);
  assert.equal(input.active, true);
  assert.deepEqual(input.position, {x: 90, y: 40});
  for (let i = 1; i < paints.length; i++) assert.ok(Math.hypot(paints[i].x - paints[i - 1].x, paints[i].y - paints[i - 1].y) <= 2.001);
  send(canvas, 'pointerup', 190, 100, 0);
  assert.equal(input.active, false);
});

test('release outside the tank ends the stroke and a second pointer cannot move it', t => {
  const {view, canvas, paints, input, send} = harness(t);
  send(canvas, 'pointerdown', 30, 40);
  send(view, 'pointermove', 80, 60, 1, 2);
  assert.equal(paints.length, 1);
  send(view, 'pointermove', 250, 60);
  assert.equal(input.active, false);
  send(view, 'pointerup', 250, 60, 0);
  const count = paints.length;
  send(canvas, 'pointermove', 80, 60, 0);
  assert.equal(paints.length, count);
  assert.equal(input.active, false);
});

test('keyboard focus and painting remain available after a pointer stroke', t => {
  const {canvas, paints, send} = harness(t);
  send(canvas, 'pointerdown', 30, 40); send(canvas, 'pointerup', 30, 40, 0);
  canvas.focus();
  canvas.dispatchEvent(new window.KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true, cancelable: true}));
  const count = paints.length;
  canvas.dispatchEvent(new window.KeyboardEvent('keydown', {key: ' ', code: 'Space', bubbles: true, cancelable: true}));
  assert.equal(document.activeElement, canvas);
  assert.equal(canvas.hasAttribute('data-pointer-input'), false);
  assert.equal(paints.length, count + 1);
});
