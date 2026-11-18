import {html} from 'htl';
import {pageHeading} from '../ui/heading.js';
import {loadData} from '../ui/data.js';
import * as Controls from '../ui/controls.js';
import {createShareButton} from '../components/shareButton.js';
import {summaryNumber} from '../materials/summary.js';
import {LiquidWorld, EMPTY, WALL} from '../liquids/engine.mjs';
import {LIQUID_SCENES, populateScene, defaultSceneProcesses} from '../liquids/scenes.mjs';
import {createLiquidRenderer} from '../liquids/renderer.mjs';
import {createLiquidPlayback} from '../liquids/playback.mjs';
import {bindLiquidInput} from '../liquids/input.mjs';
import {createMaterialHover} from '../liquids/hover.mjs';
import {readLiquidSetup, liquidSetupUrl} from '../liquids/url.mjs';
import {BRUSH_TYPES, WALL_MATERIALS, materialPropertyRows, cellReadout} from '../liquids/view-data.mjs';
import '../styles/liquids.css';

export async function mount(host) {
  const {materials, reactions} = await loadData('liquidSimulation');
  const brushMaterials = materials.filter(material => BRUSH_TYPES.includes(material.type));
  const initial = readLiquidSetup(location.href, brushMaterials);
  const world = new LiquidWorld({width: 256, height: 160, materials, reactions, processes: true, seed: 1});
  const materialType = Controls.select(BRUSH_TYPES, {label: 'Material type', value: brushMaterials.find(material => material.id === initial.material).type});
  const byId = new Map(materials.map(material => [material.id, material]));
  const material = html`<select id="liquid-material" class="form-control"></select>`;
  const picker = html`<div class="form-field"><label class="form-label" for="liquid-material">Material</label>${material}</div>`;
  const fillPicker = id => {
    const options = brushMaterials.filter(item => item.type === materialType.value).sort((a, b) => a.name.localeCompare(b.name));
    material.replaceChildren(...options.map(item => new Option(item.name + ' (' + item.id + ')', item.id)));
    material.value = id;
  };
  fillPicker(initial.material);
  const wall = Controls.select(WALL_MATERIALS.map(material => material.id), {label: 'Wall material', value: initial.wall,
    format: id => WALL_MATERIALS.find(material => material.id === id).name});
  wall.hidden = true;
  const scene = Controls.select(LIQUID_SCENES.map(item => item.id), {
    label: 'Experiment', value: initial.scene, format: id => LIQUID_SCENES.find(item => item.id === id).name,
  });
  const interactions = Controls.toggle({label: 'Reactions, fire and decay', value: initial.interactions ?? defaultSceneProcesses(initial.scene)});
  const tools = Controls.radio(['pour', 'wall', 'erase', 'heat', 'cool', 'ignite'], {label: 'Tool', value: 'pour',
    format: value => ({pour: 'Pour', wall: 'Wall', erase: 'Erase', heat: 'Heat', cool: 'Cool', ignite: 'Ignite'})[value]});
  tools.classList.add('liquid-brush-tools');
  const brush = Controls.range([1, 12], {label: 'Brush size', value: 4, step: 1});
  const strength = Controls.range([1, 100], {label: 'Strength', value: 50, step: 1});
  strength.hidden = true;
  const canvas = html`<canvas class="liquid-canvas" tabindex="0" aria-label="Interactive liquid tank" aria-describedby="liquids-help"></canvas>`;
  const properties = html`<div></div>`;
  const probe = html`<output class="small fg-3" aria-label="Cell under the brush"></output>`;
  const zones = html`<div class="d-flex gap-3 small" hidden><span class="liquid-warm-key">Warm</span><span class="liquid-cold-key">Cold</span></div>`;
  const population = html`<div class="liquid-population d-flex flex-wrap gap-2" aria-label="Materials in the tank"></div>`;
  const stats = html`<span class="small fg-3 text-nowrap" data-liquid-stats></span>`;
  const pausedButton = html`<button type="button" class="btn-solid theme-primary" data-liquid-pause>Pause</button>`;
  const stepButton = html`<button type="button" class="btn-outline theme-secondary" data-liquid-step>Step</button>`;
  const resetButton = html`<button type="button" class="btn-outline theme-secondary" data-liquid-reset>Reset</button>`;
  const clearButton = html`<button type="button" class="btn-outline theme-secondary" data-liquid-clear>Clear</button>`;
  const pourButton = html`<button type="button" class="btn-outline theme-secondary w-100">Pour from top center</button>`;
  const textureStatus = html`<p class="small fg-3 mb-0" role="status" hidden></p>`;
  const setup = () => ({material: material.value, scene: scene.value, wall: wall.value, interactions: interactions.value});
  const share = createShareButton(() => liquidSetupUrl(location.href, setup()), Controls);
  const choice = html`<span class="fg-3 small"></span>`;
  const populationTotal = html`<span class="fg-3 small"></span>`;
  const inventory = html`<details class="liquid-inventory"><summary class="liquid-disclosure"><strong>Materials in the tank</strong>${populationTotal}</summary>${population}</details>`;
  const propertyPanel = html`<details class="liquid-properties"><summary>Material properties</summary>${properties}</details>`;
  const wide = window.matchMedia('(min-width: 900px)');
  const materialFields = html`<div class="liquid-material-fields">${materialType}${picker}</div>`;
  const controls = html`<details class="card liquid-controls" open=${wide.matches}>
    <summary class="liquid-disclosure"><strong>Brush</strong>${choice}</summary>
    <div class="card-body p-4 gap-4">
      ${tools}${materialFields}${wall}${brush}${strength}${pourButton}
      ${propertyPanel}
    </div></details>`;
  const page = html`<div class="liquids-page">
    <header class="liquid-heading">${pageHeading('Liquids', {compact: true})}${share.button}</header>${share.feedback}
    <div class="liquid-workspace">
      <section class="card liquid-stage" aria-label="Liquid experiment">
        <div class="liquid-toolbar card-header p-4">${scene}${interactions}</div>
        <div class="liquid-canvas-wrap">${canvas}</div>
        <div class="card-body p-4 gap-3">
          <div class="liquid-playback"><div role="group" aria-label="Playback" class="btn-group">${pausedButton}${stepButton}</div>
            <div role="group" aria-label="Tank" class="btn-group">${resetButton}${clearButton}</div>${stats}</div>
          <div class="d-flex flex-wrap gap-2">${zones}${probe}</div>
          <p id="liquids-help" class="small fg-3 mb-0">Drag to use the brush. Use the arrow keys to move it and Space to apply it.</p>${textureStatus}
        </div>
        ${inventory}
      </section>${controls}
    </div>
  </div>`;
  host.replaceChildren(page);
  const arrangeBrush = () => {
    controls.open = wide.matches;
    if (wide.matches) controls.parentElement.append(controls);
    else controls.parentElement.prepend(controls);
  };
  arrangeBrush();
  const renderer = createLiquidRenderer(canvas, world);
  const hover = createMaterialHover(canvas, world, renderer.materialAt);
  const controller = new window.AbortController();
  const listen = (element, name, handler) => element.addEventListener(name, handler, {signal: controller.signal});
  let disposed = false, input, lastStats = -Infinity;
  const populationItems = new Map();
  const renderStats = (force = false) => {
    if (!force && world.tick - lastStats >= 0 && world.tick - lastStats < 12) return;
    lastStats = world.tick;
    const counts = [...world.countMaterials()].filter(([id]) => id !== EMPTY && id !== WALL);
    populationTotal.textContent = counts.length.toLocaleString();
    const total = counts.reduce((sum, [, count]) => sum + count, 0);
    let burning = 0, hasZones = false;
    for (let index = 0; index < world.cells.length; index++) {
      if (world.processes) burning += world.burning[index];
      hasZones ||= !!(world.warmth?.[index] || world.cold?.[index]);
    }
    zones.hidden = !hasZones;
    stats.textContent = `${total.toLocaleString()} cells${burning ? `, ${burning.toLocaleString()} burning` : ''}, tick ${world.tick.toLocaleString()}`;
    if (!inventory.open) return;
    const active = new Set(counts.map(([id]) => id));
    for (const [id, item] of populationItems) if (!active.has(id)) {item.element.remove(); populationItems.delete(id);}
    counts.sort(([a], [b]) => world.materials[b].density - world.materials[a].density).forEach(([id, count], index) => {
      const material = world.materials[id];
      let item = populationItems.get(id);
      if (!item) {
        const detail = html`<span class="fg-3"></span>`;
        const element = BRUSH_TYPES.includes(material.type)
          ? html`<button type="button" class="btn-text theme-secondary btn-sm" title=${`Use ${material.name} as the brush material`}>${material.name} ${detail}</button>`
          : html`<a class="btn-text theme-secondary btn-sm" href=${`/materials?material=${encodeURIComponent(material.id)}`}>${material.name} ${detail}</a>`;
        if (element.tagName === 'BUTTON') element.addEventListener('click', () => {tools.value = 'pour'; selectMaterial(material.id);});
        item = {element, detail}; populationItems.set(id, item);
      }
      item.detail.textContent = `${material.type === 'Liquid' ? `density ${summaryNumber(material.density).text}, ` : ''}${count.toLocaleString()} cells`;
      if (population.children[index] !== item.element) population.insertBefore(item.element, population.children[index] ?? null);
    });
  };
  const draw = () => {
    renderer.draw(input?.cursor);
    hover.update(input?.cursor);
    probe.textContent = cellReadout(world, input?.cursor);
    if (renderer.failed.length) {textureStatus.hidden = false; textureStatus.textContent = 'Some textures could not load. Material colors are shown.';}
    if (renderer.referenceFailed) {textureStatus.hidden = false; textureStatus.textContent = 'Could not load Minä.';}
    renderStats();
  };
  const applyBrush = (position = input.position) => {
    const tool = tools.value;
    if (['heat', 'cool', 'ignite'].includes(tool)) {world.applyEnvironmentCircle(position.x, position.y, brush.value, tool, strength.value); return;}
    if (tool === 'erase') {world.eraseCircle(position.x, position.y, brush.value); return;}
    const id = tool === 'wall' ? wall.value === 'boundary' ? WALL : world.getMaterialId(wall.value) : world.getMaterialId(setup().material);
    world.paintCircle(position.x, position.y, brush.value, id, {replace: tool !== 'pour'});
  };
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const playback = createLiquidPlayback({step: () => {world.step(); renderer.advance();}, draw,
    beforeStep: () => {if (input?.active && ['pour', 'erase', 'heat', 'cool', 'ignite'].includes(tools.value)) applyBrush();}, paused: reduced.matches, hidden: document.hidden});
  const updatePlaybackLabel = () => {
    pausedButton.textContent = playback.paused ? 'Play' : 'Pause';
    pausedButton.setAttribute('aria-label', playback.paused ? 'Play liquid simulation' : 'Pause liquid simulation');
    if (playback.paused) renderStats(true);
  };
  const writeUrl = () => {history.replaceState(history.state, '', liquidSetupUrl(location.href, setup())); share.clear();};
  const updateInteractions = () => {
    world.processes = interactions.value;
    lastStats = -Infinity;
    for (const option of tools.querySelectorAll('input')) {
      if (['heat', 'cool', 'ignite'].includes(option.value)) option.disabled = !world.processes;
    }
    if (!world.processes && ['heat', 'cool', 'ignite'].includes(tools.value)) tools.value = 'pour';
  };
  const updateProperties = () => {
    materialFields.hidden = pourButton.hidden = tools.value !== 'pour';
    wall.hidden = tools.value !== 'wall';
    strength.hidden = !['heat', 'cool'].includes(tools.value);
    propertyPanel.hidden = !['wall', 'pour'].includes(tools.value);
    const selected = byId.get(tools.value === 'wall' ? wall.value : setup().material);
    choice.textContent = tools.value[0].toUpperCase() + tools.value.slice(1);
    if (tools.value === 'pour') choice.textContent = selected.name;
    if (tools.value === 'wall') choice.textContent += ', ' + (selected?.name ?? 'Boundary');
    properties.replaceChildren(html`<section aria-label="Selected material properties">
      <dl class="row g-2 mb-0">${materialPropertyRows(selected).map(([key, label, raw]) => {
        const value = typeof raw === 'number' ? summaryNumber(raw) : {text: raw ?? 'Not recorded', exact: null};
        return html.fragment`<dt class="col-7 small fg-3 fw-normal">${label}</dt><dd class="col-5 small mb-0 text-end" title=${value.exact} data-liquid-property=${key}>${value.text}</dd>`;
      })}</dl>
      ${selected ? html`<a class="local-link small d-inline-flex mt-3" href=${`/materials?material=${encodeURIComponent(selected.id)}`}>Full reference</a>` : null}
    </section>`);
    if (selected) void renderer.preload(world.getMaterialId(selected.id)).then(() => {if (!disposed) draw();});
    writeUrl();
  };
  function selectMaterial(id) {
    const material = brushMaterials.find(material => material.id === id);
    if (!material) return;
    materialType.value = material.type;
    fillPicker(id);
    updateProperties();
    if (scene.value === 'channels') reset();
  }
  const reset = (id = scene.value) => {
    input?.cancel();
    updateInteractions();
    populateScene(world, id, setup().material, wall.value);
    playback.resetTime(); lastStats = -Infinity;
    updateProperties(); draw();
  };
  listen(pausedButton, 'click', () => {playback.setPaused(!playback.paused); updatePlaybackLabel();});
  listen(stepButton, 'click', () => {playback.step(); updatePlaybackLabel(); renderStats(true);});
  listen(resetButton, 'click', () => reset());
  listen(clearButton, 'click', () => {scene.value = 'empty'; interactions.value = defaultSceneProcesses('empty'); reset();});
  listen(scene, 'input', () => {interactions.value = defaultSceneProcesses(scene.value); reset();});
  listen(interactions, 'input', () => {updateInteractions(); updateProperties(); draw();});
  listen(inventory, 'toggle', () => renderStats(true));
  listen(wide, 'change', arrangeBrush);
  listen(material, 'change', () => {updateProperties(); if (scene.value === 'channels') reset();});
  listen(materialType, 'input', () => selectMaterial(({Liquid: 'water', Powder: 'sand', Gas: 'smoke', Fire: 'fire'})[materialType.value]));
  listen(wall, 'input', () => {updateProperties(); if (['channels', 'acid'].includes(scene.value)) reset();});
  listen(brush, 'input', draw);
  listen(tools, 'input', () => {updateProperties(); draw();});
  listen(pourButton, 'click', () => {
    world.paintCircle(Math.floor(world.width / 2), 12, brush.value, world.getMaterialId(setup().material));
    lastStats = -Infinity; draw();
  });
  input = bindLiquidInput(canvas, {width: world.width, height: world.height, radius: () => brush.value,
    paint: position => {applyBrush(position); lastStats = -Infinity;}, draw});
  listen(document, 'visibilitychange', () => {
    playback.setHidden(document.hidden);
    if (document.hidden) input.cancel();
  });
  listen(window, 'popstate', () => {
    const restored = readLiquidSetup(location.href, brushMaterials);
    scene.value = restored.scene; wall.value = restored.wall; interactions.value = restored.interactions ?? defaultSceneProcesses(restored.scene); selectMaterial(restored.material); reset();
  });
  renderer.ready.then(({failed}) => {
    if (disposed) return;
    if (failed.length) {textureStatus.hidden = false; textureStatus.textContent = 'Some textures could not load. Their declared material colors are shown.';}
    draw();
  });
  reset(); updatePlaybackLabel();
  return () => {disposed = true; controller.abort(); input.dispose(); playback.dispose(); renderer.dispose(); hover.dispose(); share.dispose();};
}
