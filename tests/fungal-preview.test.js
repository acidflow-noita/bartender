// HTTP transport checks only: no browser, screenshots, or DOM execution.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync, mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {createServer} from "vite";
import {init, parse} from "es-module-lexer";
const modules = ["main", "fungal", "fungal_materials", "nolla_prng"];

async function createPreview(t, options = {}) {
  const cacheDir = mkdtempSync(join(tmpdir(), 'bartender-vite-test-'));
  let app;
  t.after(async () => {
    try { await app?.close(); } finally { rmSync(cacheDir, {recursive: true, force: true}); }
  });
  app = await createServer({configFile: resolve('vite.config.js'), cacheDir,
    server: {host: '127.0.0.1', port: 0, strictPort: false}, logLevel: 'error', ...options});
  await app.listen();
  return app;
}

test("Vite serves every page, dataset and the fungal worker module graph", {timeout: 30000}, async (t) => {
  await init();
  const app = await createPreview(t);
  const base = "http://127.0.0.1:" + app.httpServer.address().port;
  for (const path of ["/", "/digging", "/materials", "/reactions", "/reactions_graph_finder", "/fungal_shifting", "/thanks"]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /<meta name="darkreader-lock">/);
  }
  const queue = [new URL("/app.js", base), new URL("/fungal/search-worker.js", base)];
  const visited = new Set();
  while (queue.length) {
    const url = queue.shift();
    if (visited.has(url.href)) continue;
    visited.add(url.href);
    const response = await fetch(url, {signal: AbortSignal.timeout(10000)});
    const code = await response.text();
    assert.equal(response.status, 200, url.pathname + ': ' + code.slice(0, 200));
    assert.match(response.headers.get('content-type') ?? '', /(?:java|ecma)script/, url.href);
    for (const imported of parse(code)[0]) {
      if (!imported.specifier || imported.specifier.startsWith('data:')) continue;
      assert.match(imported.specifier, /^(?:\.{1,2}\/|\/)/, 'unresolved import: ' + imported.specifier);
      const dependency = new URL(imported.specifier, url);
      if (/\.(css|scss)$/.test(dependency.pathname)) dependency.searchParams.set('import', '');
      queue.push(dependency);
    }
  }
  for (const name of modules) assert.ok([...visited].some(url => url.includes('/vendor/noita-fungal/' + name + '.mjs')));
  const manifest = JSON.parse(readFileSync(new URL('../src/generated/data-manifest.json', import.meta.url)));
  for (const path of Object.values(manifest)) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, path);
    assert.deepEqual(await response.json(), JSON.parse(readFileSync(new URL('../public' + path, import.meta.url))));
  }
  t.diagnostic('Checked ' + visited.size + ' module URLs. Server closed after this test.');
});

test('development HTML refreshes imported card templates after invalidation', {timeout:30000}, async t => {
  let revision = 'first';
  const app = await createPreview(t, {
    plugins:[{name:'test-card-template-revision',transform(code,id,options) {
      if (options?.ssr && id.endsWith('/src/ui/featureCards.js')) return code.replace('card feature-card', `card feature-card ${revision}-revision`);
    }}]});
  const url='http://127.0.0.1:'+app.httpServer.address().port+'/';
  const first=await fetch(url);
  assert.equal(first.status,200);assert.match(await first.text(),/first-revision/);
  revision='second';
  const reloads=[];
  const send=app.ws.send.bind(app.ws);
  app.ws.send=(...args)=>{reloads.push(args[0]);return send(...args);};
  const plugin=app.config.plugins.find(plugin=>plugin.name==='static-page-routes');
  await plugin.handleHotUpdate({file:resolve('src/ui/featureCards.js'),server:app});
  assert.ok(reloads.some(message=>message.type==='full-reload'),'template edits must refresh an already open dev page');
  const second=await fetch(url), document=await second.text();
  assert.equal(second.status,200);assert.match(document,/second-revision/);assert.doesNotMatch(document,/first-revision/);
  assert.equal([...document.matchAll(/<div class="col-6">\s*<article class="card feature-card/g)].length,4);
  t.diagnostic('Dev template refresh verified. Temporary server closed after this test.');
});

test('independent preview servers cannot invalidate another server’s optimized dependencies', {timeout:30000}, async t => {
  const first = await createPreview(t);
  const base = `http://127.0.0.1:${first.httpServer.address().port}`;
  const code = await (await fetch(base + '/digging/select.js')).text();
  const path = code.match(/from\s*["']([^"']*choices__js\.js[^"']*)["']/)?.[1];
  assert.ok(path, 'Choices must be available from the optimized dependency cache');
  assert.equal((await fetch(new URL(path, base))).status,200);
  const second = await createPreview(t, {plugins:[{name:'independent-preview-config'}]});
  assert.notEqual(first.config.cacheDir,second.config.cacheDir);
  assert.notEqual(first.config.cacheDir,resolve('node_modules/.vite'));
  const otherBase = `http://127.0.0.1:${second.httpServer.address().port}`;
  const otherCode = await (await fetch(otherBase + '/digging/select.js')).text();
  const otherPath = otherCode.match(/from\s*["']([^"']*choices__js\.js[^"']*)["']/)?.[1];
  assert.ok(otherPath);
  assert.equal((await fetch(new URL(otherPath,otherBase))).status,200);
  await second.close();
  assert.equal((await fetch(new URL(path,base))).status,200, 'opening and closing another preview must not cause Outdated Optimize Dep');
});
