import {fork} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, renameSync, writeFileSync, existsSync} from 'node:fs';
import {availableParallelism} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {recipeIds} from './data/recipe-ids.mjs';
import {layoutSidebar} from './recipe-cards/sidebar.mjs';
import {ANIMATION_LIMIT} from './recipe-cards/encode.mjs';
import {createCardRecorder} from './recipe-cards/render-card.mjs';
import {retimeRecipeWebp} from './recipe-cards/timing.mjs';
import {recipeInputKeys, publishedInputs, previewTiming, validPublishedRecipe, recipePart} from './data/recipe-card-inputs.mjs';

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
  const capture = await createCardRecorder(allMaterials, byId);
  process.on('message', async job => {
    if (!job) {process.disconnect(); return;}
    try {
      const {id, index, key} = job, rule = rules[index];
      const {animation, poster, ...recording} = await capture(rule);
      const hash = sha(animation, poster).slice(0, 20);
      atomic(mediaFile(id, hash, 'webp'), animation); atomic(mediaFile(id, hash, 'png'), poster);
      atomic(stateFile(id), JSON.stringify({id, key, hash, webp: animation.length, png: poster.length, ...recording}));
      process.send({id});
    } catch (err) {console.error('Recipe ' + job.id, err); process.exitCode = 1; process.disconnect();}
  });
  process.send({ready: true});
}

function readPair(id, version) {
  const paths = ['webp', 'png'].map(ext => mediaFile(id, version, ext));
  if (!paths.every(path => existsSync(path))) return null;
  const [webp, png] = paths.map(path => readFileSync(path));
  if (sha(webp, png).slice(0, 20) !== version) return null;
  return {webp, png};
}

async function generate() {
  const {values, positionals} = parseArgs({options: {jobs: {type: 'string'}, part: {type: 'string'}}, allowPositionals: true});
  const workers = Number(values.jobs ?? Math.min(8, availableParallelism()));
  if (!Number.isSafeInteger(workers) || workers < 1) throw new Error('--jobs must be a positive integer.');
  mkdirSync(media, {recursive: true}); mkdirSync(state, {recursive: true});
  const ids = recipeIds(rules, true), wanted = new Set(positionals.map(Number));
  const part = values.part === undefined ? null : Number(values.part);
  if (part !== null && (!Number.isSafeInteger(part) || part < 1 || wanted.size)) throw new Error('Invalid recipe batch.');
  for (const id of wanted) if (!ids.includes(id)) throw new Error('Unknown recipe ' + id);
  const selectedIds = part === null ? ids : ids.filter(id => recipePart(id) === part);
  if (part !== null && !selectedIds.length) throw new Error('Empty recipe batch.');
  const keys = recipeInputKeys(allMaterials, rules, ids, json('src/data/reaction-share-ids.json'));
  const previous = publishedInputs(), timing = previewTiming(previous.frameDelays);
  const timingKey = JSON.stringify(timing.after), published = json('src/data/recipe-card-media.json');
  let retimed = 0;
  const reuse = new Map(), queue = [];
  for (const [index, rule] of rules.entries()) {
    const id = ids[index];
    if ((part !== null && recipePart(id) !== part) || (wanted.size && !wanted.has(id))) continue;
    const key = sha(keys[id], timingKey), entry = published[id];
    if (timing.canRetime && previous.recipes[id] === keys[id] && validPublishedRecipe(entry)) {
      let [version] = entry;
      const pair = readPair(id, version);
      if (pair) {
        if (!timing.current) {
          const corrected = retimeRecipeWebp(pair.webp, previous.frameDelays, timing.after);
          const next = sha(corrected, pair.png).slice(0, 20);
          atomic(mediaFile(id, next, 'webp'), corrected); atomic(mediaFile(id, next, 'png'), pair.png);
          atomic(stateFile(id), JSON.stringify({id, key, hash: next, webp: corrected.length, png: pair.png.length,
            matches: true, seed: entry[2], frames: timing.after.length}));
          version = next; retimed++;
        }
        reuse.set(id, {id, hash: version, matches: true, seed: entry[2], webp: pair.webp.length, png: pair.png.length});
        continue;
      }
    }
    if (existsSync(stateFile(id))) {
      const saved = JSON.parse(readFileSync(stateFile(id)));
      if (saved.key === key && saved.matches && readPair(id, saved.hash)) continue;
    }
    await layoutSidebar(rule, byId);
    queue.push({id, index, key});
  }
  console.log('Recipe previews to render (' + queue.length + '), retimed (' + retimed + ') and reused (' + (reuse.size - retimed) + ').');
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
  const records = selectedIds.map(id => reuse.get(id) ?? JSON.parse(readFileSync(stateFile(id))));
  const manifest = Object.fromEntries(records.map(row => [row.id, [row.hash, Number(row.matches > 0), row.seed]]));
  if (records.some(r => r.webp > ANIMATION_LIMIT || r.png >= 5_000_000)) throw new Error('Card size limit exceeded');
  const quiet = records.filter(r => !r.matches).map(r => r.id);
  if (quiet.length) throw new Error('No recorded contact for recipes ' + quiet.join(', '));
  if (part !== null) {
    mkdirSync(join(out, 'parts'), {recursive: true});
    atomic(join(out, 'parts', part + '.json'), JSON.stringify(manifest) + '\n');
    console.log('Verified ' + records.length + ' recipe pairs. Largest animation is ' + Math.max(...records.map(r => r.webp)) + ' bytes.');
    return;
  }
  atomic(join(root, 'src/data/recipe-card-media.json'), JSON.stringify(manifest) + '\n');
  atomic(join(root, 'src/data/recipe-card-inputs.json'), JSON.stringify({frameDelays: timing.after, recipes: keys}, null, 2) + '\n');
  console.log(JSON.stringify({cards: records.length, maxAnimationBytes: Math.max(...records.map(r => r.webp)), unobserved: quiet.length, bytes: records.reduce((sum, r) => sum + r.webp + r.png, 0)}));
}
if (process.argv.includes('--worker')) await worker(); else await generate();
