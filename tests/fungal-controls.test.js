import test from 'node:test';
import assert from 'node:assert/strict';
import {installDom} from './dom.js';
import {loadSources} from '../scripts/data/sources.mjs';
import {readFileSync} from 'node:fs';

test('Bootstrap controls update the actual fungal app, predictions and simulation without changing the solver', async t => {
  installDom(t, 'https://example.test/fungal_shifting?seed=12345&view=predictions');
  const {createFungalApp} = await import('../src/fungal/app.js');
  const {predictionRows, sourceState} = await import('../src/fungal/engine.js');
  const data = loadSources();
  const app = createFungalApp({base: data.materials, apotheosis: data.apotheosisMaterials});
  document.getElementById('main').append(app);
  t.after(() => app.dispose());
  const expected = predictionRows(sourceState(12345).world_state.all_shifts[0]);
  assert.equal(app.querySelectorAll('.fs-predictions tbody tr').length, expected.length);
  assert.equal(app.querySelectorAll('.fs-predictions input').length, 0);
  const simulation = app.querySelector('.fs-tabs input[value="simulation"]');
  simulation.click();
  assert.equal(app.querySelector('[data-view="simulation"]').hidden, false);
  assert.equal(app.querySelector('[data-view="predictions"]').hidden, true);
  const range = app.querySelector('.fs-slider input[type="range"]');
  range.value = '3'; range.dispatchEvent(new Event('input', {bubbles: true}));
  assert.match(app.querySelector('[data-view="simulation"]').textContent, /World after 3 shifts/);
  const modes = app.querySelectorAll('.fs-modes input');
  assert.equal(modes.length, 4);
  assert.ok([...modes].some(input => input.closest('.form-field').hidden));
});

test('planner controls follow seed, goal, search and held-material prerequisites without losing selections', async t => {
  const window = installDom(t, 'https://example.test/fungal_shifting');
  const originalFetch = globalThis.fetch, originalWorker = globalThis.Worker;
  const workers = [];
  globalThis.fetch = () => new Promise(() => {});
  globalThis.Worker = class {
    constructor() {workers.push(this);}
    postMessage(message) {this.message = message;}
    terminate() {this.stopped = true;}
  };
  const {createFungalApp} = await import('../src/fungal/app.js');
  const data = loadSources();
  const app = createFungalApp({base: data.materials, apotheosis: data.apotheosisMaterials});
  document.getElementById('main').append(app);
  t.after(() => {app.dispose();globalThis.fetch = originalFetch;globalThis.Worker = originalWorker;});
  const button = label => [...app.querySelectorAll('button')].find(button => button.textContent.trim() === label);
  const seed = app.querySelector('.fs-seed input');
  const enterSeed = value => {seed.value = value;seed.dispatchEvent(new Event('input', {bubbles: true}));};
  const start = button('Find solutions'), stop = button('Stop search'), share = button('Share');
  for (const control of [start, share, button('Add goal'), ...app.querySelectorAll('.fs-simulation-controls input, .fs-simulation-controls select, .fs-slider input, .fs-transition input')]) {
    assert.equal(control.disabled, true, control.getAttribute('aria-label') || control.textContent);
  }
  assert.match(start.parentElement.title, /world seed/);
  assert.equal(app.querySelector('.fs-tabs').disabled, true);
  start.click();assert.equal(workers.length, 0);
  enterSeed('0');
  assert.equal(share.disabled, false, 'zero is a valid seed');
  assert.equal(app.querySelector('.fs-tabs').disabled, false);
  assert.equal(app.querySelector('.fs-slider input').disabled, false);
  assert.equal(start.disabled, true, 'a valid seed still needs complete goals');
  assert.match(start.parentElement.title, /source and target/);
  assert.equal(button('Clear held materials').disabled, true);
  assert.equal(app.querySelector('.fs-solution-selector select').disabled, true);
  for (const value of ['4294967296', 'no seed', '   ']) {
    enterSeed(value);assert.equal(share.disabled, true);assert.equal(start.disabled, true);
  }
  history.replaceState(null, '', '?seed=12345&goal=water:oil&hold=1:water&view=simulation');
  window.dispatchEvent(new Event('popstate'));
  assert.equal(start.disabled, false);
  assert.equal(share.disabled, false);
  assert.equal(button('Clear held materials').disabled, false);
  assert.equal(app.querySelector('.fs-simulation-controls .choices.is-disabled'), null);
  start.click();
  assert.equal(workers.length, 1);
  assert.deepEqual(workers[0].message.constraints, [{base: 'water', target: 'oil'}]);
  assert.equal(start.disabled, true);assert.equal(stop.disabled, false);
  stop.click();
  assert.equal(workers[0].stopped, true);
  assert.equal(start.disabled, false);assert.equal(stop.disabled, true);
  button('Clear held materials').click();assert.equal(button('Clear held materials').disabled, true);
  enterSeed('');
  assert.equal(start.disabled, true, 'the cached previous world must not enable search for an empty seed');
  assert.equal(app.querySelector('.fs-slider input').disabled, true);
  assert.ok(app.querySelector('.fs-goals .choices.is-disabled'));
  enterSeed('12345');assert.equal(start.disabled, false, 'existing goals survive disabling and re-enabling');
  const custom = app.querySelector('input[placeholder="my_mod_material"]'), add = button('Add material');
  assert.equal(add.disabled, true);
  for (const [value, disabled] of [['bad-id', true], ['water', true], ['custom_test_material', false]]) {
    custom.value = value;custom.dispatchEvent(new Event('input', {bubbles: true}));assert.equal(add.disabled, disabled);
  }
  add.click();assert.equal(add.disabled, true, 'already available materials cannot be added again');
});

