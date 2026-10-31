import test from 'node:test';
import assert from 'node:assert/strict';
import {loadSources} from '../scripts/data/sources.mjs';
import {installDom} from './dom.js';
import {propertyPlot} from '../src/pages/material-plot.js';
import {properties} from '../src/pages/material-properties.js';

const {materials} = loadSources();

test('Plot draws the selected source value on its scale with a permanent native callout', t => {
  installDom(t);
  const selected = materials.find(row => row.id === 'water');
  for (const property of properties) {
    const plot = propertyPlot(materials, property, 400, Infinity, selected, 300);
    const marker = plot.querySelector('[aria-description="Selected material"] circle');
    assert.ok(marker, property.title);
    assert.equal(Number(marker.getAttribute('cy')), plot.scale('y').apply(selected[property.key]));
    assert.ok(plot.querySelector('[aria-description="Selected material outline"] circle'));
    assert.ok(plot.querySelector('[aria-description="Selected material value"]'), 'a label must exist without hovering');
    if (property.key === 'hardness') assert.equal(Number(marker.getAttribute('cx')), plot.scale('x').apply(selected.durability));
  }
});

test('non-liquid density has no fabricated position and clears the selected marker', t => {
  installDom(t);
  const property = properties.find(property => property.key === 'density');
  const selected = materials.find(row => row.id === 'rock_static');
  const plot = propertyPlot(materials, property, 400, Infinity, selected, 300);
  assert.equal(plot.querySelector('[aria-description="Selected material"]'), null);
  assert.match(plot.textContent, /Density chart shows liquids/);
  const cleared = propertyPlot(materials, property, 400, Infinity, null, 300);
  assert.equal(cleared.querySelector('[aria-description="Selected material value"]'), null);
});
