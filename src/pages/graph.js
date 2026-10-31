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
import {ReactionSetWorkspace} from '../noitalambic/core/ReactionSetWorkspace.js';
import {ReactionGroupResolver} from '../noitalambic/core/ReactionGroupResolver.js';
import {ShortcutManager} from '../noitalambic/core/ShortcutManager.js';
import {ReactionFilter} from '../noitalambic/filters/ReactionFilter.js';
import {GraphDataBuilder} from '../noitalambic/graph/GraphDataBuilder.js';
import {GraphRenderer} from '../noitalambic/graph/GraphRenderer.js';
import {UIController} from '../noitalambic/ui/UIController.js';
import {ChoicesInitializer} from '../noitalambic/ui/ChoicesInitializer.js';
import {ReactionSetPanel} from '../noitalambic/ui/ReactionSetPanel.js';
import {LegendManager} from '../noitalambic/ui/LegendManager.js';
import {UIHelper} from '../noitalambic/ui/UIHelper.js';
import {fitGraphToViewport} from '../noitalambic/graph/viewport.js';
import {formatNumber} from '../ui/format.js';
import {iconLabel} from '../ui/icons.js';

const MODES = ['classic', 'advanced'];
const MODE_LABELS = {classic: 'Classic', advanced: 'Advanced (reaction sets)'};
// Advanced links carry their sets; "mode=advanced" alone opens the advanced mode with a first set.
const modeFromURL = () => {
  const params = new URLSearchParams(location.search);
  return params.get('mode') === 'advanced' || params.has('sets') ? 'advanced' : 'classic';
};

const SETTINGS_OPEN_KEY = 'bartender.reactionsGraph.settingsOpen';
const readSettingsOpen = () => {
  try {return localStorage.getItem(SETTINGS_OPEN_KEY) !== 'false';} catch {return true;}
};
const writeSettingsOpen = open => {
  try {localStorage.setItem(SETTINGS_OPEN_KEY, String(open));} catch {/* only loses the preference */}
};

