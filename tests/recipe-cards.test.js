import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import sharp from 'sharp';
import {assignRecipeIds, recipeIds} from '../scripts/data/recipe-ids.mjs';
import {recipePathId, readReactionState, reactionUrl} from '../src/components/reactionUrl.js';
import {renderPageShell} from '../scripts/render-page-shell.mjs';
import {layoutSidebar, drawSidebar, WIDTH, HEIGHT, SIDEBAR_WIDTH, CELL_SCALE} from '../scripts/recipe-cards/sidebar.mjs';
import {recipeCells, RECIPE_TANK} from '../src/reactions/experiment.js';
import {encodeCard, ANIMATION_LIMIT} from '../scripts/recipe-cards/encode.mjs';
import {recorder} from '../scripts/recipe-cards/record.mjs';
import {simulationMaterialRecords} from '../src/liquids/materials.mjs';
import {recipeCard, withRecipeMetadata} from '../src/reactions/social.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const rules = JSON.parse(read('../src/data/jsons/reactions.json'));
const materials = JSON.parse(read('../src/data/FULL_MATERIALS_FINAL.json'));
const byId = new Map(materials.map(m => [m.id, m]));
const ids = recipeIds(rules);
const template = read('../src/index.html');

test('stable IDs survive data reorder, repeated rules and retirement', () => {
  const ledger = [], a = {inputs: ['a','b'], speed: 4}, b = {speed: 2}, c = {speed: 7};
  assert.deepEqual(assignRecipeIds([a,b,a], ledger, true), [1,2,3]);
  assert.deepEqual(assignRecipeIds([{speed:4,inputs:['a','b']},a,b], ledger), [1,3,2]);
  assert.deepEqual(assignRecipeIds([c,b], ledger, true), [4,2]);
  assert.equal(ledger.length, 4);
});

test('exact static links open the selected material rule even when it is normally hidden', () => {
  const rule = {input_cell1:'mimic_liquid',input_cell2:'unused',output_cell1:'oil',reaction_rate:1};
  const byNumber = new Map([[23,rule]]), unused = new Set(['unused']);
  for (const href of ['https://example.test/reactions/23','https://example.test/reactions/23.html','https://example.test/reactions?reaction=23']) {
    const state = readReactionState(href, byNumber, unused);
    assert.equal(state.selectedReaction, 23); assert.equal(state.excludeSpecialMaterials, false);
    assert.equal(state.onlyPracticalReactions, false); assert.equal(state.excludeUnusedMaterials, false);
    assert.equal(recipePathId(new URL(reactionUrl(href,state)).pathname),23);
  }
  assert.equal(recipePathId('/reactions/-1'),null);
  assert.equal(reactionUrl('https://example.test/reactions/23',{}), 'https://example.test/reactions');
});

test('each recipe has a distinct static canonical, WebP and Twitter poster in the initial HTML', () => {
  for (const [id, name] of [[4814,'Whiskey + Frog Meat produces Berserkium + Frog Meat'],[1739,'Unstable Teleportatium + Teleportatium + Water produces Unstable Teleportatium + Unstable Teleportatium + Unstable Teleportatium']]) {
    const document = new JSDOM(renderPageShell(template,'/reactions/'+id)).window.document;
    assert.equal(document.querySelector('meta[property="og:title"]').content,name);
    assert.equal(document.querySelectorAll('meta[property="og:image"]').length,1);
    assert.equal(document.querySelector('meta[property="og:url"]').content,'https://bartender.runfast.stream/reactions/'+id);
    const animation = document.querySelector('meta[property="og:image"]').content;
    assert.match(animation, new RegExp('/recipe-media/'+id+'-[0-9a-f]{20}\\.webp$'));
    assert.equal(document.querySelector('meta[name="twitter:image"]').content,animation.replace(/\.webp$/,'.png'));
    assert.equal(document.querySelector('link[rel="canonical"]').href,document.querySelector('meta[property="og:url"]').content);
  }
  const ordinary = renderPageShell(template,'/reactions?reagents=alcohol&reagents=meat_frog');
  assert.match(ordinary,/BARTENDER_SOCIALS\.png/);
  const unsafe = recipeCard(1, {1:{title:'A & "</title><img src=x>',description:'B',version:'abcd'}});
  const head = new JSDOM(withRecipeMetadata(template,unsafe)).window.document.head;
  assert.equal(head.querySelector('meta[property="og:title"]').content, unsafe.title);
  assert.equal(head.querySelector('img'),null);
});

