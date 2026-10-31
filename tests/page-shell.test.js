import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {renderPageShell} from '../scripts/render-page-shell.mjs';
import {pageDatasets} from '../scripts/data/page-datasets.mjs';
import {loadSources} from '../scripts/data/sources.mjs';
import {installDom} from './dom.js';
import {reactionIntroduction, applyReactionExample} from '../src/reactions/introduction.js';
import {createReactionFinder} from '../src/reactions/model.js';
import {getUnusedMaterialIds} from '../src/components/materialAvailability.js';
import {readReactionReagents} from '../src/components/reactionUrl.js';

const template = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
const data = loadSources();

test('homepage navigation, cards, material colors and exact summary are present before JavaScript runs', () => {
  const dom = new JSDOM(renderPageShell(template, '/'));
  const document = dom.window.document;
  assert.ok(document.querySelector('#site-header nav'));
  const navigation = [...document.querySelectorAll('#site-header .navbar-nav a')];
  assert.deepEqual(navigation.map(link => link.textContent), ['Reactions Finder', 'Spells’ Digging Abilityβ', 'Material Propertiesβ', 'Reactions Graph', 'Fungal Shift Plannerα']);
  assert.deepEqual(navigation.map(link => link.getAttribute('href')), ['/reactions', '/digging', '/materials', '/reactions_graph_finder', '/fungal_shifting']);
  assert.equal(document.querySelectorAll('#site-header .navbar-nav sup').length, 3);
  assert.equal(document.querySelectorAll('.feature-card').length, 4);
  assert.ok(document.querySelector('.bi-github path'));
  assert.equal(document.querySelectorAll('.home-page [class^="material-type-"]').length, 5);
  assert.deepEqual(JSON.parse(document.querySelector('[data-home-summary]').textContent), pageDatasets(data).homeSummary);
  for (const image of document.querySelectorAll('.feature-card img')) assert.ok(image.getAttribute('src').startsWith('/data/images/'));
  assert.equal(document.querySelector('a[href="/upcoming"]'), null);
  assert.equal(document.querySelector('.home-page a[href="/thanks"]'), null);
  assert.deepEqual([...document.querySelectorAll('[data-material-introduction] p')].map(p => p.textContent), [
    'Everything in the world of Noita is made of materials, even the visual effects.',
    `There are ${data.materials.length} materials total. Each material is described by 1 to 10 tags out of ${data.tags.length} unique tags.`,
    'Each material can be of one type: solid, liquid, powder, gas, or fire. There are two exceptions: Air ("nothing," the non-matter) and a special material fungal_shift_particle_fx — these do not have a type.',
  ]);
  dom.window.close();
});

test('Reactions preserves the authored explanation and local links work before JavaScript initializes', () => {
  const dom = new JSDOM(renderPageShell(template, '/reactions/'));
  const document = dom.window.document;
  assert.equal(document.querySelector('[aria-current="page"]').getAttribute('href'), '/reactions');
  const intro = document.querySelector('.reaction-introduction');
  assert.equal(intro.textContent, `Ever wanted to make Ambrosia? Is Flummoxium even useful? Mixing frog meat and whiskey does something!? Noita has ${data.reactions.length} fixed material reactions, and two secret reactions for each seed. When you select the first ingredient the list autoupdates, showing only materials that can react with the selected.`);
  const links = [...intro.querySelectorAll('a.local-link')];
  assert.equal(links.length, 4);
  for (const link of links) {
    const url = new URL(link.getAttribute('href'), 'https://example.test');
    assert.equal(url.pathname, '/reactions');
    assert.equal(link.dataset.exampleField === 'product' ? url.searchParams.get('product') : readReactionReagents(url.href)[0], link.dataset.exampleMaterial);
    assert.ok(link.classList.contains(link.dataset.exampleMaterial === 'meat_frog' ? 'material-type-solid' : 'material-type-liquid'));
  }
  assert.equal(document.querySelectorAll('link[data-page-preload]').length, 3);
  dom.window.close();
});

test('material examples fill the appropriate selectors and combine compatible ingredients', t => {
  installDom(t);
  const state = {selectedReagents: [], selectedProduct: '', excludeSpecialMaterials: true, onlyPracticalReactions: true, excludeUnusedMaterials: true};
  const finder = createReactionFinder(data.materials, data.reactions, getUnusedMaterialIds(data.availability), state);
  applyReactionExample(state, finder, 'magic_liquid_protection_all', 'product');
  assert.equal(state.selectedProduct, 'magic_liquid_protection_all');
  assert.deepEqual(state.selectedReagents, []);
  applyReactionExample(state, finder, 'material_confusion', 'reagent');
  assert.equal(state.selectedProduct, '');
  assert.deepEqual(state.selectedReagents, ['material_confusion']);
  state.selectedReagents = [];
  applyReactionExample(state, finder, 'meat_frog', 'reagent');
  applyReactionExample(state, finder, 'alcohol', 'reagent');
  assert.deepEqual(state.selectedReagents, ['meat_frog', 'alcohol']);
  assert.ok(finder.getFilteredReactions(state.selectedReagents, '').length);
  const intro = reactionIntroduction(data.materials, data.reactions.length);
  assert.equal(intro.querySelectorAll('[data-example-material]').length, 4);
});
