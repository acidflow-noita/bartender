import test from 'node:test';
import assert from 'node:assert/strict';
import {installDom} from './dom.js';
import {loadSources} from '../scripts/data/sources.mjs';

test('limited initial suggestions retain searching and URL restoration across the complete catalog', async t => {
  const window = installDom(t);
  window.matchMedia = () => ({matches: false});
  const {createDiggingSelect} = await import('../src/digging/select.js');
  const catalog = Array.from({length: 150}, (_, index) => ({
    id: `material_${String(index).padStart(3, '0')}`, name: `Material ${String(index).padStart(3, '0')}`, type: 'Liquid',
  }));
  const picker = createDiggingSelect(catalog, {label: 'Material', kind: 'materials', value: null});
  document.getElementById('main').append(picker.element);
  t.after(() => picker.dispose());
  assert.equal(picker.element.querySelectorAll('.choices__list--dropdown [data-choice-selectable]').length, 100);
  assert.equal(picker.element.querySelector('.choices__list--dropdown [data-value="material_149"]'), null);
  const input = picker.element.querySelector('input.choices__input');
  input.focus(); input.value = 'material_149';
  input.dispatchEvent(new window.Event('input', {bubbles: true}));
  const result = picker.element.querySelector('.choices__list--dropdown [data-value="material_149"]');
  assert.ok(result, 'search must include entries outside the initial suggestions');
  result.dispatchEvent(new window.MouseEvent('mousedown', {bubbles: true, cancelable: true}));
  assert.equal(picker.element.value, catalog[149]);
  picker.setValue('material_148');
  assert.equal(picker.element.value, catalog[148], 'shared links must restore entries outside the render limit');
});

test('fungal selectors search the full material catalog while limiting initial suggestions', async t => {
  const window=installDom(t);window.matchMedia=()=>({matches:false});
  const {materialSelect}=await import('../src/fungal/select.js');
  const {materials}=loadSources();
  const picker=materialSelect(materials,{label:'Source material'});
  document.getElementById('main').append(picker.element);t.after(()=>picker.dispose());
  assert.equal(picker.element.querySelectorAll('.choices__list--dropdown [data-choice-selectable]').length,100);
  const input=picker.element.querySelector('input.choices__input');
  input.focus();input.value='Healthium';input.dispatchEvent(new window.Event('input',{bubbles:true}));
  const result=picker.element.querySelector('.choices__list--dropdown [data-value="magic_liquid_hp_regeneration"]');
  assert.ok(result,'Healthium must be searchable even outside initial suggestions or natural shift pools');
  result.dispatchEvent(new window.MouseEvent('mousedown',{bubbles:true,cancelable:true}));
  assert.equal(picker.value,'magic_liquid_hp_regeneration');
  for(const id of ['mimic_liquid','cloud_slime','milk','urine']) {picker.setValue(id);assert.equal(picker.value,id);}
});
