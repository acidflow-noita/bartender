import test from 'node:test';
import assert from 'node:assert/strict';
import {installDom} from './dom.js';
import * as Controls from '../src/ui/controls.js';
import {setControlDisabled} from '../src/ui/disabled.js';

test('disabled actions retain their layout, explain the reason, and restore enabled behavior', t => {
  installDom(t);
  let clicks = 0;
  const wrapper = Controls.button('Share', {reduce: () => {clicks++;}});
  const button = wrapper.querySelector('button');
  document.body.append(wrapper);
  wrapper.title = 'Share this selection';
  wrapper.setAttribute('aria-description', 'Original description');
  const children = [...wrapper.childNodes];
  setControlDisabled(button, true, 'Select a material first.');
  assert.equal(button.disabled, true);
  button.click();
  assert.equal(clicks, 0);
  assert.deepEqual([...wrapper.childNodes], children, 'disabling must not insert layout wrappers');
  assert.equal(wrapper.title, 'Select a material first.');
  assert.equal(wrapper.getAttribute('aria-description'), wrapper.title);
  assert.equal(wrapper.getAttribute('aria-label'), 'Share');
  wrapper.focus();
  assert.equal(document.activeElement, wrapper, 'the explanation is reachable by keyboard');
  setControlDisabled(button, true, 'Select a spell first.');
  assert.equal(wrapper.title, 'Select a spell first.');
  setControlDisabled(button, false);
  button.click();
  assert.equal(clicks, 1);
  assert.equal(wrapper.title, 'Share this selection');
  assert.equal(wrapper.getAttribute('aria-description'), 'Original description');
  for (const attribute of ['tabindex', 'aria-disabled', 'aria-label', 'role', 'data-disabled-hint-active']) {
    assert.equal(wrapper.hasAttribute(attribute), false, attribute);
  }
  assert.equal(wrapper.classList.contains('focus-ring'), false);
});

test('disabled checkboxes retain Bootstrap input/label order and ranges keep other controls usable', t => {
  installDom(t);
  const toggle = Controls.toggle({label: 'Exclude unused materials', value: true});
  const checkbox = toggle.querySelector('input'), label = toggle.querySelector('label');
  document.body.append(toggle);
  setControlDisabled(checkbox, true, 'Available for the base game only.');
  assert.equal(checkbox.nextElementSibling, label, 'Bootstrap uses this sibling relationship for disabled label styling');
  label.click();
  assert.equal(toggle.value, true);
  setControlDisabled(checkbox, false);
  label.click();
  assert.equal(toggle.value, false);
  const range = Controls.range([0, 10], {label: 'Maximum', value: 5});
  const slider = range.querySelector('[type="range"]'), exact = range.querySelector('[type="number"]');
  document.body.append(range);
  setControlDisabled(slider, true, 'Use the exact value field.');
  assert.equal(slider.closest('.form-range').getAttribute('aria-description'), 'Use the exact value field.');
  assert.equal(exact.disabled, false);
  assert.equal(range.value, 5);
  setControlDisabled(slider, false);
  assert.equal(slider.closest('.form-range').hasAttribute('tabindex'), false);
});

test('the graph availability filter explains its disabled state and restores its normal hint', async t => {
  installDom(t);
  const {UIController} = await import('../src/noitalambic/ui/UIController.js');
  const state = {reactionSource: 'base', excludeUnusedMaterials: true};
  const controller = new UIController(state);
  const toggle = controller.createUnusedMaterialsToggle(Controls);
  document.body.append(toggle);
  const input = toggle.querySelector('input'), normalTitle = toggle.title;
  state.reactionSource = 'apotheosis';
  controller.updateUnusedMaterialsToggle();
  assert.equal(input.disabled, true);
  assert.equal(toggle.getAttribute('aria-description'), 'Material availability has only been audited for the base game.');
  assert.equal(toggle.value, true);
  state.reactionSource = 'base';
  controller.updateUnusedMaterialsToggle();
  assert.equal(input.disabled, false);
  assert.equal(toggle.title, normalTitle);
  assert.equal(toggle.hasAttribute('tabindex'), false);
});

test('a disabled Choices picker retains its label, blocks selection, and explains the URL limit', async t => {
  const window = installDom(t); window.matchMedia = () => ({matches: false});
  const {createDiggingSelect} = await import('../src/digging/select.js');
  const picker = createDiggingSelect([{id: 'BOMB', name: 'Bomb'}], {label: 'Spells', kind: 'spells', multiple: true, maxItems: 0});
  document.body.append(picker.element);
  try {
    const select = picker.element.querySelector('select');
    assert.equal(select.disabled, true);
    assert.ok(picker.element.querySelector('.choices.is-disabled'));
    assert.match(picker.element.getAttribute('aria-description'), /too long/);
    assert.equal(picker.element.getAttribute('aria-label'), 'Spells');
    picker.setValue('BOMB');
    assert.deepEqual(picker.element.value, []);
  } finally {picker.dispose();}
});

test('graph export is available only while a graph exists', async t => {
  installDom(t);
  const {UIController} = await import('../src/noitalambic/ui/UIController.js');
  const controller = new UIController({});
  const action = controller.createExportButton(Controls);
  const button = action.querySelector('button');
  document.body.append(action);
  assert.equal(button.disabled, true);
  assert.match(action.title, /produce a graph/);
  const graph = document.createElement('div');graph.id = 'graphContainer';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  graph.append(svg);document.body.append(graph);
  controller.updateExportButton();assert.equal(button.disabled, false);
  graph.replaceChildren();controller.updateExportButton();assert.equal(button.disabled, true);
});
