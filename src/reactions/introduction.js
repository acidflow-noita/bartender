import {html} from 'htl';
import {materialTypeClass} from '../components/materialTypeStyles.js';

export function reactionIntroduction(materials, reactionCount) {
  const byId = new Map(materials.map(material => [material.id, material]));
  const link = (id, label, field = 'reagent') => html`<a class=${`local-link ${materialTypeClass(byId.get(id)?.type)}`}
    href=${`/reactions?${field === 'product' ? 'product' : 'reagents'}=${id}`} data-example-material=${id} data-example-field=${field}><code>${label}</code></a>`;
  return html`<p class="reaction-introduction mb-3">Ever wanted to make ${link('magic_liquid_protection_all', 'Ambrosia', 'product')}? Is ${link('material_confusion', 'Flummoxium')} even useful? Mixing ${link('meat_frog', 'frog meat')} and ${link('alcohol', 'whiskey')} does something!? Noita has ${reactionCount} fixed material reactions, and two secret reactions for each seed. When you select the first ingredient the list autoupdates, showing only materials that can react with the selected.</p>`;
}

export function applyReactionExample(state, finder, id, field) {
  if (field === 'product') {
    state.selectedReagents = [];
    state.selectedProduct = id;
  } else {
    state.selectedProduct = '';
    const current = state.selectedReagents;
    const compatible = finder.getAvailableReagents(current, '').some(choice => choice.value === id);
    state.selectedReagents = compatible && (current.includes(id) || current.length < 3)
      ? [...new Set([...current, id])] : [id];
  }
}
