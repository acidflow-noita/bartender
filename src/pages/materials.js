import {pageHeading} from '../ui/heading.js';
import {html} from 'htl';
import Tab from 'bootstrap/js/dist/tab.js';
import * as Controls from '../ui/controls.js';
import {table} from '../ui/table.js';
import {loadDatasets} from '../ui/data.js';
import {numberText} from '../ui/format.js';
import {materialCell} from '../ui/material.js';
import {createDiggingSelect} from '../digging/select.js';
import {createResetButton} from '../components/resetButton.js';
import {createShareButton} from '../components/shareButton.js';
import {properties, propertyRows} from './material-properties.js';
import {createMaterialDetails} from '../materials/details.js';
import {createMaterialSummary} from '../materials/summary.js';
import {initialMaterial, materialUrl} from '../materials/url.js';
import {setControlDisabled} from '../ui/disabled.js';

export async function mount(host) {
  const [materials, tags] = await loadDatasets(['materials', 'tags']);
  const picker = createDiggingSelect(materials, {label: 'Material', kind: 'materials', placeholder: 'Find a material',
    value: initialMaterial(location.href, materials)});
  picker.element.querySelector('.form-label').classList.add('visually-hidden');
  const share = createShareButton(() => materialUrl(location.href, picker.element.value?.id), Controls);
  const grid = html`<div class="material-properties-grid tab-content"></div>`;
  const views = [], tabs = [];
  const details = createMaterialDetails(materials, {showWiki: false, tags});
  const overview = createMaterialSummary({tags});
  const wide = window.matchMedia('(min-width: 1024px)');
  const initialView = wide.matches ? 'reference' : 'overview';
  let plotRenderer, plotImport, disposed = false;
  const loadPlots = () => plotImport ??= import('./material-plot.js').then(module => {
    plotRenderer = module.propertyPlot;
    if (!disposed) views.forEach(view => view.draw(true));
  });
  const reset = createResetButton(Controls, () => {
    for (const view of views) view.control.value = view.maximum;
    details.resetFilters();
    picker.setValue(null);
  });
  for (const control of [reset, share.button]) control.querySelector('button').classList.add('btn-lg');
  const propertyTabs = properties.map((property, index) => html`<button type="button" class=${`nav-link${index ? '' : ' active'}`}
    id=${`property-tab-${property.key}`} data-bs-toggle="tab" data-bs-target=${`#property-${property.key}`} role="tab">${property.title}</button>`);
  const heading = pageHeading('Material Properties', {beta: true, compact: true});
  heading.classList.replace('mb-3', 'mb-0');
  heading.classList.remove('lg:mb-5');
  const modes = [['overview', 'Overview'], ['reference', 'Properties'], ['plots', 'Plots']].map(([key, label]) => html`<button type="button"
    class=${`nav-link${key === initialView ? ' active' : ''}${key === 'overview' ? ' lg:d-none' : ''}`} id=${`materials-${key}-tab`} data-material-view=${key} data-bs-toggle="tab" data-bs-target=${`#materials-${key}`} role="tab">${label}</button>`);
  modes[0].disabled = wide.matches;
  details.setWikiVisible(!wide.matches);
  const dashboard = html`<div class="materials-page d-flex flex-column gap-3 lg:gap-4" data-material-view=${initialView}>
    ${heading}<div class="row gx-3 row-gap-3 align-items-end materials-toolbar"><div class="material-picker col-12 lg:col-8 xl:col-6">${picker.element}</div><div class="col-auto"><div class="d-flex gap-3">${reset}${share.button}</div></div></div>
    ${share.feedback}
    <div class="nav nav-tabs" role="tablist" aria-label="Material view">${modes}</div>
    <div class="tab-content material-main-content">
      <div class=${`tab-pane material-main-view${initialView === 'overview' ? ' active show' : ''}`} id="materials-overview" role="tabpanel" aria-labelledby="materials-overview-tab">${overview.element}</div>
      <div class=${`tab-pane material-main-view${initialView === 'reference' ? ' active show' : ''}`} id="materials-reference" role="tabpanel" aria-labelledby="materials-reference-tab">${details.element}</div>
      <div class="tab-pane material-main-view" id="materials-plots" role="tabpanel" aria-labelledby="materials-plots-tab">
        <div class="nav nav-tabs property-navigation" role="tablist" aria-label="Material property">${propertyTabs}</div>${grid}
      </div>
    </div>
  </div>`;
  host.replaceChildren(dashboard);
  for (const [index, property] of properties.entries()) {
    const values = propertyRows(materials, property.key).map(row => row[property.key]).filter(Number.isFinite);
    const maximum = Math.max(...values);
    const control = Controls.range([Math.min(...values), maximum], {label: `Maximum ${property.title.toLowerCase()}`, value: maximum, step: property.step});
    control.classList.add('property-limit');
    control.querySelector('.form-label').textContent = 'Max.';
    const plot = html`<div class="plot-host property-plot"></div>`;
    const results = table([], {columns: [property.key, 'material'], header: {[property.key]: property.title, material: 'Material'},
      format: {material: (_value, _index, row) => materialCell(row)}, align: {[property.key]: 'right'},
      sort: property.key, sortBy: {material: 'name'}, reverse: true, rows: 5, height: '100%', compact: true, caption: `${property.title} materials`});
    const count = html`<div class="property-summary small fg-3 text-truncate" role="status"></div>`;
    const description = property.description;
    const switches = ['Plot', 'Table'].map((label, i) => html`<button type="button" class=${`nav-link${i ? '' : ' active'}`}
      data-bs-toggle="tab" data-bs-target=${`#${property.key}-${label.toLowerCase()}`} id=${`${property.key}-${label.toLowerCase()}-tab`} role="tab">${label}</button>`);
    const panel = html`<section id=${`property-${property.key}`} class=${`card material-property-panel tab-pane${index ? '' : ' active show'}`} role="tabpanel" aria-labelledby=${`property-tab-${property.key}`}>
      <div class="card-header d-flex flex-row align-items-center justify-content-between gap-2 p-3">
        <div class="property-heading"><h2 class="mb-0">${property.title}</h2>${count}</div><div class="nav nav-tabs property-view-tabs" role="tablist" aria-label=${`${property.title} view`}>${switches}</div>
      </div>
      <div class="card-body p-3 gap-3"><p class="property-description fg-3 small mb-0">${description}</p>${control}
        <div class="tab-content property-views">
          <div class="tab-pane property-view active show" id=${`${property.key}-plot`} role="tabpanel" aria-labelledby=${`${property.key}-plot-tab`}>${plot}</div>
          <div class="tab-pane property-view" id=${`${property.key}-table`} role="tabpanel" aria-labelledby=${`${property.key}-table-tab`}>${results}</div>
        </div>
      </div>
    </section>`;
    grid.append(panel);
    let lastSize = '';
    const draw = (force = false) => {
      const width = Math.floor(plot.clientWidth), height = Math.floor(plot.clientHeight);
      const size = `${width}x${height}`;
      if (width <= 80 || height <= 64 || (!force && size === lastSize)) return;
      if (!plotRenderer) {loadPlots(); return;}
      lastSize = size;
      plot.replaceChildren(plotRenderer(materials, property, width, control.value, picker.element.value, height));
    };
    const resize = new ResizeObserver(() => draw()); resize.observe(plot);
    const update = () => {
      const selected = picker.element.value;
      let filtered = propertyRows(materials, property.key, control.value);
      if (selected) filtered = filtered.filter(row => row.id === selected.id);
      results.setData(filtered);
      count.replaceChildren(selected ? html.fragment`${selected.name}: ${selected[property.key] == null ? 'No source value' : numberText(selected[property.key])}` : html.fragment`${numberText(filtered.length)} materials`);
      count.title = count.textContent;
      draw(true);
    };
    control.addEventListener('input', update);
    views.push({control, maximum, update, draw, resize, results});
  }
  dashboard.querySelectorAll('[data-bs-toggle="tab"]').forEach(button => tabs.push(Tab.getOrCreateInstance(button)));
  const shown = event => {
    if (event.target.dataset.materialView) dashboard.dataset.materialView = event.target.dataset.materialView;
    fit();
    views.forEach(view => view.draw(true));
  };
  dashboard.addEventListener('shown.bs.tab', shown);
  const updateSelection = () => {
    const selected = picker.element.value;
    history.replaceState(history.state, '', materialUrl(location.href, selected?.id));
    details.setMaterial(selected);
    overview.setMaterial(selected);
    views.forEach(view => view.update());
    setControlDisabled(share.button.querySelector('button'), !selected, 'Select a material to share its properties.');
    share.clear();
  };
  const restore = () => picker.setValue(new URLSearchParams(location.search).get('material'));
  const breakpoint = () => {
    modes[0].disabled = wide.matches;
    details.setWikiVisible(!wide.matches);
    if (wide.matches && dashboard.dataset.materialView === 'overview') Tab.getOrCreateInstance(modes[1]).show();
  };
  wide.addEventListener?.('change', breakpoint);
  const footer = document.querySelector('.site-footer'), header = document.getElementById('site-header');
  const fit = () => {
    if (!wide.matches && dashboard.dataset.materialView === 'overview') {
      dashboard.style.height = 'auto';
      return;
    }
    const height = Math.max(0, Math.floor((window.visualViewport?.height ?? window.innerHeight)
      - dashboard.getBoundingClientRect().top - window.scrollY - (footer?.getBoundingClientRect().height ?? 0)
      - (parseFloat(getComputedStyle(host).paddingBottom) || 0) - 8));
    if (dashboard.style.height !== `${height}px`) dashboard.style.height = `${height}px`;
  };
  const shellResize = new ResizeObserver(fit);
  for (const node of [header, footer]) if (node) shellResize.observe(node);
  window.addEventListener('resize', fit); window.visualViewport?.addEventListener('resize', fit);
  window.addEventListener('popstate', restore); picker.element.addEventListener('input', updateSelection);
  fit(); updateSelection();
  return () => {
    disposed = true; share.dispose(); details.dispose(); overview.dispose();wide.removeEventListener?.('change',breakpoint);
    picker.element.removeEventListener('input', updateSelection); window.removeEventListener('popstate', restore);
    window.removeEventListener('resize', fit); window.visualViewport?.removeEventListener('resize', fit);
    shellResize.disconnect(); dashboard.removeEventListener('shown.bs.tab', shown);
    tabs.forEach(tab => tab.dispose()); picker.dispose();
    views.forEach(view => {view.control.removeEventListener('input', view.update); view.resize.disconnect(); view.results.dispose();});
  };
}
