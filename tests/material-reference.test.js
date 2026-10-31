import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {XMLParser} from 'fast-xml-parser';
import {loadSources, digest} from '../scripts/data/sources.mjs';
import {materialReferences, parseMaterialDefinitions} from '../scripts/data/material-reference.mjs';
import {referenceSections, referenceRows, referenceGroups, filterReferenceRows, propertyText, propertyLabel, isMaterialReference, isNumericPropertyValue} from '../src/materials/reference.js';
import {installDom} from './dom.js';
import {createMaterialDetails} from '../src/materials/details.js';
import {materialCell} from '../src/ui/material.js';

const data = loadSources(), records = materialReferences(data);
const leafCount = value => value !== null && typeof value === 'object' && Object.keys(value).length
  ? Object.values(value).reduce((count, child) => count + leafCount(child), 0) : 1;

test('each per-material browser export preserves the complete record and has a content hash', () => {
  const manifest = JSON.parse(readFileSync(new URL('../src/generated/data-manifest.json', import.meta.url)));
  const index = JSON.parse(readFileSync(new URL('../public'+manifest.materialDetails, import.meta.url)));
  assert.deepEqual(Object.keys(index), records.map(record=>record.id));
  for (const record of records) {
    assert.equal(index[record.id], `/data/material-${record.id}-${digest(record).slice(0,16)}.json`);
    assert.deepEqual(JSON.parse(readFileSync(new URL('../public'+index[record.id], import.meta.url))), record);
  }
});

test('all catalog and runtime fields, nested values and parent definitions reach the reference', () => {
  assert.equal(records.length, data.materials.length);
  for (const record of records) {
    assert.deepEqual(record.catalog, data.materials.find(material => material.id === record.id));
    assert.deepEqual(record.native, data.materialNative.find(material => material.id === record.id));
    assert.deepEqual(record.xml, data.materialXml.filter(material => material.id === record.id));
    for (const parent of record.parents) assert.deepEqual(parent.definitions, data.materialXml.filter(material => material.id === parent.id));
    const sections = referenceSections(record), rows = referenceRows(record);
    assert.equal(rows.length, sections.reduce((count, section) => count + leafCount(section.value), 0));
    const paths = new Set();
    for (const row of rows) {
      assert.deepEqual(row.value, row.path.reduce((value, key) => value[key], row.source.value));
      const identity = JSON.stringify([row.source.label, row.path]);
      assert.equal(paths.has(identity), false, 'a duplicated property cannot hide an omitted property'); paths.add(identity);
    }
  }
});

test('the reference combines repeated properties without losing or changing any definitions', () => {
  const entries = rows => rows.map(row=>JSON.stringify([row.source.label,row.path,row.value])).sort();
  for (const record of records) {
    const groups = referenceGroups(record);
    assert.deepEqual(entries(groups.flatMap(group=>group.definitions)),entries(referenceRows(record)));
    const own = groups.filter(group=>group.source.key!=='parents');
    assert.equal(new Set(own.map(group=>group.property)).size,own.length);
    assert.equal(own.find(group=>group.property==='id').value,record.id);
    assert.equal(own.find(group=>group.property==='name').value,record.catalog.name);
    assert.equal(own.find(group=>group.property==='hardness').value,record.catalog.hardness);
  }
});

test('numeric formatting recognizes XML numbers without treating colors, IDs, booleans or empty values as numbers', () => {
  const native={path:['density'],source:{key:'native'}};
  const xml={path:['ParticleEffect','@vel_random.min_y'],source:{key:'xml'}};
  for (const value of [0,-17.18,100]) assert.equal(isNumericPropertyValue(value,native),true);
  for (const value of ['0','-17.18','.2','1e-3']) assert.equal(isNumericPropertyValue(value,xml),true);
  for (const value of [null,false,true,'','false','1,2']) assert.equal(isNumericPropertyValue(value,xml),false);
  assert.equal(isNumericPropertyValue('0',native),false,'a quoted JSON string remains a string');
  assert.equal(isNumericPropertyValue('90200000',{path:['@wang_color'],source:{key:'xml'}}),false);
  assert.equal(isNumericPropertyValue('123',{path:['@name'],source:{key:'xml'}}),false);
});

