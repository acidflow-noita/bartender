import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import * as Plot from '@observablehq/plot';
import {installDom} from './dom.js';
import {pageHeading} from '../src/ui/heading.js';
import {themedPlot} from '../src/ui/plot.js';
import {featureCards} from '../src/ui/featureCards.js';

test('Plot tips use the dark theme on real SVG output, including plots wrapped in figures', t => {
  installDom(t);
  const data = [{x: 1, y: 2, type: 'water'}, {x: 2, y: 4, type: 'lava'}];
  const original = structuredClone(data);
  for (const legend of [false, true]) {
    const plot = themedPlot({width: 400, height: 240, color: {legend},
      marks: [Plot.dot(data, {x: 'x', y: 'y', fill: 'type', tip: true})]});
    const tip = plot.querySelector('[aria-label="tip"]');
    assert.ok(tip, 'implicit tips are still enabled');
    const svg = tip.ownerSVGElement;
    assert.equal(svg.style.getPropertyValue('--plot-background'), 'var(--bg-2)', 'inline property must override Plot’s embedded white default');
    assert.equal(svg.style.color, 'var(--fg-body)');
    assert.deepEqual(data, original);
  }
});

test('title replay keeps its original text and beta marker, and disposal cancels a pending start', async t => {
  const window = installDom(t);
  const heading = pageHeading('Material Properties', {beta: true});
  document.body.append(heading);
  const title = heading.querySelector('#acidTitle'), beta = heading.querySelector('.beta-mark');
  let resolveFont;
  Object.defineProperty(document, 'fonts', {value: {load: () => new Promise(resolve => {resolveFont = resolve;})}});
  const preference = new window.EventTarget(); preference.matches = false;
  window.matchMedia = () => preference;
  const calls = [];
  const gsap = {registerPlugin() {}, to(element, options) {
    const animation = {killed: false, kill() {this.killed = true;}};
    calls.push({element, options, animation}); return animation;
  }};
  const source = readFileSync(new URL('../src/components/titleAnimation.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
  const initialize = runInNewContext(source + '\ninitializeTitleAnimation;', {gsap, ScrambleTextPlugin: {}, document, window, Promise});
  const animation = initialize();
  resolveFont(); await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].element, title);
  assert.equal(calls[0].options.scrambleText.text, 'Material Properties');
  title.textContent = 'mid-scramble'; title.click();
  assert.equal(calls.length, 2);
  assert.equal(calls[1].options.scrambleText.text, 'Material Properties');
  assert.equal(beta.textContent, 'β');
  assert.equal(beta.parentElement, heading);
  preference.matches = true; preference.dispatchEvent(new Event('change'));
  assert.equal(title.textContent, 'Material Properties');
  assert.equal(calls[1].animation.killed, true);
  animation.dispose(); title.click();
  assert.equal(calls.length, 2);
  preference.matches = false;
  const pending = initialize(); pending.dispose(); resolveFont();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(calls.length, 2, 'unmounted pages must not start a late animation');
});

test('home image cards have one named destination and no redundant action button', t => {
  installDom(t);
  const cards = featureCards();
  for (const card of cards.querySelectorAll('article')) {
    assert.ok(card.querySelector('.card-img-top img'));
    assert.equal(card.querySelectorAll('a').length, 1);
    assert.ok(card.querySelector('a.stretched-link').textContent.trim());
    assert.equal(card.querySelectorAll('button, .btn-outline').length, 0);
  }
  assert.equal(cards.querySelectorAll('article').length, 4);
});

test('home cards remain direct Bootstrap columns without implicit HTL span wrappers', t => {
  installDom(t);
  const row = featureCards();
  assert.ok(row.classList.contains('row'));
  assert.equal(row.children.length, 4);
  for (const column of row.children) {
    assert.ok(column.classList.contains('col-6'), 'the direct row child must be a half-width mobile column');
    assert.equal(column.classList.contains('lg:col-3'), false, 'the four cards stay in two rows on desktop');
    assert.ok(column.querySelector(':scope > article.feature-card'));
  }
});