test('Discord gets only the animated asset for both reported still cards and the Ambrosia control', () => {
  for (const path of [
    '/reactions/4814?reagents=meat_frog&reagents=alcohol',
    '/reactions/343?product=acid',
    '/reactions/2776?product=magic_liquid_protection_all',
    '/reactions/1739',
  ]) {
    const doc = new JSDOM(renderPageShell(template, path)).window.document;
    const scripts = doc.head.querySelectorAll('script[id="discord:component-embed"][type="application/json"]');
    assert.equal(scripts.length, 1);
    const json = scripts[0].textContent;
    assert.ok(Buffer.byteLength(json) <= 3000);
    const animation = doc.querySelector('meta[property="og:image"]').content;
    const poster = doc.querySelector('meta[name="twitter:image"]').content;
    assert.match(animation, /\.webp$/); assert.match(poster, /\.png$/);
    assert.ok(!json.includes(poster));
    const {component} = JSON.parse(json);
    assert.equal(component.type, 17);
    const [gallery, row] = component.components;
    assert.equal(gallery.type, 12); assert.equal(gallery.items.length, 1);
    assert.deepEqual(gallery.items[0], {media: {url: animation}});
    assert.equal(doc.querySelector('meta[property="og:image:alt"],meta[name="twitter:image:alt"]'), null);
    assert.ok(doc.querySelector('meta[property="og:title"]').content.includes(' produces '));
    assert.equal(row.type, 1);
    assert.deepEqual(row.components.map(button => [button.type, button.style, button.url]), [
      [2, 5, doc.querySelector('link[rel="canonical"]').href], [2, 5, animation],
    ]);
  }
  const unsafe = recipeCard(1, {1: {title: '</script><script id="unexpected">', description: '', version: 'abc'}});
  unsafe.animation += '?q=</script><script id="unexpected">';
  const head = new JSDOM(withRecipeMetadata(template, unsafe)).window.document.head;
  const payload = JSON.parse(head.querySelector('script[id="discord:component-embed"]').textContent);
  assert.equal(payload.component.components[0].items[0].media.url, unsafe.animation);
  assert.equal(head.querySelector('#unexpected'), null);
  assert.throws(() => withRecipeMetadata(template, {...unsafe, animation: 'https://example.test/' + 'x'.repeat(1800)}), /3,000 bytes/);
  assert.doesNotMatch(renderPageShell(template, '/reactions'), /discord:component-embed/);
});

test('every recipe fits the branded sidebar with all material slots in order', async () => {
  const media = JSON.parse(read('../src/data/recipe-card-media.json'));
  assert.equal(new Set(ids).size, rules.length);
  for (const [i, rule] of rules.entries()) {
    const layout = await layoutSidebar(rule, byId);
    assert.deepEqual(layout.inputs.rows.map(r => r.material.id), recipeCells(rule, 'input'));
    assert.deepEqual(layout.outputs.rows.map(r => r.material.id), recipeCells(rule, 'output'));
    assert.ok(layout.top >= 54);
    assert.equal(layout.connectorTop - (layout.top + layout.inputs.height), 34);
    assert.ok(layout.outputTop + layout.outputs.height <= HEIGHT - 10);
    assert.match(media[ids[i]][0], /^[a-f0-9]{20}$/);
    assert.equal(media[ids[i]][1], 1, 'native contact for recipe ' + ids[i]);
  }
});

