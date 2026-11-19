import {fork} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync, existsSync} from 'node:fs';
import {availableParallelism} from 'node:os';
import {resolve, join, basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {recipeIds} from './data/recipe-ids.mjs';
import {captionRows, drawBanner} from './recipe-cards/banner.mjs';
import {encodeCard, ANIMATION_LIMIT} from './recipe-cards/encode.mjs';
import {recorder} from './recipe-cards/record.mjs';
import {simulationMaterialRecords} from '../src/liquids/materials.mjs';

const root = fileURLToPath(new URL('../', import.meta.url)), script = fileURLToPath(import.meta.url);
const read = p => readFileSync(join(root, p));
const json = p => JSON.parse(read(p));
const allMaterials = json('src/data/FULL_MATERIALS_FINAL.json'), rules = json('src/data/jsons/reactions.json');
const byId = new Map(allMaterials.map(m => [m.id, m]));
const out = join(root, 'build/recipe-cards'), media = join(out, 'site/recipe-media'), state = join(out, 'state');
const sha = (...parts) => {const hash = createHash('sha256'); for (const part of parts) hash.update(part); return hash.digest('hex');};
const atomic = (path, value) => {const temp = path + '.' + process.pid + '.tmp'; writeFileSync(temp, value); renameSync(temp, path);};
const mediaFile = (id, hash, ext) => join(media, id + '-' + hash + '.' + ext);
const stateFile = id => join(state, id + '.json');

async function worker() {
  const capture = await recorder(simulationMaterialRecords(allMaterials));
  process.on('message', async job => {
    if (!job) {process.disconnect(); return;}
    try {
      const {id, index, key} = job, rule = rules[index];
      const banner = await drawBanner(rule, byId);
      let seed = 1, clip = capture(rule, seed);
      // Choose a reproducible natural encounter for short-lived or rare pairs.
      while (!clip.matches && seed < 24) clip = capture(rule, ++seed);
      const {frames, posterIndex, matches, firstMatch, ticks} = clip;
      const {animation, poster} = await encodeCard(banner, frames, posterIndex);
      const hash = sha(animation, poster).slice(0, 20);
      atomic(mediaFile(id, hash, 'webp'), animation); atomic(mediaFile(id, hash, 'png'), poster);
      atomic(stateFile(id), JSON.stringify({id, key, hash, webp: animation.length, png: poster.length, seed, matches, firstMatch, ticks, frames: frames.length}));
      process.send({id});
    } catch (err) {console.error('Recipe ' + job.id, err); process.exitCode = 1; process.disconnect();}
  });
  process.send({ready: true});
}

function renderKey() {
  const hash = createHash('sha256');
  const directories = ['src/liquids','scripts/recipe-cards'];
  const files = directories.flatMap(dir => readdirSync(join(root, dir)).sort().map(name => join(dir, name)));
  files.push('scripts/render-recipe-cards.mjs', 'src/reactions/experiment.js', 'src/data/FULL_MATERIALS_FINAL.json', 'public/liquids/mina_outline.png', 'public/liquids/texture-manifest.json');
  for (const p of files) hash.update(read(p));
  for (const name of ['@napi-rs/canvas','sharp']) hash.update(json('node_modules/' + name + '/package.json').version);
  return hash.digest('hex');
}

async function generate() {
  const {values, positionals} = parseArgs({options: {jobs: {type: 'string'}}, allowPositionals: true});
  const workers = Number(values.jobs ?? Math.min(8, availableParallelism()));
  if (!Number.isSafeInteger(workers) || workers < 1) throw new Error('--jobs must be a positive integer.');
  mkdirSync(media, {recursive: true}); mkdirSync(state, {recursive: true});
  const ids = recipeIds(rules, true), wanted = new Set(positionals.map(Number));
  for (const id of wanted) if (!ids.includes(id)) throw new Error('Unknown recipe ' + id);
  const version = renderKey(), iconHashes = new Map(), queue = [];
  for (const [index, rule] of rules.entries()) {
    const slots = captionRows(rule, byId).flat();
    const id = ids[index];
    if (wanted.size && !wanted.has(id)) continue;
    const icons = slots.map(({material}) => {
      const name = material.image_local || 'Material_' + material.id + '.png';
      if (basename(name) !== name) throw new Error('Unexpected icon path');
      if (!iconHashes.has(name)) iconHashes.set(name, sha(read('src/data/images/materials/' + name)));
      return iconHashes.get(name);
    });
    const key = sha(version, JSON.stringify(rule), ...icons);
    if (existsSync(stateFile(id))) {
      const saved = JSON.parse(readFileSync(stateFile(id)));
      if (saved.key === key && ['webp','png'].every(ext => {
        const path = mediaFile(id, saved.hash, ext);
        return existsSync(path) && statSync(path).size === saved[ext];
      })) continue;
    }
    queue.push({id, index, key});
  }
  console.log('Validated all ' + ids.length + ' banners. Rendering ' + queue.length + ' cards.');
  let current = 0, completed = 0;
  const children = [];
  try {
    await Promise.all(Array.from({length: Math.min(workers, queue.length)}, () => new Promise((done, fail) => {
      const child = fork(script, ['--worker'], {execArgv: [], env: {...process.env, RAYON_NUM_THREADS: '1', TOKIO_WORKER_THREADS: '1'}});
      children.push(child);
      child.on('error', fail);
      child.on('exit', (code, signal) => code === 0 ? done() : fail(new Error('Card renderer stopped: ' + (signal ?? code))));
      child.on('message', message => {
        if (message.id && ++completed % 100 === 0) console.log(completed + ' / ' + queue.length);
        child.send(current < queue.length ? queue[current++] : null);
      });
    })));
  } finally {for (const child of children) if (child.exitCode === null) child.kill();}
  atomic(join(out, 'site/_headers'), '/recipe-media/*\n  Cache-Control: public, max-age=31536000, immutable\n');
  if (wanted.size) return;
  const records = ids.map(id => JSON.parse(readFileSync(stateFile(id))));
  const manifest = Object.fromEntries(records.map(row => [row.id, [row.hash, Number(row.matches > 0), row.seed]]));
  if (records.some(r => r.webp > ANIMATION_LIMIT || r.png >= 5_000_000)) throw new Error('Card size limit exceeded');
  const quiet = records.filter(r => !r.matches).map(r => r.id);
  if (quiet.length) throw new Error('No recorded contact for recipes ' + quiet.join(', '));
  atomic(join(root, 'src/data/recipe-card-media.json'), JSON.stringify(manifest) + '\n');
  console.log(JSON.stringify({cards: records.length, maxAnimationBytes: Math.max(...records.map(r => r.webp)), unobserved: quiet.length, bytes: records.reduce((sum, r) => sum + r.webp + r.png, 0)}));
}
if (process.argv.includes('--worker')) await worker(); else await generate();