test('every XML attribute survives, including repeated definitions in their original order', () => {
  const xml = readFileSync(new URL('../src/data/materials.xml', import.meta.url), 'utf8');
  const root = new XMLParser({ignoreAttributes:false,attributeNamePrefix:'',parseAttributeValue:false,preserveOrder:true}).parse(xml).find(node => node.Materials).Materials;
  const original = root.filter(node => 'CellData' in node || 'CellDataChild' in node);
  assert.deepEqual(data.materialXml.map(node => [node.kind,node.id]), original.map(node => ['CellData' in node ? 'CellData' : 'CellDataChild',node[':@'].name]));
  const attributes = value => {
    if (!value || typeof value !== 'object') return [];
    return Object.entries(value).flatMap(([key, child]) => key === ':@' ? Object.entries(child) : attributes(child));
  };
  for (const [index, node] of data.materialXml.entries()) {
    const source = {id:node.id,catalog:{},native:{},xml:[node],parents:[]};
    const restored = referenceRows(source).filter(row => String(row.path.at(-1)).startsWith('@')).map(row => [row.path.at(-1).slice(1),row.value]);
    assert.deepEqual(restored.sort(), attributes(original[index]).sort(), node.id);
  }
  assert.equal(records.find(record => record.id === 'rock_box2d').xml.length, 2);
  assert.equal(records.find(record => record.id === 'meat_pumpkin').xml.length, 2);
});

test('unknown future fields, null, false, zero, empty collections and raw XML strings remain distinct', () => {
  const extra = {zero:0,missing:null,disabled:false,empty:'',array:[],object:{},future:{'a.b':[0,false,null]}};
  const record = {id:'test',catalog:extra,native:{hp:100},xml:parseMaterialDefinitions('<Materials><CellData name="test" hp="0" new_flag="false"><Future nested="0"/></CellData></Materials>'),parents:[]};
  const rows = referenceRows(record);
  assert.equal(rows.find(row => row.property === 'zero').value, 0);
  assert.equal(rows.find(row => row.property === '@hp').value, '0');
  assert.equal(rows.find(row => row.property === '@new_flag').value, 'false');
  assert.equal(rows.find(row => row.property === 'Future.@nested').value, '0');
  assert.deepEqual(filterReferenceRows(rows, 'a.b').map(row => row.value), [0,false,null]);
  assert.equal(filterReferenceRows(rows, '', 'native').length, 1);
  assert.equal(propertyLabel(['hp'], {key:'native'}), 'Hardness');
  assert.equal(propertyLabel(['@hp'], {key:'xml'}), 'Hit points');
  assert.deepEqual([0,false,null,'',[],{}].map(propertyText), ['0','false','null','""','[]','{}']);
  assert.equal(propertyText('null'), '"null"');
  assert.equal(propertyText('0'), '"0"');
  assert.equal(isMaterialReference({path:['cell_type'],source:{key:'native'}}),false,'a material type is not a link to the Fire material');
  assert.equal(isMaterialReference({path:['on_fire_smoke_material'],source:{key:'native'}}),true);
  assert.equal(isMaterialReference({path:['@_parent'],source:{key:'xml'}}),true);
});

test('missing or circular XML ancestry fails instead of dropping reference fields', () => {
  const fixture = xml => {
    const materialXml = parseMaterialDefinitions(xml), materials = [...new Set(materialXml.map(row=>row.id))].map(id=>({id}));
    return {materials,materialNative:structuredClone(materials),materialXml};
  };
  assert.throws(() => materialReferences(fixture('<Materials><CellDataChild name="a" _parent="missing"/></Materials>')), /Missing XML parent/);
  assert.throws(() => materialReferences(fixture('<Materials><CellDataChild name="a" _parent="b"/><CellDataChild name="b" _parent="a"/></Materials>')), /Circular/);
  const mismatched = fixture('<Materials><CellData name="a"/></Materials>');
  mismatched.materialNative.push({id:'new_material'});
  assert.throws(() => materialReferences(mismatched), /IDs differ/);
});

