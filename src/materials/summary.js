import {html} from 'htl';
import {icon} from '../ui/icons.js';
import {IMAGE_BASE, materialTagLink} from '../ui/material.js';
import {formatNumber, numberText} from '../ui/format.js';
import {loadMaterialDetails} from '../ui/data.js';
import {materialTypeClass} from '../components/materialTypeStyles.js';
import {choiceLabel, materialDisplayName} from '../components/choicesTemplates.js';
import {reactionUrl} from '../components/reactionUrl.js';
import {diggingUrl, DIGGING_DEFAULTS} from '../digging/url.js';

export function summaryReactionUrl(id, {product = false} = {}, base = globalThis.location?.href ?? 'https://example.test/') {
  const url = new URL(reactionUrl(new URL('/reactions', base).href, {
    selectedReagents: product ? [] : [id], selectedProduct: product ? id : '',
    excludeSpecialMaterials: false, onlyPracticalReactions: false, excludeUnusedMaterials: false,
  }));
  return url.pathname + url.search;
}

const diggingLabels = {digs:'Digs',path:'Digs along path',blocked:'Doesn’t dig',partial:'Damages terrain',
  removes:'Removes cells',displaces:'Displaces material',converts:'Converts material',conditional:'Context-dependent',unsupported:'Not modeled'};
const compactNumber = value => Number.isInteger(value) ? value : Number(value.toPrecision(6));

export function summaryNumber(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return {text: 'Not recorded', exact: null};
  const compact = compactNumber(value);
  return {text: `${compact === value ? '' : '≈ '}${formatNumber(compact)}`, exact: String(value)};
}