// The page shell (layout, graph card, view controls) is built once. Two independent view states
// drive it: whether the settings column is shown (the Settings button only) and whether the
// layout is in full screen (which only resizes it to the screen). The mode only fills the
// settings column and drives the graph: classic mode is the original single reagent/product
// selection, advanced mode replaces it with reaction sets combined through groups. Switching
// remounts the mode in place, carrying the current selection over through the URL.
export async function mount(host) {
  const datasets = await loadDatasets([
    'materials', 'reactionRules', 'associations', 'availability', 'apotheosisReactions', 'apotheosisSecretReactions', 'allModReactions']);
  const view = {settingsOpen: readSettingsOpen()};
  const heading = pageHeading('Reactions Graph', {compact: true});
  const wheelHint = html`<small class="fg-3" hidden>Hold Ctrl or ⌘ while scrolling to zoom</small>`;
  const settingsToggle = html`<button type="button" class="btn-outline theme-secondary" aria-controls="graphSettings"></button>`;
  const fullscreen = html`<button type="button" class="btn-outline theme-secondary" hidden></button>`;
  const credit = html`<p class="graph-credit fg-3 mt-3 mb-0">Reactions Graph by <a class="brand-link" href="https://www.twitch.tv/kedesiklem"><img src="https://noita-bartender-images.acidflow.stream/images/logo/KED.svg" alt="Kedesiklem" width="60" height="24"></a></p>`;
  const settings = html`<div id="graphSettings" class="graph-settings" aria-label="Graph settings"></div>`;
  const layout = html`<div class="graph-layout">
    ${settings}
    <section class="card graph-card"><div class="card-header flex-row flex-wrap align-items-center justify-content-between gap-3"><div class="d-flex flex-wrap align-items-center gap-3">${settingsToggle}<h2 id="reactionsCount" class="mb-0">Reactions</h2></div><div class="d-flex flex-wrap align-items-center gap-3">${wheelHint}${fullscreen}</div></div><div id="graphContainer"></div></section>
  </div>`;
  host.replaceChildren(html`<div class="graph-page">${heading}${layout}${credit}</div>`);
  const container = layout.querySelector('#graphContainer');
  const fitting = fitGraphToViewport(container, {credit, heading, minimum: 420,
    controls: settings, onOverflow: overflow => {wheelHint.hidden = !overflow;}});

  const renderSettingsOpen = () => {
    layout.toggleAttribute('data-settings-open', view.settingsOpen);
    settingsToggle.setAttribute('aria-expanded', String(view.settingsOpen));
    settingsToggle.replaceChildren(iconLabel('sliders', view.settingsOpen ? 'Hide settings' : 'Show settings'));
    fitting.refresh();
  };
  settingsToggle.addEventListener('click', () => {
    view.settingsOpen = !view.settingsOpen;
    writeSettingsOpen(view.settingsOpen);
    renderSettingsOpen();
  });
  renderSettingsOpen();

  // Notifications live outside the page; move them into the full screen element so they stay visible.
  const toasts = document.querySelector('.toast-container'), toastHome = toasts?.parentElement;
  const renderFullscreen = () => {
    const active = document.fullscreenElement === layout;
    fullscreen.replaceChildren(active ? iconLabel('fullscreen-exit', 'Exit full screen') : iconLabel('fullscreen', 'Full screen'));
    fullscreen.setAttribute('aria-pressed', String(active));
    if (toasts) (active ? layout : toastHome).append(toasts);
    fitting.refresh();
  };
  fullscreen.hidden = !document.fullscreenEnabled;
  fullscreen.addEventListener('click', () => document.fullscreenElement === layout
    ? document.exitFullscreen() : layout.requestFullscreen().catch(() => {}));
  document.addEventListener('fullscreenchange', renderFullscreen);
  renderFullscreen();

  let mode = modeFromURL(), current = null;
  const show = async () => {
    current?.dispose();
    current = await mountMode({datasets, settings, container, mode, switchMode});
    fitting.refresh();
  };
  async function switchMode(nextMode, url) {
    if (nextMode === mode) return;
    mode = nextMode;
    history.pushState(null, '', url);
    await show();
  }
  const onPopState = () => {
    if (modeFromURL() === mode) return current?.restore();
    mode = modeFromURL();
    show();
  };
  await show();
  window.addEventListener('popstate', onPopState);
  return () => {
    window.removeEventListener('popstate', onPopState); current?.dispose();
    document.removeEventListener('fullscreenchange', renderFullscreen);
    if (toasts && toasts.parentElement !== toastHome) toastHome.append(toasts);
    if (document.fullscreenElement === layout) document.exitFullscreen().catch(() => {});
    fitting.dispose();
  };
}

