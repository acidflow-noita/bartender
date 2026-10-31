import test from 'node:test';
import assert from 'node:assert/strict';
import {loadSources} from '../scripts/data/sources.mjs';
import {materialReferences} from '../scripts/data/material-reference.mjs';
import {resolveMaterialEffects, parseMaterialEffectNames} from '../scripts/data/material-effects.mjs';
import {materialSummaryView, createMaterialSummary, summaryNumber, summaryReactionUrl} from '../src/materials/summary.js';
import {createReactionFinder} from '../src/reactions/model.js';
import {readReactionReagents} from '../src/components/reactionUrl.js';
import {evaluateComparison} from '../src/digging/comparison.js';
import {SUMMARY_DIGGING_SPELLS} from '../scripts/data/material-insights.mjs';
import {installDom} from './dom.js';

const data = loadSources(), records = materialReferences(data);

test('summary effect names resolve the extracted IDs without treating UI-list positions as enum values', () => {
  const ambrosia = records.find(record => record.id === 'magic_liquid_protection_all');
  assert.equal(data.materialEffectNames[29].symbol, 'INGESTION_DRUNK');
  assert.equal(ambrosia.effects.stain[0].name, 'Protection from all');
  assert.equal(ambrosia.effects.ingestion[0].id, 30);
  assert.equal(ambrosia.effects.ingestion[0].symbol, 'FOOD_POISONING');
  assert.equal(ambrosia.effects.ingestion[0].name, 'Food poisoning');
  for (const record of records) for (const [key,field] of [['stain','stain_effects'],['ingestion','ingestion_effects']]) {
    assert.deepEqual(record.effects[key].map(({id,duration})=>({id,duration})),record.native[field]);
    assert.ok(record.effects[key].every(effect=>effect.symbol && effect.name));
  }
});

test('conflicting effect bindings fail and unknown effects retain their number', () => {
  const record = symbol => ({xml:[{definition:{'@status_effects':symbol}}],native:{stain_effects:[{id:1,duration:1}],ingestion_effects:[]}});
  assert.throws(()=>resolveMaterialEffects([record('WET'),record('OILED')],[]),/Conflicting/);
  const unknown = resolveMaterialEffects([{xml:[],native:{stain_effects:[{id:999,duration:1}],ingestion_effects:[]}}],[])[0];
  assert.equal(unknown.effects.stain[0].name,'Unknown effect (999)');
  assert.equal(unknown.effects.stain[0].symbol,null);
});

test('status translations preserve repeated strength variants and unnamed CSV columns', () => {
  const lua='status_effects = {\n {\n id="TEST",\n ui_name="$status_a",\n ui_description="$desc_a",\n },\n {\n id="TEST",\n ui_name="$status_b",\n min_threshold_normalized=0.5,\n }\n}';
  const rows=parseMaterialEffectNames(lua,',en,,,\nstatus_a,First,,,\ndesc_a,First description,,,\nstatus_b,Second,,,\n');
  assert.deepEqual(rows.map(row=>[row.symbol,row.name,row.threshold]),[['TEST','First',0],['TEST','Second',.5]]);
  assert.equal(rows[0].description,'First description');
});

test('overview figures mark rounding and retain exact values, zeroes and missing values', () => {
  assert.deepEqual(summaryNumber(0),{text:'0',exact:'0'});
  assert.deepEqual(summaryNumber(100000),{text:'100,000',exact:'100000'});
  assert.deepEqual(summaryNumber(5.119999885559082),{text:'≈ 5.12',exact:'5.119999885559082'});
  assert.deepEqual(summaryNumber(null),{text:'Not recorded',exact:null});
});

test('reaction links and digging checks agree with the existing reference tools', () => {
  const state={excludeSpecialMaterials:false,onlyPracticalReactions:false,excludeUnusedMaterials:false};
  const finder=createReactionFinder(data.materials,data.reactions,new Set(),state);
  const spells=SUMMARY_DIGGING_SPELLS.map(id=>data.spells.find(spell=>spell.id===id));
  for (const record of records) {
    assert.equal(record.insights.reactions.usedIn,finder.getFilteredReactions([record.id],'').length,record.id);
    assert.equal(record.insights.reactions.producedBy,finder.getFilteredReactions([],record.id).length,record.id);
    const expected=['Solid','Powder'].includes(record.catalog.type)
      ? evaluateComparison(spells,record.catalog).map(({spell,result})=>({id:spell.id,name:spell.name,status:result.status,reason:result.reason}))
      : [];
    assert.deepEqual(record.insights.digging,expected);
  }
  const link=new URL(summaryReactionUrl('magic_liquid_protection_all'),'https://example.test');
  assert.deepEqual(readReactionReagents(link.href),['magic_liquid_protection_all']);
  assert.equal(link.searchParams.get('onlyPractical'),'false');
  assert.equal(link.searchParams.get('excludeUnused'),'false');
});

