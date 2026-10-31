import * as Plot from '@observablehq/plot';
import {themedPlot} from '../ui/plot.js';
import {materialTypeColors} from '../components/materialTypeStyles.js';
import {propertyPlotRows, packPropertyPoints} from './material-properties.js';
import {formatNumber} from '../ui/format.js';

export function propertyPlot(materials, property, width, maximum, selected, height = 380) {
  const rows = propertyPlotRows(materials, property.key, selected);
  const color = {domain: materialTypeColors.map(d => d.type), range: materialTypeColors.map(d => d.color)};
  const opacity = d => selected ? (d.id === selected.id ? 1 : .18) : d[property.key] <= maximum ? 1 : .18;
  const title = d => `${d.name}\n${d.id}\n${property.title}: ${formatNumber(d[property.key])}${property.key === 'hardness' ? `\nDurability: ${formatNumber(d.durability)}` : ''}`;
  const callout = d => `${d.name}\n${property.title}: ${formatNumber(d[property.key])}`;
  const selectedRows = rows.filter(d => d.id === selected?.id);
  const guide = {stroke: 'var(--slate-300)', strokeOpacity: .7, strokeDasharray: '4,3', clip: 'frame'};
  const highlight = (points, x, y, row, radius) => !points.length ? [] : [
    Plot.ruleY(points, {...guide, y}),
    ...(property.key === 'hardness' ? [Plot.ruleX(points, {...guide, x})] : []),
    Plot.dot(points, {x, y, r: Math.max(7, radius + 3), fill: 'var(--bg-body)', stroke: 'var(--slate-200)', strokeWidth: 2, clip: 'frame', ariaDescription: 'Selected material outline'}),
    Plot.dot(points, {x, y, r: Math.max(4, radius), fill: d => row(d).type, clip: 'frame', ariaDescription: 'Selected material', ariaLabel: d => callout(row(d))}),
    Plot.tip(points, {x, y, title: d => callout(row(d)), lineWidth: Math.max(12, (width - 90) / 7),
      textPadding: 6, pointerSize: 8, fontSize: 12, fill: 'var(--bg-2)', stroke: 'var(--slate-400)', ariaDescription: 'Selected material value'}),
  ];
  const missing = selected && !selectedRows.length ? [Plot.text([
    property.key === 'density' && selected.type !== 'Liquid' ? 'Density chart shows liquids' : 'No source value for this plot',
  ], {frameAnchor: 'middle', lineWidth: Math.max(12, (width - 90) / 7), fill: 'var(--fg-body)'})] : [];
  if (property.key === 'hardness') return themedPlot({width, height, marginLeft: 64, marginRight: 16, marginTop: 18, marginBottom: 44,
    x: {label: 'Durability', grid: true, inset: 10}, y: {label: 'Hardness', type: 'pow', exponent: .25, grid: true, inset: 10}, color,
    marks: [Plot.dot(rows, {x: 'durability', y: 'hardness', fill: 'type', r: 4, opacity, title, tip: true, clip: 'frame'}), Plot.frame(),
      ...highlight(selectedRows, 'durability', 'hardness', d => d, 4), ...missing]});
  const inset = selectedRows.length ? 10 : 0;
  const packed = packPropertyPoints(rows, property, width, height, inset);
  return themedPlot({width, height, marginLeft: packed.left, marginRight: 16, marginTop: packed.top, marginBottom: 44,
    x: {axis: null, domain: [packed.left, packed.right]},
    y: {label: property.title, type: 'pow', exponent: property.exponent, domain: packed.domain, nice: false,
      range: property.reverse ? [packed.top + packed.radius + inset, packed.bottom - packed.radius - inset]
        : [packed.bottom - packed.radius - inset, packed.top + packed.radius + inset], grid: true}, color,
    marks: [Plot.dot(packed.points, {x: 'x', y: d => d.row[property.key], fill: d => d.row.type,
      r: packed.radius, opacity: d => opacity(d.row), title: d => title(d.row), tip: true, clip: 'frame'}), Plot.frame(),
      ...highlight(packed.points.filter(d => d.row.id === selected?.id), 'x', d => d.row[property.key], d => d.row, packed.radius), ...missing]});
}