test('details ignore late responses, search all source fields, and put the wiki link in the reference', async t => {
  installDom(t);
  const pending = new Map();
  const details = createMaterialDetails(data.materials, {tags:data.tags,load:id => new Promise(resolve => pending.set(id,resolve))});
  document.body.append(details.element);
  try {
    const water = data.materials.find(material => material.id === 'water'), acid = data.materials.find(material => material.id === 'acid');
    const old = details.setMaterial(water), current = details.setMaterial(acid);
    pending.get('acid')(records.find(record => record.id === 'acid')); await current;
    pending.get('water')(records.find(record => record.id === 'water')); await old;
    assert.match(details.element.querySelector('h2').textContent, /Acid/);
    const wiki = details.element.querySelector('a[target="_blank"]');
    assert.equal(wiki.textContent.trim(), 'Open on the Wiki'); assert.ok(wiki.querySelector('.bi-box-arrow-up-right'));
    assert.equal(wiki.className,'icon-link icon-link-hover');
    assert.ok(wiki.lastElementChild.classList.contains('bi-box-arrow-up-right'));
    assert.equal(wiki.href, `https://noita.wiki.gg/wiki/${encodeURIComponent(acid.wikipage)}`);
    const search = details.element.querySelector('input'); search.value = 'ParticleEffect'; search.dispatchEvent(new Event('input', {bubbles:true}));
    const rows = [...details.element.querySelectorAll('tbody tr')];
    assert.ok(rows.length); assert.ok(rows.every(row => row.textContent.includes('ParticleEffect')));
    assert.deepEqual([...details.element.querySelectorAll('thead th')].map(th=>th.textContent),['Property','Key','Value']);
    const velocity=rows.find(row=>row.cells[1].textContent==='ParticleEffect["vel_random.min_y"]');
    assert.ok(velocity);
    assert.equal(velocity.cells[0].textContent,'Vel random.min y');
    assert.equal(velocity.cells[0].querySelector('br'),null);
    assert.ok(velocity.cells[2].firstElementChild.classList.contains('text-end'));
    assert.equal(velocity.cells[2].querySelector('code').textContent,'"-17.18"');
    assert.equal(details.element.querySelector('select'),null);
    search.value='tags';search.dispatchEvent(new Event('input',{bubbles:true}));
    const tagLinks=[...details.element.querySelectorAll('tbody a[href*="Category:Materials_tagged_with_"]')];
    assert.ok(tagLinks.length);
    for (const link of tagLinks) assert.equal(link.href,data.tags.find(tag=>`[${tag.tag}]`===link.textContent.trim()).url);
    search.value='';search.dispatchEvent(new Event('input',{bubbles:true}));
    const idRow=[...details.element.querySelectorAll('tbody tr')].find(row=>row.cells[1].textContent==='id');
    assert.ok(idRow.cells[2].firstElementChild.classList.contains('text-end'));
    assert.equal(details.element.querySelector('tbody td:nth-child(3) .text-start'),null);
    assert.equal(details.element.querySelector('a[href="/materials?material=acid"]'),null,'the selected ID must not link to itself');
    assert.doesNotMatch(details.element.textContent, /\d+ of \d+ rows/);
    const link = materialCell(acid).querySelector('a'); assert.equal(link.getAttribute('href'), '/materials?material=acid');
    await details.setMaterial(null);
    assert.equal(details.element.querySelectorAll('tbody tr').length,0); assert.equal(wiki.hidden,true);
  } finally {details.dispose();}
});

