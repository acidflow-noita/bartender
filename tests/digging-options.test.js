import test from 'node:test';
import assert from 'node:assert/strict';
import {installDom} from './dom.js';
import * as Controls from '../src/ui/controls.js';
import {createDiggingOptions} from '../src/digging/options.js';

test('Glass Cannon is mutually exclusive and Berserkium remains independent', t => {
  installDom(t);
  const options = createDiggingOptions(Controls);
  document.body.append(options.element);
  const radios = [...options.glassCannon.querySelectorAll('input')];
  const check = options.berserkium.querySelector('input');
  const events = [];
  options.element.addEventListener('input', () => events.push({...options.element.value}));
  check.click(); radios[1].click(); radios[2].click(); radios[0].click();
  assert.deepEqual(events, [
    {glassCannon: 0, berserkium: true}, {glassCannon: 1, berserkium: true},
    {glassCannon: 2, berserkium: true}, {glassCannon: 0, berserkium: true},
  ]);
  assert.equal(radios.filter(radio => radio.checked).length, 1);
  options.dispose();
});

test('restoring and resetting emits one complete state and disposal removes listeners', t => {
  installDom(t);
  const options = createDiggingOptions(Controls, {glassCannon: 2, berserkium: true});
  assert.deepEqual(options.element.value, {glassCannon: 2, berserkium: true});
  const states = [];
  options.element.addEventListener('input', () => states.push({...options.element.value}));
  options.setValue({glassCannon: 1}); options.setValue();
  assert.deepEqual(states, [{glassCannon: 1, berserkium: false}, {glassCannon: 0, berserkium: false}]);
  options.dispose();
  options.glassCannon.dispatchEvent(new Event('input'));
  assert.equal(states.length, 2);
});
