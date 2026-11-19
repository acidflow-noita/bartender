import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,copyFileSync,writeFileSync,readFileSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const source=fileURLToPath(new URL('../',import.meta.url));
test('the normal site build stages cooked media without invoking the image renderer',()=>{
  const {scripts}=JSON.parse(readFileSync(join(source,'package.json')));
  assert.doesNotMatch([scripts.prebuild,scripts.build,scripts.postbuild].join(' '),/render-recipe-cards|recipes:render/);
  assert.match(scripts.postbuild,/recipe-media-archives\.mjs restore/);
  assert.match(scripts['recipes:render'],/render-recipe-cards/);
});

test('a clean checkout can restore exact cooked bytes from a verified snapshot',t=>{
  const root=mkdtempSync(join(tmpdir(),'bartender-archive-test-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const script=join(root,'scripts/recipe-media-archives.mjs'),data=join(root,'src/data'),cache=join(root,'build/recipe-cards/site/recipe-media');
  mkdirSync(join(root,'scripts'));mkdirSync(data,{recursive:true});mkdirSync(cache,{recursive:true});
  copyFileSync(join(source,'scripts/recipe-media-archives.mjs'),script);
  symlinkSync(join(source,'node_modules'),join(root,'node_modules'),'dir');
  const files={webp:Buffer.from([82,73,70,70,1,2,3]),png:Buffer.from([137,80,78,71,4,5])};
  const hash=createHash('sha256').update(files.webp).update(files.png).digest('hex').slice(0,20);
  const name='4814-'+hash;
  for(const [ext,bytes] of Object.entries(files))writeFileSync(join(cache,name+'.'+ext),bytes);
  const registry=join(data,'recipe-card-media.json');writeFileSync(registry,JSON.stringify({4814:[hash,1,1]}));
  const run=mode=>spawnSync(process.execPath,[script,mode],{cwd:root,encoding:'utf8',timeout:10000});
  const packed=run('pack');assert.equal(packed.status,0,packed.stderr);
  rmSync(cache,{recursive:true}); // No cooked files and no simulator in this checkout.
  const restored=run('restore');assert.equal(restored.status,0,restored.stderr);
  for(const [ext,bytes] of Object.entries(files))assert.deepEqual(readFileSync(join(cache,name+'.'+ext)),bytes);
  writeFileSync(join(cache,name+'.png'),'bad');assert.equal(run('restore').status,0);
  assert.deepEqual(readFileSync(join(cache,name+'.png')),files.png);
  writeFileSync(registry,JSON.stringify({4814:[hash,1,2]}));
  const stale=run('restore');assert.notEqual(stale.status,0);assert.match(stale.stderr,/cooked catalog has changed/i);
});
