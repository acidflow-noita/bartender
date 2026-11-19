import {html} from 'htl';
import Choices from 'choices.js';
import {pageHeading} from '../ui/heading.js';
import * as Controls from '../ui/controls.js';
import {sortRows, table} from '../ui/table.js';
import {loadDatasets} from '../ui/data.js';
import {materialCell, IMAGE_BASE} from '../ui/material.js';
import {icon} from '../ui/icons.js';
import {createReactionFinder} from '../reactions/model.js';
import {createResetButton} from '../components/resetButton.js';
import {createShareButton} from '../components/shareButton.js';
import {getUnusedMaterialIds} from '../components/materialAvailability.js';
import {readReactionState, defaultPreview, reactionUrl} from '../components/reactionUrl.js';
import {reactionIntroduction, applyReactionExample} from '../reactions/introduction.js';
import {createChoicesTemplates} from '../components/choicesTemplates.js';
import {recipeCells} from '../reactions/experiment.js';
import {createReactionPreview} from '../reactions/preview.js';
import '../styles/liquids.css';
import '../styles/reactions.css';

export async function mount(host) {
  const [materials, simulation, availability] = await loadDatasets(['reactionMaterials', 'liquidSimulation', 'availability']);
  const {reactions, recipeIds} = simulation;
  const byId = new Map(materials.map(material => [material.id, material]));
  const names = new Set(), ambiguous = new Set();
  for (const material of materials) {
    if (names.has(material.name)) ambiguous.add(material.name);
    names.add(material.name);
  }
  const name = id => byId.get(id)?.name ?? id;
  const numbers = new Map(reactions.map((rule, i) => [rule, recipeIds[i]]));
  const byNumber = new Map(reactions.map((rule, i) => [recipeIds[i], rule]));
  const unusedIds = getUnusedMaterialIds(availability);
  const defaults = {selectedReagents: [], selectedProduct: '', selectedReaction: null, excludeSpecialMaterials: true, onlyPracticalReactions: true, excludeUnusedMaterials: true};
  const state = {...defaults};
  const readAddress = () => Object.assign(state, readReactionState(location.href, byNumber, unusedIds));
  readAddress();
  const finder = createReactionFinder(materials, reactions, unusedIds, state);
  const introduction = reactionIntroduction(materials, reactions.length);
  const reagentSelect = html`<select id="reagent-search" multiple aria-label="Ingredients"></select>`;
  const productSelect = html`<select id="product-search" multiple aria-label="Product"></select>`;
  const special = Controls.toggle({label: 'Exclude Mimicium, Alchemic Precursor and Draught of Midas', value: state.excludeSpecialMaterials});
  const practical = Controls.toggle({label: 'Only practical reactions (speed higher than 5)', value: state.onlyPracticalReactions});
  const unused = Controls.toggle({label: 'Exclude unused materials', value: state.excludeUnusedMaterials});
  const count = html`<span class="small fg-3" role="status"></span>`;
  const share = createShareButton(() => reactionUrl(location.href, {...state, selectedReaction: numbers.get(selected)}), Controls);
  const reset = createResetButton(Controls, () => {Object.assign(state, defaults); selected = null; update();});
  const writeUrl = () => {
    const filtered = state.selectedReagents.length || state.selectedProduct || !state.onlyPracticalReactions || !state.excludeSpecialMaterials || !state.excludeUnusedMaterials;
    const id = state.selectedReaction ?? (filtered ? numbers.get(selected) : null);
    document.title = id && selected
      ? ['input', 'output'].map(side => recipeCells(selected, side).map(name).join(' + ')).join(' produces ') + ' - Noita Bartender'
      : 'Reactions Finder - Noita Bartender';
    history.replaceState(history.state, '', reactionUrl(location.href, {...state, selectedReaction: id})); share.clear();
  };
  const preview = createReactionPreview(simulation.materials, byId, rule => simulation.recipeSeeds[numbers.get(rule)] ?? 1);
  const wide = matchMedia('(min-width: 800px)');
  const examples = html`<details class="reaction-examples" open=${wide.matches}><summary>Recipe examples</summary>${introduction}</details>`;
  const filters = html`<details class="reaction-options" open=${wide.matches}><summary>Filter options</summary>
    <div class="d-flex flex-wrap align-items-center row-gap-2 column-gap-5">${special}${practical}${unused}</div></details>`;
  const layout = () => {examples.open = wide.matches; filters.open = wide.matches;};
  wide.addEventListener('change', layout);
  let descending = true, selected = null, matches = [];
  const indicator = html`<span class="table-sort-indicator" aria-hidden="true"></span>`;
  const speed = html`<button type="button" class="btn-text btn-sm">Speed${indicator}</button>`;
  const slots = (row, side) => html`<ul class="reaction-slots list-unstyled m-0">${recipeCells(row, side).map(id => {
    const material = byId.get(id);
    return html`<li data-ambiguous=${ambiguous.has(material?.name) ? '' : null} title=${id}>${materialCell(material, id, {linkIdOnly: true})}</li>`;
  })}</ul>`;
  const radio = row => html`<input type="radio" class="radio" name="preview-reaction" aria-controls="reaction-preview" value=${numbers.get(row)} checked=${row === selected}
    aria-label=${'Preview ' + recipeCells(row, 'input').map(name).join(' + ') + ' yielding ' + recipeCells(row, 'output').map(name).join(' + ')}>`;
  const results = table([], {columns: ['pick', 'inputs', 'outputs', 'reaction_rate'], compact: true, rows: 5, fitViewport: true, viewportGap: 0, height: 'clamp(17rem, 56dvh, 42rem)',
    sortable: false, width: {pick: '2.25rem', reaction_rate: '4.75rem'}, header: {
      pick: html`<span class="visually-hidden">Preview</span>`, inputs: 'Ingredients', outputs: 'Products', reaction_rate: speed},
    format: {pick: (_, i, row) => radio(row), inputs: (_, i, row) => slots(row, 'input'), outputs: (_, i, row) => slots(row, 'output')},
    align: {reaction_rate: 'right'}, caption: 'Material reactions'});
  const noResults = html`<p class="p-4 mb-0 fg-3" hidden>No reactions match these filters.</p>`;
  host.replaceChildren(html`<div class="reactions-page">${pageHeading('Reactions Finder', {compact: true})}
    ${examples}
    <section class="card mb-4" aria-label="Reaction filters"><div class="card-body p-4 gap-3">
      <div class="reaction-filters">
        <div class="form-field"><label class="form-label" for="reagent-search">Ingredients (max 3)</label>${reagentSelect}</div>
        <div class="reaction-product-group">
          <div class="form-field"><label class="form-label" for="product-search">Product</label>${productSelect}</div>
          <div class="reaction-filter-actions d-flex gap-2">${reset}${share.button}</div>
        </div>
      </div>
      ${filters}${share.feedback}
    </div></section>
    <div class="reaction-workspace"><section class="card reaction-results" aria-label="Matching reactions">
      <div class="card-header px-4 py-3 d-flex flex-row align-items-baseline gap-3"><h2 class="h5 mb-0">Reactions</h2>${count}</div>
      ${results}${noResults}</section>${preview.element}</div>
  </div>`);
  const templates = createChoicesTemplates(Choices, {getItem: id => byId.get(id), getImageUrl: id => `${IMAGE_BASE}/materials/Material_${id}.png`});
  const common = {allowHTML: false, removeItemButton: true, searchEnabled: true, itemSelectText: '',
    callbackOnCreateTemplates: templates, shouldSort: false, searchResultLimit: 100, renderChoiceLimit: 100};
  const reagents = new Choices(reagentSelect, {...common, maxItemCount: 3, placeholderValue: 'Search ingredients'});
  const products = new Choices(productSelect, {...common, maxItemCount: 1, placeholderValue: 'Search products'});
  let updating = false;
  const select = row => {selected = row; preview.select(row);};
  results.addEventListener('change', event => {
    if (event.target.name !== 'preview-reaction') return;
    state.selectedReaction = Number(event.target.value);
    select(byNumber.get(state.selectedReaction)); writeUrl();
  });
  results.addEventListener('click', event => {
    if (event.target.closest('a, button, input') || window.getSelection()?.toString()) return;
    event.target.closest('tbody tr')?.querySelector('input[type=radio]')?.click();
  });
  function renderMatches() {
    const ordered = descending ? matches : sortRows(matches, 'reaction_rate');
    const requested = byNumber.get(state.selectedReaction);
    const anchor = requested && ordered.includes(requested) ? requested : null;
    if (!anchor) state.selectedReaction = null;
    select(anchor ?? defaultPreview(ordered));
    speed.closest('th').setAttribute('aria-sort', descending ? 'descending' : 'ascending');
    indicator.replaceChildren(icon(descending ? 'arrow-down' : 'arrow-up'));
    results.setData(ordered, anchor);
  }
  speed.addEventListener('click', () => {descending = !descending; renderMatches(); writeUrl();});
  function update() {
    updating = true;
    try {
      finder.clearUnusedSelections();
      const availableReagents = finder.getAvailableReagents(state.selectedReagents, state.selectedProduct);
      const availableProducts = finder.getAvailableProducts(state.selectedReagents);
      reagents.clearStore(); reagents.setChoices(availableReagents, 'value', 'label', true);
      products.clearStore(); products.setChoices(availableProducts, 'value', 'label', true);
      reagents.setChoiceByValue(state.selectedReagents.filter(id => availableReagents.some(item => item.value === id)));
      if (availableProducts.some(item => item.value === state.selectedProduct)) products.setChoiceByValue(state.selectedProduct);
      special.value = state.excludeSpecialMaterials; practical.value = state.onlyPracticalReactions; unused.value = state.excludeUnusedMaterials;
      matches = finder.getFilteredReactions(state.selectedReagents, state.selectedProduct);
      renderMatches(); count.textContent = matches.length.toLocaleString() + ' found';
      noResults.hidden = !!matches.length; writeUrl();
    } finally {updating = false;}
  }
  reagentSelect.addEventListener('change', () => {if (!updating) {state.selectedReagents = reagents.getValue(true); update();}});
  productSelect.addEventListener('change', () => {if (!updating) {state.selectedProduct = products.getValue(true)[0] || ''; update();}});
  special.addEventListener('input', () => {
    state.excludeSpecialMaterials = special.value;
    if (special.value) {
      state.selectedReagents = state.selectedReagents.filter(id => !finder.specialMaterials.has(id));
      if (finder.specialMaterials.has(state.selectedProduct)) state.selectedProduct = '';
    }
    update();
  });
  practical.addEventListener('input', () => {state.onlyPracticalReactions = practical.value; update();});
  unused.addEventListener('input', () => {state.excludeUnusedMaterials = unused.value; update();});
  const restore = () => {readAddress(); selected = null; update();};
  const example = event => {
    const link = event.target.closest('[data-example-material]');
    if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    applyReactionExample(state, finder, link.dataset.exampleMaterial, link.dataset.exampleField);
    update();
  };
  introduction.addEventListener('click', example);
  window.addEventListener('popstate', restore); update();
  return () => {share.dispose(); preview.dispose(); reagents.destroy(); products.destroy(); wide.removeEventListener('change', layout); window.removeEventListener('popstate', restore); results.dispose();};
}