test('planner sharing flushes the latest setup and uses the common success toast and manual fallback', async t => {
  const window = installDom(t, 'https://example.test/fungal_shifting?seed=12345&goal=water:oil');
  const shell = new window.DOMParser().parseFromString(readFileSync(new URL('../src/index.html', import.meta.url), 'utf8'), 'text/html');
  document.body.innerHTML = shell.body.innerHTML;
  const {createFungalApp} = await import('../src/fungal/app.js');
  const {default: Toast} = await import('bootstrap/js/dist/toast.js');
  const data = loadSources(), copied = [];
  const app = createFungalApp({base: data.materials, apotheosis: data.apotheosisMaterials});
  document.getElementById('main').append(app);
  const toast = document.getElementById('notification-toast');toast.classList.add('toast-instant');
  t.after(() => {app.dispose();Toast.getInstance(toast)?.dispose();});
  Object.defineProperty(navigator, 'clipboard', {configurable: true, value: {writeText: async value => copied.push(value)}});
  const share = [...app.querySelectorAll('header button')].find(button => button.textContent.trim() === 'Share');
  assert.ok(share.querySelector('.bi-copy'));
  const seed = app.querySelector('.fs-seed input');
  for (const value of ['12346', '12347']) {seed.value = value;seed.dispatchEvent(new Event('input', {bubbles: true}));}
  const shown = new Promise(resolve => toast.addEventListener('shown.bs.toast', resolve, {once: true}));
  share.click();await shown;
  assert.equal(new URL(copied[0]).searchParams.get('seed'), '12347');
  assert.equal(new URL(copied[0]).searchParams.get('goal'), 'water:oil');
  assert.equal(window.location.href, copied[0]);
  assert.equal(toast.classList.contains('theme-success'), true);
  assert.equal(toast.querySelector('[data-notification-message]').textContent, 'URL copied to clipboard');
  assert.doesNotMatch(app.textContent, /Link copied\./);
  Toast.getInstance(toast).hide();
  Object.defineProperty(navigator, 'clipboard', {configurable: true, value: {writeText: async () => {throw new Error('denied');}}});
  document.execCommand = () => false;
  share.click();await new Promise(resolve => setImmediate(resolve));
  const fallback = app.querySelector('input[readonly]');
  assert.equal(fallback.value, copied[0]);
  assert.equal(document.activeElement, fallback);
  assert.equal(fallback.selectionEnd, fallback.value.length);
  assert.match(app.textContent, /Copy the selected link below/);
  assert.equal(toast.classList.contains('show'), false);
  seed.value = '12348';seed.dispatchEvent(new Event('input', {bubbles: true}));
  assert.ok(fallback.closest('[hidden]'), 'a changed setup clears the old fallback URL');
});
