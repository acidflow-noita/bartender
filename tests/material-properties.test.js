import test from 'node:test';
import assert from 'node:assert/strict';
import {loadSources} from '../scripts/data/sources.mjs';
import {properties, propertyRows, propertyPlotRows, packPropertyPoints} from '../src/pages/material-properties.js';

const {materials} = loadSources();
test('dashboard preserves original property values, zeroes, missing values and table populations', () => {
  for (const {key} of properties) for (const maximum of [0, 3, 10, 100, Infinity]) {
    const expected = materials.filter(row => row[key] !== null && row[key] <= maximum && (key !== 'density' || row.type === 'Liquid'));
    assert.deepEqual(propertyRows(materials, key, maximum), expected);
  }
  assert.deepEqual(propertyPlotRows(materials, 'hardness'), materials.filter(row => row.hardness !== null && row.durability !== null));
  for (const key of ['durability', 'gfx_glow']) assert.deepEqual(propertyPlotRows(materials, key), materials.filter(row => row[key] !== null && row[key] > 0));
  assert.deepEqual(propertyPlotRows(materials, 'density'), materials.filter(row => row.density !== null && row.density > 0 && row.name && row.image_local && row.type === 'Liquid'));
});

test('every packed mark stays inside the plot at narrow and wide card widths without losing data', () => {
  for (const property of properties.slice(1)) for (const width of [200, 240, 320, 480, 640, 1000, 1800]) {
    const rows = propertyPlotRows(materials, property.key);
    const {points, radius, left, right, top, bottom} = packPropertyPoints(rows, property, width);
    assert.deepEqual(points.map(point => point.row), rows);
    for (const point of points) {
      assert.ok(point.x - radius >= left - 1e-8 && point.x + radius <= right + 1e-8, `${property.key} at ${width}: horizontal bounds`);
      assert.ok(point.y - radius >= top - 1e-8 && point.y + radius <= bottom + 1e-8, `${property.key} at ${width}: vertical bounds`);
    }
    for (let i = 0; i < points.length; i++) for (let j = 0; j < i; j++) {
      assert.ok(Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y) >= radius * 2 - 1e-6);
    }
  }
});

test('selection adds exact zero values without changing the overview or inventing missing values', () => {
  const before = structuredClone(materials);
  for (const property of properties) {
    const overview = propertyPlotRows(materials, property.key);
    for (const selected of materials) {
      const rows = propertyPlotRows(materials, property.key, selected);
      const eligible = Number.isFinite(selected[property.key]) && (property.key !== 'hardness' || Number.isFinite(selected.durability))
        && (property.key !== 'density' || selected.type === 'Liquid');
      assert.deepEqual(rows.filter(row => row !== selected), overview.filter(row => row !== selected));
      assert.equal(rows.includes(selected), eligible || overview.includes(selected));
      for (const row of rows) assert.ok(materials.includes(row), 'highlights must use the original source record');
    }
    assert.deepEqual(propertyPlotRows(materials, property.key), overview);
  }
  assert.deepEqual(materials, before);
});

test('compact plots keep every exact value and leave room for the selection outline', () => {
  const selected = materials.find(row => row.id === 'water');
  for (const property of properties.slice(1)) for (const width of [240, 320, 640]) for (const height of [140, 220, 420]) {
    const rows = propertyPlotRows(materials, property.key, selected);
    const packed = packPropertyPoints(rows, property, width, height, 10);
    assert.deepEqual(packed.points.map(point => point.row), rows);
    const point = packed.points.find(point => point.row === selected);
    const radius = Math.max(7, packed.radius + 3);
    assert.ok(point.x - radius >= packed.left && point.x + radius <= packed.right);
    assert.ok(point.y - radius >= packed.top && point.y + radius <= packed.bottom);
  }
});
