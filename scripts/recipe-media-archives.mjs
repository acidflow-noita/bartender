import {createHash} from 'node:crypto';
import {appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {gh, releaseView, openDraft, assetMatches, uploadVerified} from './data/recipe-release-assets.mjs';
import {publicationPlan, recipePart, archiveName, validPublishedRecipe} from './data/recipe-card-inputs.mjs';
import {recipeIds} from './data/recipe-ids.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const cache = join(root, 'build/recipe-cards/site/recipe-media');
const registry = readFileSync(join(root, 'src/data/recipe-card-media.json'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const catalogHash = sha(registry);
const tag = 'recipe-media-' + catalogHash.slice(0, 20);
const repo = 'acidflow-noita/bartender';
const releasesUrl = 'https://github.com/' + repo + '/releases/download/';
const scratch = join(root, 'build/recipe-releases', tag);
const lockFile = join(root, 'src/data/recipe-media-release.json');
const groups = new Map();
for (const [id, [version]] of Object.entries(JSON.parse(registry))) {
  if (!/^[1-9]\d*$/.test(id) || !/^[0-9a-f]{20}$/.test(version)) throw new Error('Invalid recipe media ID or version.');
  const part = Math.floor((Number(id) - 1) / 100) + 1;
  if (!groups.has(part)) groups.set(part, []);
  groups.get(part).push({id, version, name: id + '-' + version});
}
const knownTag = name => /^recipe-media-(?:inputs-)?[0-9a-f]{20}$/.test(name);
const atomic = (file, bytes) => {
  const tmp = file + '.' + process.pid + '.tmp';
  writeFileSync(tmp, bytes); renameSync(tmp, file);
};

function verifyPair(row, webp, png) {
  if (!webp?.length || webp.length > 9_900_000 || !png?.length || png.length >= 5_000_000) return false;
  return createHash('sha256').update(webp).update(png).digest('hex').slice(0, 20) === row.version;
}
function cached(row) {
  try {return verifyPair(row, readFileSync(join(cache,row.name+'.webp')), readFileSync(join(cache,row.name+'.png')));}
  catch (err) {if (err.code === 'ENOENT') return false; throw err;}
}
async function mapLimit(items, limit, fn) {
  const work = Array.from(items), results = new Array(work.length);
  let index = 0;
  await Promise.all(Array.from({length: Math.min(work.length,limit)}, async () => {
    while (index < work.length) {const i = index++; results[i] = await fn(work[i]);}
  }));
  return results;
}
async function download(url, maxBytes) {
  for (let attempt = 1;; attempt++) {
    try {
      const res = await fetch(url, {signal: AbortSignal.timeout(120_000)});
      if (!res.ok) {
        const error = new Error('HTTP ' + res.status + ' from ' + url);
        error.status = res.status;
        throw error;
      }
      if (Number(res.headers.get('content-length')) > maxBytes) throw new Error('Oversized response from ' + url);
      const chunks = []; let length = 0;
      for await (const chunk of res.body) {
        length += chunk.length;
        if (length > maxBytes) throw new Error('Oversized response from ' + url);
        chunks.push(chunk);
      }
      return Buffer.concat(chunks,length);
    } catch (error) {
      if (attempt >= 3 || [401, 403, 404].includes(error.status)) throw error;
      await new Promise(resolve => setTimeout(resolve,attempt*1000));
    }
  }
}

function getLock() {
  const lock = JSON.parse(readFileSync(lockFile, 'utf8'));
  const expectedTag = lock.inputs ? 'recipe-media-inputs-' + lock.inputs.slice(0, 20) : tag;
  if (lock.catalog !== catalogHash || lock.tag !== expectedTag || !knownTag(lock.tag)
      || (lock.inputs && !/^[a-f0-9]{64}$/.test(lock.inputs)) || lock.archives.length !== groups.size) {
    throw new Error('The cooked catalog has changed. Pack and publish the new recipe media before deploying.');
  }
  const expected = new Set([...groups.keys()].map(archiveName));
  for (const archive of lock.archives) {
    if (!expected.delete(archive.name) || (archive.tag !== undefined && !knownTag(archive.tag)) || !/^[a-f0-9]{64}$/.test(archive.sha256)
        || !Number.isSafeInteger(archive.bytes) || archive.bytes <= 0 || archive.bytes >= 2 ** 31) {
      throw new Error('Invalid recipe archive lock entry: ' + archive.name);
    }
  }
  return lock;
}
async function usePublished(rows, concurrency) {
  await mapLimit(rows, concurrency, async row => {
    if (cached(row)) return;
    const prefix = 'https://bartender.runfast.stream/recipe-media/' + row.name;
    const [webp, png] = await Promise.all([download(prefix + '.webp', 9_900_000), download(prefix + '.png', 4_999_999)]);
    if (!verifyPair(row, webp, png)) throw new Error('Published media differs from the cook: ' + row.id);
    atomic(join(cache, row.name + '.webp'), webp);
    atomic(join(cache, row.name + '.png'), png);
  });
}

async function writeArchive(part, rows, directory) {
  const {zipSync} = await import('fflate');
  const files = Object.create(null);
  for (const row of rows) {
    const webp = readFileSync(join(cache, row.name + '.webp')), png = readFileSync(join(cache, row.name + '.png'));
    if (!verifyPair(row, webp, png)) throw new Error('Invalid cooked media for recipe ' + row.id);
    files[row.name + '.webp'] = webp; files[row.name + '.png'] = png;
  }
  const name = archiveName(part), zip = zipSync(files, {level: 0, mtime: new Date(2000, 0, 1)});
  mkdirSync(directory, {recursive: true});
  atomic(join(directory, name), zip);
  return {name, bytes: zip.length, sha256: sha(zip)};
}

async function pack(fromPublished) {
  // Bootstrap a release from already published files only when explicitly requested.
  // Normal publishing uses the bytes produced by the local cook.
  mkdirSync(scratch,{recursive:true}); mkdirSync(cache,{recursive:true});
  const archives = [];
  for (const [part, rows] of groups) {
    if (fromPublished) await usePublished(rows, 12);
    archives.push(await writeArchive(part, rows, scratch));
  }
  const lock={catalog:catalogHash,tag,archives};
  if (fromPublished) {
    if (JSON.stringify(getLock())!==JSON.stringify(lock)) throw new Error('Recovered archives do not match the committed checksums.');
  } else atomic(lockFile,JSON.stringify(lock,null,2)+'\n');
  console.log('Prepared '+archives.length+' verified archives in '+scratch);
}
async function restore(onlyPart = null) {
  const {unzipSync} = await import('fflate');
  const lock=getLock(); mkdirSync(cache,{recursive:true});mkdirSync(scratch,{recursive:true});
  let fetched=0, reusedLive=0;
  await mapLimit([...groups].filter(([part]) => onlyPart === null || onlyPart === part),4,async ([part,rows])=>{
    if (rows.every(cached)) return;
    const name=archiveName(part),record=lock.archives.find(item=>item.name===name);
    const sourceTag = record.tag || lock.tag;
    const directory = join(root, 'build/recipe-releases', sourceTag);
    const path = join(directory, name);
    let bytes=existsSync(path)?readFileSync(path):null;
    if (!bytes || bytes.length!==record.bytes || sha(bytes)!==record.sha256) {
      try {
        bytes = await download(releasesUrl + sourceTag + '/' + name, record.bytes);
      } catch (error) {
        if (error.status !== 404) throw error;
        // A new archive of an existing live catalog can be published while
        // this build runs. Only accept the exact, already cooked production bytes.
        await usePublished(rows, 3);
        reusedLive += rows.length;
        return;
      }
      if (bytes.length!==record.bytes || sha(bytes)!==record.sha256) throw new Error('Recipe archive checksum mismatch: '+name);
      // Keep an offline archive locally. CI already stages the verified image files.
      if (!process.env.CI) {mkdirSync(directory, {recursive: true}); atomic(path, bytes);}
      fetched++;
    }
    const allowed=new Set(rows.flatMap(r=>[r.name+'.webp',r.name+'.png']));
    const files=unzipSync(bytes,{filter:entry=>allowed.has(entry.name)&&entry.originalSize<=9_900_000});
    for(const row of rows){
      const webp=files[row.name+'.webp'],png=files[row.name+'.png'];
      if(!verifyPair(row,webp,png))throw new Error('Invalid media in '+name+' for recipe '+row.id);
      atomic(join(cache,row.name+'.webp'),webp);atomic(join(cache,row.name+'.png'),png);
    }
  });
  console.log('Prepared static recipe files for upload. Downloaded ' + fetched + ' prebuilt archives; reused ' + reusedLive + ' already published pairs.');
}
async function publish(withCatalog = false){
  const lock=getLock();
  for(const a of lock.archives)if(sha(readFileSync(join(scratch,a.name)))!==a.sha256)throw new Error('Repack the local cook before publishing '+a.name);
  const assets = lock.archives.map(archive => ({...archive, path: join(scratch, archive.name)}));
  if (withCatalog) {
    for (const name of ['recipe-card-media.json', 'recipe-media-release.json']) {
      const path = join(root, 'src/data', name), bytes = readFileSync(path);
      assets.push({name, path, bytes: bytes.length, sha256: sha(bytes)});
    }
  }
  const remote = openDraft(tag);
  await uploadVerified(tag, assets);
  if (remote.isDraft) gh(['release','edit',tag,'--draft=false','--latest=false']);
  console.log('Published prebuilt media ' + tag);
}
const catalogFiles = ['recipe-card-media.json', 'recipe-media-release.json', 'recipe-card-inputs.json'];
const readJson = path => JSON.parse(readFileSync(path));
const batchReceipt = part => archiveName(part).replace('.zip', '.json');
const output = (name, value) => {if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, name + '=' + value + '\n');};
const catalogDir = join(root, 'src/data');

function releaseFile(dir, name) {
  const path = join(dir, name), bytes = readFileSync(path);
  return {name, path, bytes: bytes.length, sha256: sha(bytes)};
}

function checkedDownload(plan, remote, name, dir) {
  mkdirSync(dir, {recursive: true});
  gh(['release','download',plan.tag,'--pattern',name,'--dir',dir,'--clobber']);
  const file = releaseFile(dir, name), asset = remote.assets.find(a => a.name === name);
  if (!assetMatches(asset, file)) throw new Error('Invalid release file ' + name);
  return readJson(file.path);
}

function verifyBatch(plan, part, receipt, remote) {
  const expected = Object.keys(plan.keys).filter(id => recipePart(id) === part);
  if (receipt.inputs !== plan.inputs || receipt.archive.name !== archiveName(part) || Object.keys(receipt.media).length !== expected.length
      || expected.some(id => !validPublishedRecipe(receipt.media[id]))
      || !assetMatches(remote.assets.find(a => a.name === receipt.archive.name), receipt.archive)) {
    throw new Error('Recipe batch failed verification ' + part);
  }
}

async function batchCommand(mode, part) {
  const plan = publicationPlan(), dir = join(root, 'build/recipe-releases', plan.tag);
  if (mode === 'open') {
    const remote = openDraft(plan.tag);
    output('published', !remote.isDraft);
    console.log((remote.isDraft ? 'Preparing ' : 'Reusing published release ') + plan.tag);
    return;
  }
  const remote = releaseView(plan.tag);
  if (!remote) throw new Error('Missing recipe preview release ' + plan.tag);
  if (mode === 'batch-status' || mode === 'upload-batch') {
    if (!plan.parts.includes(part)) throw new Error('Unexpected recipe batch ' + part);
    if (!remote.isDraft) {output('saved', true); output('restore', false); return;}
    const name = batchReceipt(part);
    const saved = remote.assets.some(a => a.name === name && a.digest) && remote.assets.some(a => a.name === archiveName(part) && a.digest);
    if (saved) verifyBatch(plan, part, checkedDownload(plan, remote, name, dir), remote);
    if (mode === 'batch-status') {
      output('saved', saved); output('restore', !saved && plan.restoreParts.has(part));
      console.log(saved ? 'Reusing verified batch ' + part : 'Preparing batch ' + part);
      return;
    }
    if (saved) return;
    const media = readJson(join(root, 'build/recipe-cards/parts', part + '.json'));
    const rows = Object.entries(media).map(([id,[version]]) => ({id, version, name: id + '-' + version}));
    const archive = await writeArchive(part, rows, dir);
    const maxAnimationBytes = Math.max(...rows.map(row => statSync(join(cache, row.name + '.webp')).size));
    atomic(join(dir, name), JSON.stringify({inputs: plan.inputs, media, archive, maxAnimationBytes}) + '\n');
    await uploadVerified(plan.tag, [{...archive, path: join(dir, archive.name)}, releaseFile(dir, name)]);
    console.log('Saved and verified batch ' + part + ' on GitHub.');
    return;
  }

  // Allocate new public IDs on this fresh checkout before committing the generated data.
  recipeIds(readJson(join(catalogDir, 'jsons/reactions.json')), true);
  if (!remote.isDraft) {
    const [media, lock, inputs] = catalogFiles.map(name => checkedDownload(plan, remote, name, dir));
    if (lock.tag !== plan.tag || lock.inputs !== plan.inputs || lock.catalog !== sha(readFileSync(join(dir, catalogFiles[0])))
        || sha(JSON.stringify(inputs)) !== plan.inputs || Object.keys(media).length !== Object.keys(plan.keys).length
        || Object.keys(plan.keys).some(id => !validPublishedRecipe(media[id]))) throw new Error('Published recipe catalog failed verification.');
    for (const name of catalogFiles) atomic(join(catalogDir, name), readFileSync(join(dir, name)));
    console.log('Reused the verified catalog from ' + plan.tag);
    return;
  }
  const oldLock = getLock(), oldMedia = JSON.parse(registry), updated = new Map(), archives = [];
  const active = [...new Set(Object.keys(plan.keys).map(recipePart))].sort((a,b) => a-b);
  let maxUpdated = 0;
  if (plan.parts.length) {
    mkdirSync(dir, {recursive: true});
    gh(['release','download',plan.tag,'--pattern','recipes-*.json','--dir',dir,'--clobber']);
  }
  for (const number of active) {
    if (plan.parts.includes(number)) {
      const name = batchReceipt(number);
      if (!assetMatches(remote.assets.find(a => a.name === name), releaseFile(dir, name))) throw new Error('Invalid batch receipt ' + name);
      const receipt = readJson(join(dir, name));
      verifyBatch(plan, number, receipt, remote);
      updated.set(number, receipt.media); archives.push(receipt.archive);
      maxUpdated = Math.max(maxUpdated, receipt.maxAnimationBytes);
    } else {
      const old = oldLock.archives.find(a => a.name === archiveName(number));
      if (!old) throw new Error('Missing published archive for batch ' + number);
      archives.push({...old, tag: old.tag || oldLock.tag});
    }
  }
  const entries = Object.keys(plan.keys).map(id => {
    const record = (updated.get(recipePart(id)) ?? oldMedia)[id];
    if (!validPublishedRecipe(record)) throw new Error('Missing published recipe ' + id);
    return [id, record];
  });
  const mediaBytes = JSON.stringify(Object.fromEntries(entries)) + '\n';
  const lock = {catalog: sha(mediaBytes), inputs: plan.inputs, tag: plan.tag, archives};
  atomic(join(catalogDir, catalogFiles[0]), mediaBytes);
  atomic(lockFile, JSON.stringify(lock, null, 2) + '\n');
  atomic(join(catalogDir, catalogFiles[2]), JSON.stringify(plan.snapshot, null, 2) + '\n');
  await uploadVerified(plan.tag, catalogFiles.map(name => releaseFile(catalogDir, name)));
  gh(['release','edit',plan.tag,'--draft=false','--latest=false']);
  console.log(JSON.stringify({tag: plan.tag, cards: entries.length, archives: archives.length, maxUpdatedAnimationBytes: maxUpdated}));
}

const mode=process.argv[2];
if(mode==='pack')await pack(false);
else if(mode==='restore')await restore(process.argv[3] ? Number(process.argv[3]) : null);
else if(['open','batch-status','upload-batch','finish'].includes(mode)) await batchCommand(mode, Number(process.argv[3]));
else if(mode==='archive-published'){
  const ref = process.env.GITHUB_REF_NAME;
  if (ref !== 'main' && ref !== 'archive-published-recipes-' + catalogHash.slice(0,20)) throw new Error('The archive tag must match the approved catalog.');
  const existing = gh(['release','view',tag,'--json','isDraft,assets'],true);
  const published = existing && JSON.parse(existing);
  const complete = published && !published.isDraft && getLock().archives.every(a =>
    published.assets.some(item => item.name === a.name && item.size === a.bytes && item.digest === 'sha256:' + a.sha256));
  if (complete) console.log('The verified media release already exists.');
  else {await pack(true);await publish();}
}
else if(mode==='publish')await publish(process.argv.includes('--with-catalog'));
else throw new Error('Expected pack, restore, publish or archive-published.');
