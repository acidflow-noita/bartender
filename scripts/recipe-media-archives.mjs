import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, renameSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {zipSync, unzipSync} from 'fflate';

const root = fileURLToPath(new URL('../', import.meta.url));
const cache = join(root, 'build/recipe-cards/site/recipe-media');
const registry = readFileSync(join(root, 'src/data/recipe-card-media.json'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const catalogHash = sha(registry);
const tag = 'recipe-media-' + catalogHash.slice(0, 20);
const repo = 'acidflow-noita/bartender';
const release = 'https://github.com/' + repo + '/releases/download/' + tag;
const scratch = join(root, 'build/recipe-releases', tag);
const lockFile = join(root, 'src/data/recipe-media-release.json');
const groups = new Map();
for (const [id, [version]] of Object.entries(JSON.parse(registry))) {
  if (!/^[1-9]\d*$/.test(id) || !/^[0-9a-f]{20}$/.test(version)) throw new Error('Invalid recipe media ID or version.');
  const part = Math.floor((Number(id) - 1) / 100) + 1;
  if (!groups.has(part)) groups.set(part, []);
  groups.get(part).push({id, version, name: id + '-' + version});
}
const archiveName = part => 'recipes-' + String(part).padStart(3, '0') + '.zip';
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
  if (lock.catalog !== catalogHash || lock.tag !== tag || lock.archives.length !== groups.size) {
    throw new Error('The cooked catalog has changed. Pack and publish the new recipe media before deploying.');
  }
  const expected = new Set([...groups.keys()].map(archiveName));
  for (const archive of lock.archives) {
    if (!expected.delete(archive.name) || !/^[a-f0-9]{64}$/.test(archive.sha256)
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

async function pack(fromPublished) {
  // Bootstrap a release from already published files only when explicitly requested.
  // Normal publishing uses the bytes produced by the local cook.
  mkdirSync(scratch,{recursive:true}); mkdirSync(cache,{recursive:true});
  const archives = [];
  for (const [part, rows] of groups) {
    if (fromPublished) await usePublished(rows, 12);
    const files = Object.create(null);
    for (const row of rows) {
      const webp = readFileSync(join(cache,row.name+'.webp')), png=readFileSync(join(cache,row.name+'.png'));
      if (!verifyPair(row,webp,png)) throw new Error('Invalid cooked media for recipe '+row.id);
      files[row.name+'.webp']=webp; files[row.name+'.png']=png;
    }
    // Both formats are compressed already. Stored ZIP entries unpack without recompression.
    const name=archiveName(part), zip=zipSync(files,{level:0,mtime:new Date(2000,0,1)});
    atomic(join(scratch,name),zip);
    archives.push({name,bytes:zip.length,sha256:sha(zip)});
  }
  const lock={catalog:catalogHash,tag,archives};
  if (fromPublished) {
    if (JSON.stringify(getLock())!==JSON.stringify(lock)) throw new Error('Recovered archives do not match the committed checksums.');
  } else atomic(lockFile,JSON.stringify(lock,null,2)+'\n');
  console.log('Prepared '+archives.length+' verified archives in '+scratch);
}
async function restore() {
  const lock=getLock(); mkdirSync(cache,{recursive:true});mkdirSync(scratch,{recursive:true});
  let fetched=0, reusedLive=0;
  await mapLimit([...groups],4,async ([part,rows])=>{
    if (rows.every(cached)) return;
    const name=archiveName(part),record=lock.archives.find(item=>item.name===name);
    const path=join(scratch,name);
    let bytes=existsSync(path)?readFileSync(path):null;
    if (!bytes || bytes.length!==record.bytes || sha(bytes)!==record.sha256) {
      try {
        bytes = await download(release + '/' + name, record.bytes);
      } catch (error) {
        if (error.status !== 404) throw error;
        // A new archive of an existing live catalog can be published while
        // this build runs. Only accept the exact, already cooked production bytes.
        await usePublished(rows, 3);
        reusedLive += rows.length;
        return;
      }
      if (bytes.length!==record.bytes || sha(bytes)!==record.sha256) throw new Error('Recipe archive checksum mismatch: '+name);
      atomic(path,bytes);fetched++;
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
function gh(args, optional=false){
  const r=spawnSync('gh',[...args,'--repo',repo],{encoding:'utf8'});
  if(r.error)throw new Error('GitHub CLI is required only for publishing prepared media. '+r.error.message);
  if(r.status!==0&&!optional)throw new Error(r.stderr.trim());
  return r.status===0?r.stdout:null;
}
function publish(withCatalog = false){
  const lock=getLock();
  for(const a of lock.archives)if(sha(readFileSync(join(scratch,a.name)))!==a.sha256)throw new Error('Repack the local cook before publishing '+a.name);
  const found=gh(['release','view',tag,'--json','isDraft,assets'],true);
  const remote=found?JSON.parse(found):null;
  if(!remote)gh(['release','create',tag,'--draft','--latest=false','--title','Cooked recipe media '+catalogHash.slice(0,12),'--notes','Prebuilt static recipe animations and posters.','--target',process.env.GITHUB_SHA||'main']);
  const assets = lock.archives.map(archive => ({...archive, path: join(scratch, archive.name)}));
  if (withCatalog) {
    for (const name of ['recipe-card-media.json', 'recipe-media-release.json']) {
      const path = join(root, 'src/data', name), bytes = readFileSync(path);
      assets.push({name, path, bytes: bytes.length, sha256: sha(bytes)});
    }
  }
  const pending=[];
  for(const a of assets){
    const item=remote?.assets.find(v=>v.name===a.name);
    if(item && item.size===a.bytes && (!item.digest || item.digest==='sha256:'+a.sha256))continue;
    if(item || remote?.isDraft===false)throw new Error('Published assets differ for '+a.name);
    pending.push(a.path);
  }
  if(pending.length)gh(['release','upload',tag,...pending]);
  if(!remote || remote.isDraft)gh(['release','edit',tag,'--draft=false','--latest=false']);
  console.log('Published prebuilt media '+tag);
}
const mode=process.argv[2];
if(mode==='pack')await pack(false);
else if(mode==='restore')await restore();
else if(mode==='archive-published'){
  const ref = process.env.GITHUB_REF_NAME;
  if (ref !== 'main' && ref !== 'archive-published-recipes-' + catalogHash.slice(0,20)) throw new Error('The archive tag must match the approved catalog.');
  const existing = gh(['release','view',tag,'--json','isDraft,assets'],true);
  const published = existing && JSON.parse(existing);
  const complete = published && !published.isDraft && getLock().archives.every(a =>
    published.assets.some(item => item.name === a.name && item.size === a.bytes && item.digest === 'sha256:' + a.sha256));
  if (complete) console.log('The verified media release already exists.');
  else {await pack(true);publish();}
}
else if(mode==='publish')publish(process.argv.includes('--with-catalog'));
else throw new Error('Expected pack, restore, publish or archive-published.');