// Builds one mode inside the page shell: its settings, data model and graph renderer.
async function mountMode({datasets, settings, container, mode, switchMode}) {
  const advanced = mode === 'advanced';
  const [materials, base, associations, availability, apotheosis, secret, all] = datasets;
  const sources = {base: {name: 'Base Game', reactions: base}, apotheosis: {name: 'Apotheosis', reactions: apotheosis},
    apotheosis_secret: {name: 'Apotheosis Secret', reactions: secret}, all_mods: {name: 'All Mods', reactions: all}};
  const bus = new EventBus(), repo = new DataRepository(materials, sources, associations, availability);
  const state = new AppState(bus, repo), filter = new ReactionFilter(repo), builder = new GraphDataBuilder(repo);
  const modeControl = Controls.radio(MODES, {label: 'Mode', value: mode, format: id => MODE_LABELS[id], buttons: true});
  const source = Controls.select(Object.keys(sources), {label: 'Reaction source', value: state.reactionSource,
    format: id => `${sources[id].name} (${formatNumber(sources[id].reactions.length)} reactions)`});
  source.addEventListener('input', () => state.setReactionSource(source.value));
  const view = advanced ? createAdvancedMode({bus, repo, state, filter, builder}) : createClassicMode({bus, repo, state, filter, builder});
  const {ui, renderer} = view;
  const share = createShareButton(view.url, Controls);
  const reset = createResetButton(Controls, () => {view.reset(); share.clear();});
  const unused = ui.createUnusedMaterialsToggle(Controls), download = ui.createExportButton(Controls, {html});
  modeControl.addEventListener('change', () => switchMode(modeControl.value, view.switchUrl(modeControl.value)));
  settings.replaceChildren(html`<section class="card"><div class="card-body">
      ${modeControl}
      ${view.controls}
      ${source}
      <div class="result-toolbar">${unused}<div class="d-flex flex-wrap gap-3">${reset}${share.button}${download}</div></div>${share.feedback}
    </div></section>`, view.panel ?? '');
  bus.on('stateChanged', share.clear);
  bus.on('reactionSourceChanged', share.clear);
  await view.start();
  return {
    // Restore state in the existing instances so back/forward keeps graph controls usable.
    restore() {
      share.clear();
      repo.setReactionSource('base'); state._initializeFromURL(); state.visibleTagMaterials.clear();
      source.value = state.reactionSource;
      view.restore();
    },
    dispose() {
      share.dispose(); renderer.currentCleanup?.(); view.dispose();
      settings.replaceChildren(); container.replaceChildren();
      document.getElementById('reactionsCount').textContent = 'Reactions';
      document.getElementById('graph-legend')?.remove();
    },
  };
}

// Global options (source, unused materials) shared by both modes' links.
const globalOptions = state => ({reactionSource: state.reactionSource, excludeUnusedMaterials: state.excludeUnusedMaterials});
// Classic links reject tags and more than three reagents; fall back to the global options.
function classicUrl(state, selection) {
  try {
    return reactionUrl(location.href, {...globalOptions(state), ...selection});
  } catch {
    return reactionUrl(location.href, globalOptions(state));
  }
}

function createClassicMode({bus, repo, state, filter, builder}) {
  const renderer = new GraphRenderer(repo, state, builder), ui = new UIController(state, filter, renderer, repo);
  const choices = new ChoicesInitializer(state, ui, filter, bus, repo);
  const speed = Controls.range([0, 100], {label: 'Minimum reaction speed', value: state.minReactionSpeed, step: 5});
  speed.addEventListener('input', () => state.setMinReactionSpeed(speed.value));
  const controls = html`<div class="row g-4"><div class="col-12 md:col-6 lg:col-12 form-field"><label class="form-label" for="choicesSelector">Ingredients</label><select id="choicesSelector" multiple></select></div>
    <div class="col-12 md:col-6 lg:col-12 form-field"><label class="form-label" for="productChoicesSelector">Product</label><select id="productChoicesSelector" multiple></select></div>
    <div class="col-12">${speed}</div></div>`;
  bus.on('reactionSourceChanged', () => {ui.updateChoicesOptions(); ui.updateUI();});
  return {
    ui, renderer, controls,
    url: () => reactionUrl(location.href, state),
    // The classic selection becomes the first set of the advanced mode (see seedFromLegacyParams).
    switchUrl: () => {
      const url = new URL(classicUrl(state, state));
      url.searchParams.set('mode', 'advanced');
      return url.toString();
    },
    start: () => choices.initialize(Choices),
    reset() {state.reset(); speed.value = 0;},
    restore() {speed.value = state.minReactionSpeed; ui.updateChoicesOptions(); ui.updateUI();},
    dispose() {state.reagentChoices?.destroy(); state.productChoices?.destroy();},
  };
}