test('the longest sidebar uses crisp logo inks, body-aligned icons and identical repeated rows', async () => {
  const rule = rules[ids.indexOf(1739)], layout = await layoutSidebar(rule, byId);
  const ctx = (await drawSidebar(rule, byId)).getContext('2d');
  const rgb = (x, y, width, height) => {
    const pixels = ctx.getImageData(x, y, width, height).data, colors = new Set();
    for (let i = 0; i < pixels.length; i += 4) colors.add((pixels[i] << 16) | (pixels[i+1] << 8) | pixels[i+2]);
    return colors;
  };
  const background = 0x020618;
  assert.deepEqual(rgb(0, 12, SIDEBAR_WIDTH, 42), new Set([background, 0xffffff, 0x29bf3d]));
  assert.deepEqual(rgb(84, layout.outputTop, SIDEBAR_WIDTH - 84, layout.outputs.height), new Set([background, 0xe2e8f0]));
  const inkOnLine = y => rgb(0, y, SIDEBAR_WIDTH, 1).size > 1;
  assert.ok(inkOnLine(layout.connectorTop));
  assert.ok(inkOnLine(layout.outputTop - 35));
  for (let gap = 1; gap <= 34; gap++) {
    assert.ok(!inkOnLine(layout.connectorTop - gap)); assert.ok(!inkOnLine(layout.outputTop - gap));
  }
  const rows = layout.outputs.rows.map((row, i) => {
    const base = layout.outputTop + layout.outputs.baselines[i];
    assert.equal(base % 6, 0);
    assert.ok(rgb(36, base - 1, 36, 1).size > 1);
    assert.deepEqual(rgb(36, base, 36, 1), new Set([background]));
    return Buffer.from(ctx.getImageData(0, base - row.ascent, SIDEBAR_WIDTH, row.row.height).data);
  });
  assert.ok(rows[1].equals(rows[2]));
});

test('loop and poster preserve the sidebar and fill the right panel with square game pixels', async () => {
  const rule = rules[ids.indexOf(4814)], render = await recorder(simulationMaterialRecords(materials));
  const {frames, posterIndex, matches} = render(rule);
  assert.ok(matches > 0);
  const sidebar = await drawSidebar(rule, byId);
  const {animation, poster} = await encodeCard(sidebar, frames, posterIndex);
  const image = await sharp(animation, {animated: true}).metadata();
  assert.equal(image.width, WIDTH); assert.equal(image.pageHeight, HEIGHT); assert.equal(image.loop, 0);
  assert.ok(image.pages >= 2); assert.ok(animation.length <= ANIMATION_LIMIT); assert.ok(poster.length < 5_000_000);
  const first = await sharp(animation, {page: 0, pages: 1}).ensureAlpha().raw().toBuffer();
  const last = await sharp(animation, {page: image.pages-1, pages: 1}).ensureAlpha().raw().toBuffer();
  const still = await sharp(poster).ensureAlpha().raw().toBuffer();
  const side = Buffer.from(sidebar.getContext('2d').getImageData(0, 0, SIDEBAR_WIDTH, HEIGHT).data);
  assert.equal(SIDEBAR_WIDTH + RECIPE_TANK.width * CELL_SCALE, WIDTH);
  assert.equal(RECIPE_TANK.height * CELL_SCALE, HEIGHT);
  assert.ok(!first.equals(last));
  for (const [card, native] of [[first, frames[0]], [last, frames.at(-1)], [still, frames[posterIndex]]]) {
    for (let y = 0; y < HEIGHT; y++) {
      assert.ok(card.subarray(y*WIDTH*4, (y*WIDTH + SIDEBAR_WIDTH)*4).equals(side.subarray(y*SIDEBAR_WIDTH*4, (y+1)*SIDEBAR_WIDTH*4)));
    }
    const cells = Buffer.from(native.buffer, native.byteOffset, native.byteLength);
    for (let y = 0; y < RECIPE_TANK.height; y++) for (let x = 0; x < RECIPE_TANK.width; x++) {
      const color = cells.readUInt32LE((y*RECIPE_TANK.width+x)*4);
      const to = (y*CELL_SCALE*WIDTH + SIDEBAR_WIDTH + x*CELL_SCALE)*4;
      assert.equal(card.readUInt32LE(to), color);
      assert.equal(card.readUInt32LE(to + (CELL_SCALE-1)*(WIDTH+1)*4), color);
    }
  }
});
