import {html} from 'htl';
import {icon} from '../ui/icons.js';
import {loadMaterialDetails} from '../ui/data.js';
import {table} from '../ui/table.js';
import {materialTypeClass} from '../components/materialTypeStyles.js';
import {materialTagLink} from '../ui/material.js';
import {numberText} from '../ui/format.js';
import * as Controls from '../ui/controls.js';
import {referenceGroups, filterReferenceRows, propertyText, isMaterialReference, isNumericPropertyValue} from './reference.js';

export function createMaterialDetails(materials, {load = loadMaterialDetails, showWiki = true, tags = []} = {}) {
  const byId = new Map(materials.map(material => [material.id, material]));
  const byTag = new Map(tags.map(tag => [tag.tag, tag]));
  const search = Controls.text({label: 'Search properties', placeholder: 'Name, key, or value'});
  search.querySelector('.form-label').classList.add('visually-hidden');
  const title = html`<h2 class="mb-0">All properties</h2>`;
  const wiki = html`<a class="icon-link icon-link-hover" target="_blank" rel="noopener" hidden>Open on the Wiki${icon('box-arrow-up-right')}</a>`;
  const status = html`<p class="fg-3 mb-0" role="status">Select a material to view all of its properties.</p>`;
  const retry = html`<button type="button" class="btn-outline btn-sm" hidden>Retry</button>`;
  const valueNode = (value, row) => {
    if (typeof value === 'string' && String(row.path[0]).replace(/^@/, '') === 'tags') {
      return html`<span>${value.split(/(\[[^\[\]]+\])/).map(part => /^\[[^\[\]]+\]$/.test(part)
        ? materialTagLink(part, byTag.get(part.slice(1, -1))) : part)}</span>`;
    }
    if (row.property === 'type' && row.source.key === 'catalog') return html`<span class=${materialTypeClass(value)}><code>${value}</code></span>`;
    const material = typeof value === 'string' && isMaterialReference(row) ? byId.get(value) : null;
    if (material) return value === selected?.id ? html`<span class=${materialTypeClass(material.type)}><code>${value}</code></span>`
      : html`<a class=${`local-link ${materialTypeClass(material.type)}`} href=${`/materials?material=${encodeURIComponent(value)}`}><code>${value}</code></a>`;
    const numeric = isNumericPropertyValue(value, row);
    return html`<code class=${`property-value${numeric ? ' text-nowrap' : ''}`}>${numeric ? numberText(value, {quoted: typeof value === 'string'}) : propertyText(value)}</code>`;
  };
  const results = table([], {columns: ['label', 'property', 'value'], header: {label: 'Property', property: 'Key', value: 'Value'},
    align: {value: 'right'}, sortable: false, compact: true, rows: 15, height: '100%', caption: 'All material properties',
    format: {
      property: value => html`<code class="fg-3">${value}</code>`,
      value: (value, _index, row) => {
        const alternatives = row.definitions.filter(definition => propertyText(definition.value) !== propertyText(value));
        return html`<div class="text-end">${valueNode(value, row)}${alternatives.length ? html`<details class="mt-2" open=${!!search.value.trim()}><summary class="small fg-3">Other definitions</summary>
          <dl class="mb-0">${alternatives.map(definition => html.fragment`<dt class="small fg-3">${definition.source.file} · ${definition.property}</dt><dd>${valueNode(definition.value, definition)}</dd>`)}</dl></details>` : null}</div>`;
      },
    }});
  const content = html`<div class="card-body p-3 gap-3 material-reference-content">
    ${search}${status}${retry}${results}</div>`;
  const element = html`<section class="card material-reference"><div class="card-header d-flex flex-row flex-wrap align-items-center justify-content-between gap-3">${title}${wiki}</div>${content}</section>`;
  let rows = [], selected = null, sequence = 0, disposed = false, wikiAllowed = showWiki;
  results.hidden = true;
  const filter = () => {
    const filtered = rows.filter(row => filterReferenceRows(row.definitions, search.value).length);
    results.setData(filtered);
    if (rows.length) {status.textContent = 'No matching properties.'; status.hidden = filtered.length > 0;}
  };
  const setMaterial = async material => {
    const request = ++sequence;
    selected = material; rows = []; results.setData([]); results.hidden = true; retry.hidden = true;
    title.textContent = material ? `${material.name} — all properties` : 'All properties';
    wiki.hidden = !wikiAllowed || !material?.wikipage;
    if (material?.wikipage) wiki.href = `https://noita.wiki.gg/wiki/${encodeURIComponent(material.wikipage)}`;
    else wiki.removeAttribute('href');
    status.hidden = false;
    status.textContent = material ? 'Loading properties…' : 'Select a material to view all of its properties.';
    if (!material) return;
    try {
      const record = await load(material.id);
      if (disposed || request !== sequence) return;
      if (record.id !== material.id) throw new Error('The material record does not match the selection.');
      rows = referenceGroups(record); results.hidden = false; filter();
    } catch (error) {
      if (disposed || request !== sequence) return;
      status.textContent = `Could not load properties: ${error.message}`; retry.hidden = false;
    }
  };
  const reload = () => setMaterial(selected);
  search.addEventListener('input', filter); retry.addEventListener('click', reload);
  return {element, setMaterial, setWikiVisible(visible) {wikiAllowed = visible;wiki.hidden = !visible || !selected?.wikipage;}, resetFilters() {search.value = ''; filter();},
    dispose() {disposed = true; sequence++; search.removeEventListener('input', filter); retry.removeEventListener('click', reload); results.dispose();}};
}
