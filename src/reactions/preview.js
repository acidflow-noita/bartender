import {html} from 'htl';
import * as Controls from '../ui/controls.js';
import {createShareButton} from '../components/shareButton.js';
import {LiquidWorld} from '../liquids/engine.mjs';
import {materialRGBA} from '../liquids/materials.mjs';
import {createLiquidRenderer} from '../liquids/renderer.mjs';
import {createLiquidPlayback} from '../liquids/playback.mjs';
import {createMaterialHover} from '../liquids/hover.mjs';
import {RECIPE_TANK, prepareReactionTank, recipeCells, stepRecipeTank, usesDirectContact} from './experiment.js';

export function createReactionPreview(materials, byId, seedFor = () => 1, imageFor = () => '') {
  let imageUrl = '';
  const imageShare = createShareButton(() => imageUrl, Controls, {
    label: 'Share recipe image', urlLabel: 'Recipe image URL', copiedMessage: 'Recipe image link copied',
  });
  imageShare.button.hidden = true;
  imageShare.button.querySelector('button').classList.add('btn-sm');
  imageShare.feedback.classList.add('px-4', 'py-2');
  const world = new LiquidWorld({...RECIPE_TANK, materials});
  const name = id => byId.get(id)?.name ?? id;
  const title = html`<p class="mb-0 fw-semibold" aria-live="polite"></p>`;
  const matches = html`<span class="small fg-3 reaction-matches"></span>`;
  const canvas = html`<canvas width=${world.width} height=${world.height} style=${{aspectRatio: world.width + " / " + world.height}} role="img" aria-label="Reaction tank"></canvas>`;
  const play = html`<button type="button" class="btn-solid btn-sm theme-primary"></button>`;
  const step = html`<button type="button" class="btn-outline btn-sm theme-secondary">Step</button>`;
  const replay = html`<button type="button" class="btn-outline btn-sm theme-secondary">Replay</button>`;
  const inventory = html`<ul class="reaction-inventory list-unstyled m-0" aria-label="Material cell counts"></ul>`;
  const air = html`<span class="small fg-3" hidden>Air</span>`;
  const materialsPanel = html`<details class="liquid-inventory"><summary class="liquid-disclosure"><strong>Materials in the tank</strong></summary>
    <div class="px-4 pb-4">${inventory}${air}</div></details>`;
  const condition = html`<p class="small fg-3 mb-0" hidden></p>`;
  const entity = html`<p class="small fg-3 mb-0" hidden></p>`;
  const content = html`<div hidden>
    <div class="reaction-caption px-4 py-2">${title}</div>
    <div class="reaction-tank">${canvas}</div>
    <div class="card-body p-4 gap-3">
      <div class="d-flex flex-wrap align-items-center gap-2"><div role="group" aria-label="Preview playback" class="btn-group">${play}${step}${replay}</div>${matches}</div>
      ${condition}${entity}
    </div>
    ${materialsPanel}
  </div>`;
  const empty = html`<p class="fg-3 m-0 p-4">No matching reaction to preview.</p>`;
  const element = html`<aside id="reaction-preview" class="card reaction-preview" aria-label="Reaction preview">
    <div class="card-header px-4 py-3 d-flex flex-row flex-wrap justify-content-between align-items-center gap-2">
      <div><h2 class="h5 mb-0">Reaction preview</h2><small class="fg-3">Selected recipe only</small></div>${imageShare.button}
    </div>${imageShare.feedback}${content}${empty}</aside>`;
  const events = new AbortController();
  const listen = (node, type, fn) => node.addEventListener(type, fn, {signal: events.signal});
  let rule = null, renderer, hover, cursor = null, paused = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let seen = true, lastTick = -1;
  const items = new Map();
  const updateInventory = () => {
    const counts = world.countMaterials();
    for (const [id, item] of items) if (!counts.has(id)) {item.node.remove(); items.delete(id);}
    for (const [id, count] of counts) {
      let item = items.get(id);
      if (!item) {
        const material = world.materials[id];
        const swatch = html`<span class="material-swatch" aria-hidden="true"></span>`;
        swatch.style.backgroundColor = 'rgb(' + materialRGBA(material).slice(0, 3).join(' ') + ')';
        const value = html`<span class="fg-3"></span>`;
        const node = html`<li data-material=${material.id}>${swatch}<span>${material.name}</span>${value}</li>`;
        item = {value, node}; items.set(id, item); inventory.append(node);
      }
      item.value.textContent = count.toLocaleString();
    }
    inventory.toggleAttribute('hidden', !counts.size);
    air.hidden = !!counts.size;
  };
  const draw = () => {
    if (!rule) return;
    renderer.draw();
    hover.update(cursor);
    if (lastTick >= 0 && world.tick - lastTick < 12 && !paused) return;
    lastTick = world.tick;
    matches.textContent = world.reactionCount.toLocaleString() + (world.reactionCount === 1 ? ' reaction' : ' reactions');
    if (materialsPanel.open) updateInventory();
  };
  listen(materialsPanel, 'toggle', () => {if (materialsPanel.open && rule) updateInventory();});
  const playback = createLiquidPlayback({step: () => {stepRecipeTank(world); renderer.advance();}, draw, paused, hidden: true});
  const syncVisibility = () => playback.setHidden(!rule || document.hidden || !seen);
  const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(([entry]) => {
    seen = entry.isIntersecting; syncVisibility();
  }) : null;
  observer?.observe(element);
  listen(document, 'visibilitychange', syncVisibility);
  listen(canvas, 'pointermove', event => {
    const box = canvas.getBoundingClientRect();
    cursor = {x: (event.clientX - box.left) * world.width / box.width, y: (event.clientY - box.top) * world.height / box.height};
    hover?.update(cursor);
  });
  listen(canvas, 'pointerleave', () => {cursor = null; hover?.update(null);});
  const label = () => {play.textContent = paused ? 'Play' : 'Pause';};
  listen(play, 'click', () => {paused = !paused; playback.setPaused(paused); label();});
  listen(step, 'click', () => {paused = true; playback.step(); label();});
  const start = () => {
    prepareReactionTank(world, rule, seedFor(rule));
    cursor = null; lastTick = -1;
    playback.resetTime(); draw();
  };
  listen(replay, 'click', start);
  return {element, select(next) {
    const url = next ? imageFor(next) : '';
    if (url !== imageUrl) {imageShare.clear(); imageUrl = url;}
    imageShare.button.hidden = !imageUrl;
    if (rule === next) return;
    rule = next; empty.textContent = 'No matching reaction to preview.';
    content.hidden = !next; empty.hidden = !!next;
    if (next) {
      if (!renderer) {
        try {
          renderer = createLiquidRenderer(canvas, world);
          hover = createMaterialHover(canvas, world, renderer.materialAt);
        } catch {
          rule = null; content.hidden = true; empty.hidden = false;
          empty.textContent = 'This browser could not open the reaction tank.';
          return;
        }
      }
      title.textContent = recipeCells(next, 'input').map(name).join(' + ');
      canvas.setAttribute('aria-label', title.textContent + ' reaction tank');
      const notes = [];
      if (next.req_lifetime) notes.push('The ' + name(next.input_cell1) + ' sample starts at the required age of ' + next.req_lifetime + ' ticks.');
      if (usesDirectContact(world.materials[world.getMaterialId(next.input_cell1)], next)) notes.push('This sample tests the selected contact rule where the materials touch.');
      condition.textContent = notes.join(' '); condition.hidden = !notes.length;
      entity.hidden = !next.entity_file;
      if (next.entity_file) entity.textContent = 'In game, this reaction also creates ' + next.entity_file.split('/').pop().replace(/\.xml$/, '').replaceAll('_', ' ') + '.';
      start(); label();
    }
    syncVisibility();
  }, dispose() {imageShare.dispose(); events.abort(); observer?.disconnect(); playback.dispose(); hover?.dispose(); renderer?.dispose();}};
}
