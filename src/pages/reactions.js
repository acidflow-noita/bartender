import {pageHeading} from '../ui/heading.js';
import {html} from 'htl';
import Choices from 'choices.js';
import * as Controls from '../ui/controls.js';
import {table} from '../ui/table.js';
import {loadDatasets} from '../ui/data.js';
import {materialCell, IMAGE_BASE} from '../ui/material.js';
import {createReactionFinder} from '../reactions/model.js';
import {createChoicesTemplates} from '../components/choicesTemplates.js';
import {createResetButton} from '../components/resetButton.js';
import {createShareButton} from '../components/shareButton.js';
import {getUnusedMaterialIds} from '../components/materialAvailability.js';
import {readReactionReagents, reactionUrl} from '../components/reactionUrl.js';
import {reactionIntroduction, applyReactionExample} from '../reactions/introduction.js';
import {numberText} from '../ui/format.js';

export async function mount(host) {
  const [materials, reactions, availability] = await loadDatasets(['reactionMaterials', 'reactions', 'availability']);
  const materialsMap = new Map(materials.map(material => [material.id, material]));
  const defaults = {selectedReagents: [], selectedProduct: '', excludeSpecialMaterials: true, onlyPracticalReactions: true, excludeUnusedMaterials: true};
  const state = {...defaults};
  const readAddress = () => {
    const params = new URLSearchParams(location.search);
    Object.assign(state, {selectedReagents: readReactionReagents(location.href), selectedProduct: params.get('product') || '',
      excludeSpecialMaterials: params.get('excludeSpecial') !== 'false', onlyPracticalReactions: params.get('onlyPractical') !== 'false',
      excludeUnusedMaterials: params.get('excludeUnused') !== 'false'});
  };
  readAddress();
  const finder = createReactionFinder(materials, reactions, getUnusedMaterialIds(availability), state);
  const introduction = reactionIntroduction(materials, reactions.length);
  finder.clearUnusedSelections();
  const reagentSelect = html`<select id="reagent-search" multiple aria-label="Ingredients"></select>`;
  const productSelect = html`<select id="product-search" multiple aria-label="Product"></select>`;
  const special = Controls.toggle({label: 'Exclude Mimicium, Alchemic Precursor and Draught of Midas', value: state.excludeSpecialMaterials});
  const practical = Controls.toggle({label: 'Only practical reactions (speed higher than 5)', value: state.onlyPracticalReactions});
  const unused = Controls.toggle({label: 'Exclude unused materials', value: state.excludeUnusedMaterials});
  const count = html`<span class="fg-3" role="status"></span>`;
  const share = createShareButton(() => reactionUrl(location.href, state), Controls);
  const reset = createResetButton(Controls, () => {Object.assign(state, {...defaults, selectedReagents: []}); update();});
  const columns = ['reaction_rate', 'input_cell1', 'input_cell2', 'input_cell3', 'output_cell1', 'output_cell2', 'output_cell3'];
  const results = table([], {columns, sort: 'reaction_rate', reverse: true, rows: 5, compact: true, fitViewport: true, viewportGap: 0, width: {reaction_rate: 80}, minWidth: '64rem',
    header: {reaction_rate: 'Speed', input_cell1: html`<span>1<sup>st</sup> ingredient</span>`, input_cell2: html`<span>2<sup>nd</sup> ingredient</span>`, input_cell3: html`<span>3<sup>rd</sup> ingredient</span>`,
      output_cell1: html`<span>1<sup>st</sup> product</span>`, output_cell2: html`<span>2<sup>nd</sup> product</span>`, output_cell3: html`<span>3<sup>rd</sup> product</span>`},
    format: Object.fromEntries(columns.slice(1).map(key => [key, id => materialCell(materialsMap.get(id), id)])),
    align: {reaction_rate: 'right'}, caption: 'Material reactions'});
  results.overflowHint.classList.remove('px-4', 'py-2');
  host.replaceChildren(html`<div class="reactions-page">${pageHeading("Reactions Finder", {compact: true})}
    ${introduction}
    <section class="card mb-3 lg:mb-4" aria-label="Reaction filters"><div class="card-body p-3 gap-3">
      <div><div class="row g-3"><div class="col-12 lg:col-7 form-field"><label class="form-label" for="reagent-search">Ingredients (max 3)</label>${reagentSelect}</div>
        <div class="col-12 lg:col-5 form-field"><label class="form-label" for="product-search">Product</label>${productSelect}</div></div></div>
      <div class="d-flex flex-wrap align-items-center gap-3 row-gap-2 column-gap-5">
        ${special}${practical}${unused}
        <div class="d-flex align-items-center gap-3 ms-auto">${reset}${share.button}</div>
      </div>${share.feedback}
    </div></section>
    <section class="card overflow-hidden mb-2"><div class="card-header flex-row flex-wrap align-items-center justify-content-between gap-2 py-2"><h2 class="mb-0 text-nowrap">Reactions: ${count}</h2>${results.overflowHint}</div>${results}</section>
  </div>`);
  const templates = createChoicesTemplates(Choices, {getItem: id => materialsMap.get(id), getImageUrl: id => `${IMAGE_BASE}/materials/Material_${id}.png`});
  const common = {allowHTML: false, removeItemButton: true, searchEnabled: true, itemSelectText: '',
    callbackOnCreateTemplates: templates, shouldSort: false, searchResultLimit: 100, renderChoiceLimit: 100};
  const reagents = new Choices(reagentSelect, {...common, maxItemCount: 3, placeholderValue: 'Search ingredients'});
  const products = new Choices(productSelect, {...common, maxItemCount: 1, placeholderValue: 'Search products'});
  let updating = false;
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
      const rows = finder.getFilteredReactions(state.selectedReagents, state.selectedProduct);
      results.setData(rows); count.replaceChildren(html.fragment`${numberText(rows.length)} found`);
      history.replaceState(history.state, '', reactionUrl(location.href, state)); share.clear();
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
  const restore = () => {readAddress(); update();};
  const example = event => {
    const link = event.target.closest('[data-example-material]');
    if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    applyReactionExample(state, finder, link.dataset.exampleMaterial, link.dataset.exampleField);
    update();
  };
  introduction.addEventListener('click', example);
  window.addEventListener('popstate', restore); update();
  return () => {share.dispose(); window.removeEventListener('popstate', restore); introduction.removeEventListener('click', example); reagents.destroy(); products.destroy(); results.dispose();};
}
