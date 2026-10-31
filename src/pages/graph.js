import {pageHeading} from '../ui/heading.js';
import {html} from 'htl';
import Choices from 'choices.js';
import * as Controls from '../ui/controls.js';
import {loadDatasets} from '../ui/data.js';
import {createShareButton} from '../components/shareButton.js';
import {createResetButton} from '../components/resetButton.js';
import {reactionUrl} from '../components/reactionUrl.js';
import {EventBus} from '../noitalambic/core/EventBus.js';
import {DataRepository} from '../noitalambic/core/DataRepository.js';
import {AppState} from '../noitalambic/core/AppState.js';
import {ReactionFilter} from '../noitalambic/filters/ReactionFilter.js';
import {GraphDataBuilder} from '../noitalambic/graph/GraphDataBuilder.js';
import {GraphRenderer} from '../noitalambic/graph/GraphRenderer.js';
import {UIController} from '../noitalambic/ui/UIController.js';
import {ChoicesInitializer} from '../noitalambic/ui/ChoicesInitializer.js';
import {fitGraphToViewport} from '../noitalambic/graph/viewport.js';
import {formatNumber} from '../ui/format.js';

export async function mount(host) {
  const [materials, base, associations, availability, apotheosis, secret, all] = await loadDatasets([
    'materials', 'reactionRules', 'associations', 'availability', 'apotheosisReactions', 'apotheosisSecretReactions', 'allModReactions']);
  const sources = {base: {name: 'Base Game', reactions: base}, apotheosis: {name: 'Apotheosis', reactions: apotheosis},
    apotheosis_secret: {name: 'Apotheosis Secret', reactions: secret}, all_mods: {name: 'All Mods', reactions: all}};
  const bus = new EventBus(), repo = new DataRepository(materials, sources, associations, availability);
  const state = new AppState(bus, repo), filter = new ReactionFilter(repo), builder = new GraphDataBuilder(repo);
  const renderer = new GraphRenderer(repo, state, builder), ui = new UIController(state, filter, renderer, repo);
  const choices = new ChoicesInitializer(state, ui, filter, bus, repo);
  const share = createShareButton(() => reactionUrl(location.href, state), Controls);
  const reset = createResetButton(Controls, () => {state.reset(); speed.value = 0; share.clear();});
  const speed = Controls.range([0, 100], {label: 'Minimum reaction speed', value: state.minReactionSpeed, step: 5});
  speed.addEventListener('input', () => state.setMinReactionSpeed(speed.value));
  const source = Controls.select(Object.keys(sources), {label: 'Reaction source', value: state.reactionSource,
    format: id => `${sources[id].name} (${formatNumber(sources[id].reactions.length)} reactions)`});
  source.addEventListener('input', () => state.setReactionSource(source.value));
  const unused = ui.createUnusedMaterialsToggle(Controls), download = ui.createExportButton(Controls, {html});
  const heading = pageHeading('Reactions Graph', {compact: true});
  const wheelHint = html`<small class="fg-3" hidden>Hold Ctrl or ⌘ while scrolling to zoom</small>`;
  const credit = html`<p class="graph-credit fg-3 mt-3 mb-0">Reactions Graph by <a class="brand-link" href="https://www.twitch.tv/kedesiklem"><img src="https://noita-bartender-images.acidflow.stream/images/logo/KED.svg" alt="Kedesiklem" width="60" height="24"></a></p>`;
  host.replaceChildren(html`<div class="graph-page">${heading}
    <section class="card mb-4" aria-label="Graph settings"><div class="card-body">
      <div class="row g-4"><div class="col-12 lg:col-7 form-field"><label class="form-label" for="choicesSelector">Ingredients</label><select id="choicesSelector" multiple></select></div>
        <div class="col-12 lg:col-5 form-field"><label class="form-label" for="productChoicesSelector">Product</label><select id="productChoicesSelector" multiple></select></div></div>
      <div class="row g-4"><div class="col-12 lg:col-6">${speed}</div><div class="col-12 lg:col-6">${source}</div></div>
      <div class="result-toolbar">${unused}<div class="d-flex flex-wrap gap-3">${reset}${share.button}${download}</div></div>${share.feedback}
    </div></section>
    <section class="card"><div class="card-header flex-row flex-wrap align-items-center justify-content-between gap-3"><h2 id="reactionsCount" class="mb-0">Reactions</h2>${wheelHint}</div><div id="graphContainer"></div></section>
    ${credit}
  </div>`);
  const fitting = fitGraphToViewport(host.querySelector('#graphContainer'), {credit, heading,
    controls: host.querySelector('[aria-label="Graph settings"]'), onOverflow: overflow => {wheelHint.hidden = !overflow;}});
  bus.on('stateChanged', share.clear);
  bus.on('reactionSourceChanged', () => {share.clear(); ui.updateChoicesOptions(); ui.updateUI();});
  await choices.initialize(Choices);
  fitting.refresh();
  // Restore state in the existing instances so back/forward keeps graph controls usable.
  const restore = () => {
    share.clear();
    repo.setReactionSource('base'); state._initializeFromURL(); state.visibleTagMaterials.clear();
    speed.value = state.minReactionSpeed; source.value = state.reactionSource;
    ui.updateChoicesOptions(); ui.updateUI();
  };
  window.addEventListener('popstate', restore);
  return () => {share.dispose(); window.removeEventListener('popstate', restore); fitting.dispose(); renderer.currentCleanup?.(); state.reagentChoices?.destroy(); state.productChoices?.destroy();};
}
