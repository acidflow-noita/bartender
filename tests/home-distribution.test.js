import test from 'node:test';
import assert from 'node:assert/strict';
import {installDom} from './dom.js';
import {loadSources} from '../scripts/data/sources.mjs';
import {pageDatasets} from '../scripts/data/page-datasets.mjs';
import {materialTypeColors} from '../src/components/materialTypeStyles.js';
import {materialTypesPlot} from '../src/pages/home.js';

const summary = pageDatasets(loadSources()).homeSummary;

test('the single stacked bar preserves every material count, proportion and original color', t => {
  installDom(t);
  const original = structuredClone(summary);
  const colors = new Map(materialTypeColors.map(row=>[row.type,row.color]));
  for (const width of [220, 400, 700]) {
    const chart = materialTypesPlot(summary, width);
    const bars = [...chart.querySelectorAll('[aria-label="bar"] rect')].sort((a,b)=>Number(a.getAttribute('x'))-Number(b.getAttribute('x')));
    assert.equal(bars.length,summary.types.length);
    assert.equal(new Set(bars.map(bar=>bar.getAttribute('y'))).size,1);
    assert.equal(new Set(bars.map(bar=>bar.getAttribute('height'))).size,1);
    let end=0, total=0;
    for (const bar of bars) {
      const title = bar.getAttribute('aria-label');
      const row=summary.types.find(row=>title.startsWith(`${row.type==='no type'?'No type':row.type}:`));
      assert.ok(row,title);
      assert.ok(Math.abs(Number(bar.getAttribute('x'))-end)<1e-6,'segments must form one uninterrupted stack');
      const length=Number(bar.getAttribute('width'));
      assert.ok(Math.abs(length/width-row.count/summary.materialCount)<1e-6,'small groups must not be inflated or lost');
      assert.equal(bar.getAttribute('fill'),colors.get(row.type==='no type'?'N/A':row.type));
      assert.ok(chart.textContent.includes(`${row.count} (${(row.count/summary.materialCount*100).toFixed(1)}%)`));
      end+=length;total+=row.count;
    }
    assert.equal(total,summary.materialCount);assert.ok(Math.abs(end-width)<1e-6);
    assert.equal(chart.querySelector('[aria-label="frame"], image'),null);
    const tip=chart.querySelector('[aria-label="tip"]');
    assert.ok(tip, 'the compact distribution keeps native Plot hover tips');
    assert.equal(tip.ownerSVGElement.style.getPropertyValue('--plot-background'),'var(--bg-2)');
    assert.match(chart.textContent,/No type: 2 \(0\.4%\)/);
  }
  assert.deepEqual(summary,original);
});