test('the material page opens the complete reference, reads its per-material export, and resets without changing data', async t => {
  const window = installDom(t, 'https://example.test/materials?material=water');
  window.matchMedia = () => ({matches:false,addEventListener(){},removeEventListener(){}});
  const originalFetch = globalThis.fetch, originalObserver = globalThis.ResizeObserver;
  const requests = [];
  globalThis.ResizeObserver = class {observe(){} disconnect(){}};
  globalThis.fetch = async path => {
    requests.push(path);
    return {ok:true,json:async()=>JSON.parse(readFileSync(new URL('../public'+path,import.meta.url)))};
  };
  let dispose;
  try {
    const {mount} = await import('../src/pages/materials.js');
    const host = document.getElementById('main');
    dispose = await mount(host);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(host.querySelector('.material-main-view.active').id, 'materials-overview');
    assert.ok(host.querySelector('.material-summary'));
    assert.equal(host.querySelector('.materials-page').style.height,'auto','the mobile overview must scroll with the page');
    host.querySelector('#materials-reference-tab').click();
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(host.querySelector('.material-main-view.active').id, 'materials-reference');
    assert.notEqual(host.querySelector('.materials-page').style.height,'auto','the full reference keeps its bounded viewport');
    assert.ok(host.querySelector('.materials-page > h1'));
    assert.ok(host.querySelector('.material-picker .choices'));
    assert.equal(host.querySelector('.nav-pills'),null);
    assert.equal(host.querySelector('a[href="#property-durability"]'),null);
    assert.ok(requests.some(path=>/\/material-water-[a-f0-9]+\.json$/.test(path)));
    assert.equal(requests.filter(path=>/\/material-water-[a-f0-9]+\.json$/.test(path)).length,1,'the card and reference share one cached request');
    assert.ok(!requests.some(path=>/\/material-acid-/.test(path)), 'unselected references must not be downloaded');
    const reference = host.querySelector('.material-reference');
    const search = reference.querySelector('input');search.value='wang_color';search.dispatchEvent(new Event('input',{bubbles:true}));
    const rows=[...reference.querySelectorAll('tbody tr')];
    assert.equal(rows.length,1);assert.match(rows[0].textContent,/902F554C/);
    host.querySelector('.action-control button').click();
    assert.equal(reference.querySelectorAll('tbody tr').length,0);
    assert.equal(new URL(window.location.href).searchParams.has('material'),false);
    assert.match(reference.textContent,/Select a material to view all of its properties/);
    const shareButton = [...host.querySelectorAll('.materials-toolbar button')].find(button=>button.textContent.trim()==='Share');
    assert.equal(shareButton.disabled,true);
    assert.equal(shareButton.parentElement.getAttribute('aria-description'),'Select a material to share its properties.');
    dispose();dispose=null;
    const copied=[];
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>copied.push(text)}});
    dispose=await mount(host);
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(new URL(window.location.href).searchParams.get('material'),'magic_liquid_protection_all');
    assert.match(host.querySelector('.material-picker .choices__list--single').textContent,/Ambrosia/);
    const share=[...host.querySelectorAll('.materials-toolbar button')].find(button=>button.textContent.trim()==='Share');
    assert.equal(share.disabled,false);share.click();
    await new Promise(resolve=>setImmediate(resolve));
    assert.deepEqual(copied,['https://example.test/materials?material=magic_liquid_protection_all']);
    assert.equal(host.querySelector('.material-reference a[href="/materials?material=magic_liquid_protection_all"]'),null);
    const ambrosia=data.materials.find(material=>material.id==='magic_liquid_protection_all');
    assert.equal(materialCell(ambrosia).querySelector('a'),null,'the plot table must not link to the same material page either');
  } finally {
    dispose?.();globalThis.fetch=originalFetch;
    if(originalObserver===undefined)delete globalThis.ResizeObserver;else globalThis.ResizeObserver=originalObserver;
  }
});
