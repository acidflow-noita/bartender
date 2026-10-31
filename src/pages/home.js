import {themedPlot} from '../ui/plot.js';
import * as Plot from '@observablehq/plot';
import {loadData} from '../ui/data.js';
import {observeWidth} from '../ui/resize.js';
import {materialTypeColors} from '../components/materialTypeStyles.js';

export function materialTypesPlot(summary, width) {
  const key = type => !type || type === 'no type' ? 'N/A' : type;
  const palette = new Map(materialTypeColors.map((entry, index) => [entry.type, {...entry, index}]));
  const types = [...summary.types].sort((a, b) => (palette.get(key(a.type))?.index ?? Infinity) - (palette.get(key(b.type))?.index ?? Infinity));
  const label = row => `${key(row.type) === 'N/A' ? 'No type' : row.type}: ${row.count} (${(row.count / summary.materialCount * 100).toFixed(1)}%)`;
  const domain = types.map(row => row.type);
  const plot = themedPlot({width, height: 40, margin: 0,
    x: {axis: null, domain: [0, summary.materialCount], nice: false}, y: {axis: null},
    color: {domain, range: types.map(row => (palette.get(key(row.type)) ?? palette.get('N/A')).color), legend: true,
      swatchSize: 12, tickFormat: type => label(types.find(row => row.type === type)),
      style: {fontFamily: 'var(--body-font-family)', fontSize: 'var(--font-size-sm)', color: 'var(--fg-body)'}},
    marks: [Plot.barX(types, {x: 'count', fill: 'type', order: domain, tip: true,
      title: row => `${label(row)}\n${row.count} out of ${summary.materialCount} materials`, ariaLabel: label})],
  });
  plot.classList.add('m-0');
  return plot;
}

export async function mount(host) {
  const initial = host.querySelector('[data-home-summary]');
  const summary = initial ? JSON.parse(initial.textContent) : await loadData('homeSummary');
  if (!host.querySelector('.home-page')) {
    const {createHomeView} = await import('./home-view.js');
    host.replaceChildren(createHomeView(summary));
  }
  const plot = host.querySelector('[data-material-types-plot]');
  const resize = observeWidth(plot, width => plot.replaceChildren(materialTypesPlot(summary, width)));
  return () => resize.dispose();
}