export function materialSummaryView(material, record = null, {loading = false, error = false, tags = []} = {}) {
  if (!material) return html`<section class="card material-summary"><div class="card-body"><p class="mb-0 fg-3">Select a material to view its overview.</p></div></section>`;
  const type = materialTypeClass(material.type);
  const byTag = new Map(tags.map(tag => [tag.tag, tag]));
  const displayType = !material.type || ['no type', 'N/A'].includes(material.type) ? 'No type' : material.type;
  const image = html`<img class="material-summary-image" src=${`${IMAGE_BASE}/materials/${material.image_local || `Material_${material.id}.png`}`} width="48" height="48" alt="">`;
  image.addEventListener('error', () => {image.hidden = true;}, {once: true});
  const effects = (key, label) => html.fragment`<dt class="col-6 small fg-3 fw-normal">${label}</dt><dd class="col-6 mb-0 text-end">${loading ? html`<span class="small fg-3">Loading effects…</span>`
    : error ? html`<span class="small fg-3">Effects unavailable</span>`
    : record?.effects?.[key]?.length ? html`<ul class="list-unstyled mb-0">${record.effects[key].map(effect => html`<li title=${effect.description}>${effect.name}</li>`)}</ul>`
    : html`<span class="small fg-3">None listed</span>`}</dd>`;
  const stats = [['density','Density'],['hardness','Hardness'],['durability','Durability'],['gfx_glow','Glow']];
  const traits = [['burnable','Burnable'],['electrical_conductivity','Conductive'],['slippery','Slippery']];
  const related = record?.insights?.reactions;
  const digging = record?.insights?.digging ?? [];
  const insights = record?.insights ? html.fragment`
    <section><h3 class="h6 mb-2">Reactions</h3><dl class="row g-2 mb-0">
      <dt class="col-6 small fg-3 fw-normal">As an ingredient</dt><dd class="col-6 mb-0 text-end"><a class="local-link" href=${summaryReactionUrl(material.id)}>${numberText(related.usedIn)}</a></dd>
      <dt class="col-6 small fg-3 fw-normal">As a product</dt><dd class="col-6 mb-0 text-end"><a class="local-link" href=${summaryReactionUrl(material.id,{product:true})}>${numberText(related.producedBy)}</a></dd>
    </dl><p class="small fg-3 mt-2 mb-0">All fixed reaction entries, including slow and unused-material reactions.</p>
    </section>
    ${digging.length ? html`<section><h3 class="h6 mb-1">Digging checks</h3><p class="small fg-3 mb-2">Estimates for unmodified casts</p><dl class="row g-2 mb-0">${digging.map(check => {
      const url = new URL(diggingUrl(new URL('/digging',globalThis.location?.href ?? 'https://example.test/').href, {...DIGGING_DEFAULTS, spells:[check.id],material:material.id}));
      return html.fragment`<dt class="col-6 small fw-normal"><a class="local-link" href=${url.pathname+url.search}>${check.name}</a></dt><dd class="col-6 mb-0 text-end" title=${check.reason}>${diggingLabels[check.status] ?? check.status}</dd>`;
    })}</dl></section>` : null}` : null;
  const view = html`<article class="card material-summary" aria-label=${`${material.name} overview`}>
    <div class="card-header d-flex flex-row align-items-center gap-3">
      ${image}<div class="material-summary-heading"><h2 class="card-title h6 fw-normal mb-0" title=${`${materialDisplayName(material)} (${material.id})`}>${choiceLabel(materialDisplayName(material),material.id,material.type,{code:true})}</h2></div>
    </div>
    <div class="card-body p-4 gap-4">
      <dl class="row g-2 mb-0"><dt class="col-6 small fg-3 fw-normal">Type</dt><dd class=${`col-6 mb-0 text-end ${type}`}>${displayType}</dd>${stats.map(([key,label]) => {
        const value = summaryNumber(material[key]);
        const display = value.exact === null ? value.text : html.fragment`${value.text.startsWith('≈') ? '≈ ' : ''}${numberText(compactNumber(material[key]))}`;
        return html.fragment`<dt class="col-6 small fg-3 fw-normal">${label}</dt><dd class="col-6 mb-0 text-end" title=${value.exact === null ? null : `Exact value: ${formatNumber(value.exact)}`} data-stat=${key} data-exact-value=${value.exact}>${display}</dd>`;
      })}${traits.map(([key,label]) => html.fragment`<dt class="col-6 small fg-3 fw-normal">${label}</dt><dd class="col-6 mb-0 text-end" data-trait=${key}>${material[key] === true ? 'Yes' : material[key] === false ? 'No' : 'Not recorded'}</dd>`)}</dl>
      <dl class="row g-2 mb-0">${effects('stain','When stained')}${effects('ingestion','When swallowed')}</dl>
      ${insights}
      <div><h3 class="h6 mb-2">Tags</h3><div class="d-flex flex-wrap gap-2">${material.tags?.length
        ? material.tags.map(tag => materialTagLink(tag, byTag.get(tag.slice(1, -1)), {badge: true}))
        : html`<span class="small fg-3">No tags</span>`}</div></div>
    </div>
    ${material.wikipage ? html`<div class="card-footer"><a class="icon-link icon-link-hover" href=${`https://noita.wiki.gg/wiki/${encodeURIComponent(material.wikipage)}`} target="_blank" rel="noopener">Open on the Wiki${icon('box-arrow-up-right')}</a></div>` : null}
  </article>`;
  return view;
}

export function createMaterialSummary({load = loadMaterialDetails, tags = []} = {}) {
  const element = html`<div class="material-summary-host"></div>`;
  let version = 0, disposed = false;
  const setMaterial = async material => {
    const request = ++version;
    element.replaceChildren(materialSummaryView(material, null, {loading: !!material, tags}));
    if (!material) return;
    try {
      const record = await load(material.id);
      if (disposed || request !== version) return;
      if (record.id !== material.id) throw new Error('Mismatched material overview');
      element.replaceChildren(materialSummaryView(material, record, {tags}));
    } catch {
      if (!disposed && request === version) element.replaceChildren(materialSummaryView(material, null, {error: true, tags}));
    }
  };
  return {element,setMaterial,dispose() {disposed = true;version++;}};
}
