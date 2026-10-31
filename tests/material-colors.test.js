import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {compile} from 'sass';
import {installDom} from './dom.js';
import {materialTypeColors, materialTypeClass} from '../src/components/materialTypeStyles.js';
import {materialCell} from '../src/ui/material.js';
import {createChoicesTemplates} from '../src/components/choicesTemplates.js';

const originalColors = {
  Solid: 'oklch(70.9% 0.01 56.259)',
  Liquid: 'oklch(80.9% 0.105 251.813)',
  Powder: 'oklch(91% 0.096 180.426)',
  Gas: 'oklch(83.3% 0.145 321.434)',
  Fire: 'oklch(80.8% 0.114 19.571)',
  'N/A': 'oklch(98.5% 0 0)',
};

test('plots and material labels retain the original semantic palette', () => {
  assert.deepEqual(Object.fromEntries(materialTypeColors.map(({type, color}) => [type, color])), originalColors);
  assert.equal(materialTypeClass('Liquid'), 'material-type-liquid');
  assert.equal(materialTypeClass('no type'), 'material-type-na');
  assert.equal(materialTypeClass(undefined), 'material-type-na');
});

test('real selectors, tables and fungal labels keep type colors under Bootstrap and theme changes', async t => {
  installDom(t);
  document.documentElement.setAttribute('data-bs-theme', 'dark');
  const style = document.createElement('style');
  style.textContent = compile(fileURLToPath(new URL('../src/styles/app.scss', import.meta.url)), {loadPaths: ['node_modules']}).css
    + readFileSync(new URL('../node_modules/choices.js/public/assets/styles/choices.css', import.meta.url), 'utf8')
    + readFileSync(new URL('../src/styles/choices.css', import.meta.url), 'utf8')
    + readFileSync(new URL('../src/styles/materials.css', import.meta.url), 'utf8');
  document.head.append(style);
  const {default: Choices} = await import('choices.js');
  const {createDiggingSelect} = await import('../src/digging/select.js');
  const {materialNode, materialSelect} = await import('../src/fungal/select.js');
  // Synthetic metadata covers every display type; no game data is changed.
  const materials = Object.keys(originalColors).map((type, i) => ({id: `test_${i}`, name: `Test ${type}`, type, wikipage: 'Material'}));
  const catalog = new Map(materials.map(item => [item.id, item]));
  const select = document.createElement('select'); select.multiple = true; document.body.append(select);
  const choices = new Choices(select, {allowHTML: false, renderSelectedChoices: 'always', removeItemButton: true,
    choices: materials.map(item => ({value: item.id, label: item.name, selected: true})),
    callbackOnCreateTemplates: createChoicesTemplates(Choices, {getItem: id => catalog.get(id), getImageUrl: () => '/test.png'})});
  t.after(() => choices.destroy());
  const picker = createDiggingSelect(materials, {label: 'Material', kind: 'materials', value: materials[0].id});
  const fungal = materialSelect(materials, {label: 'Held material', value: materials[0].id});
  document.body.append(picker.element, fungal.element);
  t.after(() => {picker.dispose(); fungal.dispose();});

  // jsdom exposes var() expressions in computed colors. Resolve these through
  // the actual element/ancestor declarations after the stylesheet cascade.
  function resolvedColor(element) {
    const resolve = (value, depth = 0) => {
      assert.ok(depth < 12, 'color variables must not form a cycle');
      return value.replace(/var\((--[\w-]+)\)/g, (_match, property) => {
        for (let node = element; node; node = node.parentElement) {
          const value = getComputedStyle(node).getPropertyValue(property).trim();
          if (value) return resolve(value, depth + 1);
        }
        throw new Error(`Unresolved material color: ${property}`);
      });
    };
    return resolve(getComputedStyle(element).color);
  }
  const check = (element, material) => {
    assert.ok(element, `Missing colored ID for ${material.type}`);
    assert.equal(resolvedColor(element).replace(/\s+/g, ''), originalColors[material.type].replace(/\s+/g, ''), material.type);
  };
  for (const primary of ['rgb(0, 255, 0)', 'rgb(255, 0, 255)']) {
    document.documentElement.style.setProperty('--primary-fg', primary);
    document.documentElement.style.setProperty('--code-color', primary);
    for (const material of materials) {
      const type = materialTypeClass(material.type);
      const shared = select.closest('.choices');
      check(shared.querySelector(`.choices__list--multiple .${type} code`), material);
      check(shared.querySelector(`.choices__list--dropdown .${type}`), material);
      picker.setValue(material.id);
      check(picker.element.querySelector(`.choices__list--single .${type} code`), material);
      const selected = picker.element.querySelector('.choices__list--dropdown .is-selected');
      assert.ok(selected);
      selected.classList.remove('is-highlighted');
      assert.equal(getComputedStyle(selected).backgroundColor, 'var(--bg-3)', 'selected suggestions must not fall back to the light Choices background');
      fungal.setValue(material.id);
      check(fungal.element.querySelector(`.choices__list--multiple .${type}`), material);
      for (const node of [materialCell(material), materialNode(material.id, catalog)]) {
        document.body.append(node);
        check(node.querySelector(`.${type}`), material);
        node.remove();
      }
    }
  }
});
