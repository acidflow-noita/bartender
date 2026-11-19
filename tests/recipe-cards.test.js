import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import sharp from 'sharp';
import {assignRecipeIds, recipeIds} from '../scripts/data/recipe-ids.mjs';
import {recipePathId, readReactionState, reactionUrl} from '../src/components/reactionUrl.js';
import {renderPageShell} from '../scripts/render-page-shell.mjs';
import {captionRows, drawBanner, WIDTH, HEIGHT, BANNER_HEIGHT} from '../scripts/recipe-cards/banner.mjs';
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
    assert.deepEqual(gallery.items[0], {media: {url: animation}, description: doc.querySelector('meta[property="og:image:alt"]').content});
    assert.equal(row.type, 1);
    assert.deepEqual(row.components.map(button => [button.type, button.style, button.url]), [
      [2, 5, doc.querySelector('link[rel="canonical"]').href], [2, 5, animation],
    ]);
  }
  const unsafe = recipeCard(1, {1: {title: '</script><script id="unexpected">', description: '', version: 'abc'}});
  const head = new JSDOM(withRecipeMetadata(template, unsafe)).window.document.head;
  const payload = JSON.parse(head.querySelector('script[id="discord:component-embed"]').textContent);
  assert.equal(payload.component.components[0].items[0].description, unsafe.alt);
  assert.equal(head.querySelector('#unexpected'), null);
  assert.throws(() => withRecipeMetadata(template, {...unsafe, alt: '氷'.repeat(1000)}), /3,000 bytes/);
  assert.doesNotMatch(renderPageShell(template, '/reactions'), /discord:component-embed/);
});

test('the complete catalog fits the fixed-size banner with all ingredient and output icons', () => {
  const media = JSON.parse(read('../src/data/recipe-card-media.json'));
  assert.equal(new Set(ids).size,rules.length);
  for (const [i,rule] of rules.entries()) {
    const [inputs,outputs] = captionRows(rule,byId);
    assert.equal(inputs.length,[rule.input_cell1,rule.input_cell2,rule.input_cell3].filter(Boolean).length);
    assert.equal(outputs.length,[rule.output_cell1,rule.output_cell2,rule.output_cell3].filter(Boolean).length);
    assert.match(media[ids[i]][0],/^[a-f0-9]{20}$/);
    assert.equal(media[ids[i]][1],1,'native contact for recipe '+ids[i]);
  }
});

test('the frog recipe loop changes the tank pixels and preserves the icon banner in every frame', async () => {
  const rule = rules[ids.indexOf(4814)], render = await recorder(simulationMaterialRecords(materials));
  const {frames,posterIndex,matches} = render(rule);
  assert.ok(matches > 0);
  const {animation,poster} = await encodeCard(await drawBanner(rule,byId),frames,posterIndex);
  const image = await sharp(animation,{animated:true}).metadata();
  assert.equal(image.width,WIDTH); assert.equal(image.pageHeight,HEIGHT); assert.equal(image.loop,0);
  assert.ok(image.pages>=2); assert.ok(animation.length<=ANIMATION_LIMIT); assert.ok(poster.length<5_000_000);
  const first = await sharp(animation,{page:0,pages:1}).ensureAlpha().raw().toBuffer();
  const last = await sharp(animation,{page:image.pages-1,pages:1}).ensureAlpha().raw().toBuffer();
  const bannerEnd = WIDTH*BANNER_HEIGHT*4;
  assert.deepEqual(first.subarray(0,bannerEnd),last.subarray(0,bannerEnd));
  assert.notDeepEqual(first.subarray(bannerEnd),last.subarray(bannerEnd));
  for (let y=0;y<56;y++) for (let x=0;x<96;x++) {
    const source=(y*96+x)*4, target=((BANNER_HEIGHT+y*6)*WIDTH+(WIDTH-96*6)/2+x*6)*4;
    assert.deepEqual([...last.subarray(target,target+4)],[...frames.at(-1).subarray(source,source+4)]);
  }
});