function createAdvancedMode({bus, repo, state, filter, builder}) {
  // Reaction sets: several reagent/product selections, combined through a tree of groups
  // (union / intersection / difference / symmetric difference) with per-set advanced filters.
  const workspace = new ReactionSetWorkspace(bus), resolver = new ReactionGroupResolver(filter);
  const shortcuts = new ShortcutManager();
  const renderer = new GraphRenderer(repo, state, builder, shortcuts, (id, role) => quickAddMaterialToNewSet(id, role));
  const ui = new UIController(state, filter, renderer, repo, workspace);
  const url = () => {
    const url = new URL(reactionUrl(location.href, globalOptions(state)));
    url.searchParams.set('mode', 'advanced');
    if (workspace.manager.sets.length > 0) url.searchParams.set('sets', workspace.encodeToURLParam());
    return url.toString();
  };
  const panel = new ReactionSetPanel({workspace, resolver, reactionFilter: filter, dataRepo: repo, eventBus: bus,
    ChoicesLib: Choices, shortcutManager: shortcuts, hideable: false,
    onSetsResolved: result => {ui.updateUIFromResolvedSets(result); history.replaceState(history.state, '', url());}});
  ui.reactionSetPanel = panel;
  function quickAddMaterialToNewSet(materialId, role) {
    const name = repo.getMaterial(materialId)?.name || materialId;
    workspace.createSet(workspace.tree.rootId, role === 'reagent' ? {name, reagents: [materialId]} : {name, product: materialId});
    panel.rebuild();
    UIHelper.showNotification(`Added "${name}" as ${role} to a new set`);
  }
  const firstSet = () => {
    const leafId = workspace.tree.root.children.find(id => workspace.tree.getNode(id)?.type === 'leaf');
    return leafId ? workspace.manager.getSet(workspace.tree.getNode(leafId).setId) : null;
  };
  // Load "?sets=..." when present, otherwise seed the first set from classic reagents/product links.
  const loadSetsFromURL = () => {
    const param = new URLSearchParams(location.search).get('sets');
    if (param && workspace.loadFromURLParam(param)) return;
    workspace.reset(false);
    workspace.seedFromLegacyParams({reagents: state.selectedReagents, product: state.selectedProduct, minSpeed: state.minReactionSpeed});
  };
  const panelHost = html`<div id="reactionSetPanel"></div>`;
  // Graph quick picks (Ctrl/Shift+Click) change the global selection: mirror them onto the first
  // set. Excluding unused materials changes the reactions themselves, so the sets are resolved
  // again. Anything else (e.g. tag visibility) only needs a repaint of the last result.
  const pick = () => JSON.stringify([state.selectedReagents, state.selectedProduct]);
  let lastPick = pick(), lastExcludeUnused = state.excludeUnusedMaterials;
  bus.on('stateChanged', () => {
    const picked = pick();
    if (state.excludeUnusedMaterials !== lastExcludeUnused) {
      lastExcludeUnused = state.excludeUnusedMaterials; lastPick = picked;
      return panel.rebuild();
    }
    if (picked !== lastPick) {
      lastPick = picked;
      const first = firstSet();
      if (first) workspace.manager.updateSet(first.id, {reagents: state.selectedReagents, product: state.selectedProduct});
      else workspace.createSet(workspace.tree.rootId, {name: 'Set 1', reagents: state.selectedReagents, product: state.selectedProduct});
      return panel.rebuild();
    }
    panel.refreshGraphOnly();
  });
  bus.on('reactionSourceChanged', () => {lastPick = pick(); ui.updateUnusedMaterialsToggle(); panel.rebuild();});
  return {
    ui, renderer, controls: '',
    panel: html`<section class="card"><div class="card-body">${panelHost}</div></section>`,
    url,
    // The first set becomes the classic selection; other sets and groups have no classic equivalent.
    switchUrl: () => {
      const first = firstSet();
      return classicUrl(state, {selectedReagents: first?.reagents ?? [], selectedProduct: first?.product ?? '', minReactionSpeed: first?.minSpeed ?? 0});
    },
    start() {
      loadSetsFromURL();
      panel.mount(panelHost);
      LegendManager.create(); // ChoicesInitializer creates it in classic mode
    },
    reset() {workspace.reset(true); state.reset(); panel.rebuild();},
    restore() {
      lastPick = pick(); lastExcludeUnused = state.excludeUnusedMaterials;
      ui.updateUnusedMaterialsToggle(); loadSetsFromURL(); panel.rebuild();
    },
    dispose() {panel._destroyChoicesInstances();},
  };
}
