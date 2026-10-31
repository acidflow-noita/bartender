import test from 'node:test';
import assert from 'node:assert/strict';
import {installDom} from './dom.js';
import {formatNumber, numberText} from '../src/ui/format.js';
import {table} from '../src/ui/table.js';
import {propertyText, propertyDisplayText, filterReferenceRows} from '../src/materials/reference.js';
import {createMaterialDetails} from '../src/materials/details.js';

test('number grouping preserves decimal precision, signs, exponents and exact XML strings', () => {
  for (const [value, expected] of [
    [100000, '100,000'], [-1234567.125, '-1,234,567.125'], [0, '0'], [1e-12, '1e-12'],
    [5.119999885559082, '5.119999885559082'],
    ['9007199254740993.000000000000000001', '9,007,199,254,740,993.000000000000000001'],
    [' +100000.00100 ', ' +100,000.00100 '], ['.00001200', '.00001200'], ['100000e-8', '100,000e-8'],
  ]) assert.equal(formatNumber(value), expected);
  const row={source:{key:'xml',label:'XML'},path:['@hp'],property:'@hp',label:'Hit points',value:'100000.00010'};
  assert.equal(propertyDisplayText(row.value,row),'"100,000.00010"');
  assert.equal(propertyText(row.value),'"100000.00010"');
  for (const query of ['100000','100,000']) assert.deepEqual(filterReferenceRows([row],query),[row]);
  for (const key of ['@name','@color','@wang_color']) {
    assert.equal(propertyDisplayText('100000',{...row,path:[key]}),'"100000"','identifiers and colors are not decimal quantities');
  }
});

test('tables group numeric readouts while sorting the original numbers and preserving text IDs', t => {
  installDom(t);
  const rows=[{id:'100000',value:100000},{id:'9999',value:9999},{id:'decimal',value:10000.000000000002}];
  const original=structuredClone(rows);
  const grid=table(rows,{columns:['id','value'],sort:'value'});
  t.after(()=>grid.dispose());
  assert.deepEqual([...grid.querySelectorAll('tbody tr')].map(row=>[...row.cells].map(cell=>cell.textContent)),[
    ['9999','9999'],['decimal','10000.000000000002'],['100000','100000'],
  ]);
  assert.equal(grid.querySelectorAll('tbody .number-group').length,3,'grouping is visual decoration, not copied text');
  grid.setSort('value',true);
  assert.equal(grid.querySelector('tbody tr').cells[0].textContent,'100000');
  assert.deepEqual(rows,original);
});

test('numeric selections retain raw digits and decimals in plain text and HTML fragments', t => {
  const window=installDom(t), selection=window.getSelection();
  for (const [value,quoted] of [[100000,false],[-1234567.125,false],['9007199254740993.000000000000000001',true],[' +100000.00100 ',true]]) {
    const node=numberText(value,{quoted});
    document.body.append(node);
    const range=document.createRange();range.selectNodeContents(node);
    selection.removeAllRanges();selection.addRange(range);
    const expected=quoted ? JSON.stringify(value) : String(value);
    assert.equal(selection.toString(),expected);
    assert.equal(range.cloneContents().textContent,expected);
    assert.ok(node.querySelector('.number-group'));
  }
  const text=document.createElement('p');text.append('water, oil: ',numberText(100000));
  document.body.append(text);
  const range=document.createRange();range.selectNodeContents(text);
  assert.equal(range.toString(),'water, oil: 100000','ordinary punctuation must not be stripped from copied text');
});

test('material property cells copy original numeric values and exact XML strings', async t => {
  installDom(t);
  const record={id:'test',catalog:{id:'test',name:'Test',hardness:100000},native:{},
    xml:[{kind:'CellData',definition:{'@name':'test','@custom_number':'100000.000000000000000001'}}],parents:[]};
  const original=structuredClone(record);
  const details=createMaterialDetails([record.catalog],{load:async()=>record});
  document.body.append(details.element);t.after(()=>details.dispose());
  await details.setMaterial(record.catalog);
  for (const [key,expected] of [['hardness','100000'],['custom_number','"100000.000000000000000001"']]) {
    const row=[...details.element.querySelectorAll('tbody tr')].find(row=>row.cells[1].textContent===key);
    const value=row.cells[2].querySelector('code');
    assert.ok(value.querySelector('.number-group'));
    const range=document.createRange();range.selectNodeContents(value);
    assert.equal(range.toString(),expected);
  }
  assert.deepEqual(record,original);
});
