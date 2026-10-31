import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {installDom} from './dom.js';
import * as Controls from '../src/ui/controls.js';
import {createShareButton} from '../src/components/shareButton.js';
import {UIHelper} from '../src/noitalambic/ui/UIHelper.js';

function mountShare(t, getUrl) {
  const window = installDom(t);
  const shell = new window.DOMParser().parseFromString(readFileSync(new URL('../src/index.html', import.meta.url), 'utf8'), 'text/html');
  document.body.innerHTML = shell.body.innerHTML;
  const share = createShareButton(getUrl, Controls);
  document.getElementById('main').replaceChildren(share.button, share.feedback);
  return {...share, control: share.button.querySelector('button'), toast: document.getElementById('notification-toast')};
}

test('successful shares copy the exact URL and reuse a dismissible Bootstrap toast with refreshed auto-hide', async t => {
  let url = 'https://example.test/reactions?reagent=water';
  const {control, feedback, toast} = mountShare(t, () => url);
  const copied = [];
  Object.defineProperty(navigator, 'clipboard', {value: {writeText: async text => {copied.push(text);}}});
  const {default: Toast} = await import('bootstrap/js/dist/toast.js');
  t.after(() => Toast.getInstance(toast)?.dispose());
  // Test the real plugin without CSS transitions in the DOM-only environment.
  toast.classList.add('toast-instant');
  t.mock.timers.enable({apis: ['setTimeout']});
  async function copy() {
    const shown = new Promise(resolve => toast.addEventListener('shown.bs.toast', resolve, {once: true}));
    control.click();
    await shown;
  }
  control.focus();
  await copy();
  const instance = Toast.getInstance(toast);
  assert.ok(instance instanceof Toast);
  assert.equal(instance.isShown(), true);
  assert.equal(toast.classList.contains('theme-success'), true);
  assert.equal(feedback.hidden, true);
  assert.equal(document.activeElement, control, 'success must not steal keyboard focus');
  assert.equal(toast.querySelector('[data-notification-message]').textContent, 'URL copied to clipboard');
  assert.deepEqual(copied, [url]);

  t.mock.timers.tick(2000);
  url = 'https://example.test/reactions?reagent=water&reagent=oil';
  await copy();
  assert.equal(Toast.getInstance(toast), instance);
  assert.equal(copied.at(-1), url);
  assert.equal(document.querySelectorAll('.toast').length, 1);
  t.mock.timers.tick(600);
  assert.equal(instance.isShown(), true, 'the previous copy must not hide the newer message');
  t.mock.timers.tick(1900);
  assert.equal(instance.isShown(), false);

  await UIHelper.showNotification('Graph exported as SVG');
  assert.equal(toast.querySelector('[data-notification-message]').textContent, 'Graph exported as SVG');
  assert.equal(toast.classList.contains('theme-success'), false, 'other notifications must not inherit the previous copy-success styling');
  toast.querySelector('[data-bs-dismiss="toast"]').click();
  assert.equal(instance.isShown(), false, 'Bootstrap handles the dismiss button');
});

test('a failed clipboard copy leaves the exact URL selected for manual copying without a success toast', async t => {
  const url = 'https://example.test/digging?spell=DIGGER&material=soil';
  const {control, feedback, toast} = mountShare(t, () => url);
  Object.defineProperty(navigator, 'clipboard', {value: {writeText: async () => {throw new Error('Permission denied');}}});
  document.execCommand = () => false;
  control.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(feedback.hidden, false);
  assert.equal(feedback.querySelector('[role="status"]').textContent, 'Copy the selected link below.');
  const input = feedback.querySelector('input');
  assert.equal(input.value, url);
  assert.equal(document.activeElement, input);
  assert.equal(input.selectionStart, 0);
  assert.equal(input.selectionEnd, url.length);
  assert.equal(toast.classList.contains('show'), false);
});

test('legacy clipboard success uses the same toast and returns focus to Share', async t => {
  const url = 'https://example.test/materials?material=magic_liquid_protection_all';
  const {control, feedback, toast} = mountShare(t, () => url);
  Object.defineProperty(navigator, 'clipboard', {value: undefined});
  let copied;
  document.execCommand = command => {assert.equal(command, 'copy');copied = document.activeElement.value;return true;};
  const {default: Toast} = await import('bootstrap/js/dist/toast.js');
  t.after(() => Toast.getInstance(toast)?.dispose());
  toast.classList.add('toast-instant');
  const shown = new Promise(resolve => toast.addEventListener('shown.bs.toast', resolve, {once: true}));
  control.click();await shown;
  assert.equal(copied, url);assert.equal(feedback.hidden, true);
  assert.equal(document.activeElement, control);
  assert.equal(toast.classList.contains('theme-success'), true);
  assert.equal(toast.querySelector('[data-notification-message]').textContent, 'URL copied to clipboard');
});

test('cleared or disposed shares ignore late clipboard failures without opening stale fallback fields', async t => {
  const share = mountShare(t, () => 'https://example.test/reactions?reagent=water');
  let reject;
  Object.defineProperty(navigator, 'clipboard', {value: {writeText: () => new Promise((_resolve, failure) => {reject = failure;})}});
  let fallbacks = 0;document.execCommand = () => {fallbacks++;return false;};
  for (const cancel of [share.clear, share.dispose]) {
    share.control.click();cancel();reject(new Error('denied'));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(share.feedback.hidden, true);assert.equal(fallbacks, 0);
    assert.equal(share.toast.classList.contains('show'), false);
  }
});