test('the material card presents verified facts and leaves the source record unchanged', t => {
  installDom(t);
  const record=records.find(record=>record.id==='magic_liquid_protection_all'), original=structuredClone(record);
  const card=materialSummaryView(record.catalog,record,{tags:data.tags});
  assert.equal(card.querySelector('h2').textContent,'Ambrosia (magic_liquid_protection_all)');
  assert.ok(card.querySelector('h2 .material-name-text'));
  assert.ok(card.querySelector('h2 .material-type-liquid code'));
  assert.equal(card.style.getPropertyValue('--card-border-color'),'');
  assert.match(card.textContent,/Protection from all/);assert.match(card.textContent,/Food poisoning/);
  assert.equal(card.querySelector('[data-trait="burnable"]').textContent,'No');
  assert.equal(card.querySelector('[data-trait="electrical_conductivity"]').textContent,'Yes');
  assert.equal(card.querySelector('[data-stat="durability"]').textContent,'0');
  assert.equal(card.querySelector('[data-stat="density"]').dataset.exactValue,'5.119999885559082');
  assert.equal(card.querySelectorAll('.badge').length,record.catalog.tags.length);
  assert.equal(card.querySelectorAll('a.badge').length,record.catalog.tags.length);
  for (const link of card.querySelectorAll('a.badge')) {
    const tag=link.textContent.trim().slice(1,-1);
    assert.equal(link.href,data.tags.find(entry=>entry.tag===tag).url);
    assert.ok(link.lastElementChild.classList.contains('bi-box-arrow-up-right'));
  }
  assert.ok(card.querySelector('a.icon-link-hover .bi-box-arrow-up-right'));
  assert.ok(card.querySelector('a[href^="/reactions?"]'));
  assert.equal(card.querySelector('a[href^="/digging?"]'),null);
  assert.doesNotMatch(card.textContent,/Digging checks/);
  assert.equal(card.querySelector('a[href^="/materials"]'),null);
  assert.deepEqual(record,original);
  const hardMaterial=data.materials.find(material=>Number.isInteger(material.hardness) && material.hardness>=1000);
  const value=materialSummaryView(hardMaterial).querySelector('[data-stat="hardness"]');
  assert.ok(value.querySelector('.number-group'));
  const range=document.createRange();range.selectNodeContents(value);
  assert.equal(range.toString(),String(hardMaterial.hardness),'card copies must omit visual separators');
  for (const type of ['Solid','Powder','Liquid','Gas','Fire','no type']) {
    const sample=records.find(item=>item.catalog.type===type);
    assert.ok(sample,`Missing ${type} sample`);
    const view=materialSummaryView(sample.catalog,sample);
    assert.equal(view.querySelectorAll('a[href^="/digging?"]').length,['Solid','Powder'].includes(type) ? 4 : 0,type);
    if (!['Solid','Powder'].includes(type)) assert.doesNotMatch(view.textContent,/Digging checks/);
  }
});

test('a late card response cannot replace the newly selected material', async t => {
  installDom(t);const pending=new Map();
  const overview=createMaterialSummary({load:id=>new Promise(resolve=>pending.set(id,resolve))});
  try {
    const water=records.find(record=>record.id==='water'),acid=records.find(record=>record.id==='acid');
    const first=overview.setMaterial(water.catalog),second=overview.setMaterial(acid.catalog);
    pending.get('acid')(acid);await second;pending.get('water')(water);await first;
    assert.equal(overview.element.querySelector('h2').textContent,'Acid (acid)');
    await overview.setMaterial(null);assert.match(overview.element.textContent,/Select a material/);
  } finally {overview.dispose();}
});

test('card naming matches the actual material picker, including physics-object labels', async t => {
  const window=installDom(t);window.matchMedia=()=>({matches:false});
  const {createDiggingSelect}=await import('../src/digging/select.js');
  const materials=[data.materials.find(material=>material.id==='acid'),data.materials.find(material=>material.tags?.includes('[box2d]'))];
  const picker=createDiggingSelect(materials,{label:'Material',kind:'materials',value:materials[0].id});
  try {
    for(const material of materials){
      picker.setValue(material.id);
      const card=materialSummaryView(material);
      assert.equal(card.querySelector('h2').textContent,picker.element.querySelector('.choices__list--single .choices-label').textContent);
    }
  } finally {picker.dispose();}
});
