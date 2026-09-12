// HTTP transport checks only: no browser, screenshots, or DOM execution.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync, statSync, mkdtempSync} from "node:fs";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {preview} from "../node_modules/@observablehq/framework/dist/preview.js";
import {parseProgram} from "../node_modules/@observablehq/framework/dist/javascript/parse.js";
import {prepareFungal, modules, banner} from "../scripts/prepare-fungal.mjs";

const sourceRoot = new URL("../src/vendor/noita-fungal/", import.meta.url);
const outputRoot = new URL("../src/fungal/_upstream/", import.meta.url);

test("preview bridge preserves exact upstream source except relative import extensions", () => {
  for (const name of modules) {
    const original = readFileSync(new URL(`${name}.mjs`, sourceRoot), "utf8");
    let generated = readFileSync(new URL(`${name}.js`, outputRoot), "utf8");
    assert.ok(generated.startsWith(banner));
    generated = generated.slice(banner.length);
    for (const dependency of modules) for (const quote of ['"', "'"]) {
      generated = generated.replaceAll(`${quote}./${dependency}.js${quote}`, `${quote}./${dependency}.mjs${quote}`);
    }
    assert.equal(generated, original, `${name}: do not alter the calculations`);
  }
});

test("preparation is repeatable and missing submodules fail with an actionable message", () => {
  const before = modules.map((name) => statSync(new URL(`${name}.js`, outputRoot)).mtimeMs);
  prepareFungal();
  assert.deepEqual(modules.map((name) => statSync(new URL(`${name}.js`, outputRoot)).mtimeMs), before);
  const missing = mkdtempSync(join(tmpdir(), "fungal-missing-submodule-"));
  assert.throws(() => prepareFungal({sourceRoot: missing, outputRoot: join(missing, "out")}), /git submodule update --init --recursive/);
});

test("Observable preview serves the complete app and worker module graphs as JavaScript", {timeout: 30000}, async (t) => {
  // Exercise the actual preview router: production build alone accepts .mjs,
  // but Framework 1.13's /_import route serves only .js.
  const app = await preview({config: resolve("observablehq.config.js"), hostname: "127.0.0.1", port: 0, open: false, verbose: false});
  const server = app.server;
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const queue = [new URL("/_import/fungal/app.js", base), new URL("/_import/fungal/search-worker.js", base)];
  const visited = new Set();
  while (queue.length) {
    const url = queue.shift();
    if (visited.has(url.pathname)) continue;
    visited.add(url.pathname);
    const response = await fetch(url, {signal: AbortSignal.timeout(10000)});
    const code = await response.text();
    assert.equal(response.status, 200, `${url.pathname}: ${code.slice(0, 300)}`);
    assert.match(response.headers.get("content-type") ?? "", /(?:java|ecma)script/, url.pathname);
    const parsed = parseProgram(code);
    for (const node of parsed.body) {
      if (!["ImportDeclaration", "ExportAllDeclaration", "ExportNamedDeclaration"].includes(node.type) || !node.source) continue;
      const specifier = node.source.value;
      assert.match(specifier, /^(?:\.{1,2}\/|\/)/, `unresolved import in ${url.pathname}: ${specifier}`);
      const imported = new URL(specifier, url);
      assert.equal(imported.origin, base);
      queue.push(imported);
    }
  }
  for (const name of modules) assert.ok(visited.has(`/_import/fungal/_upstream/${name}.js`), `${name} must actually be served`);
  assert.ok(![...visited].some((path) => path.endsWith(".mjs")), "no dependency may use the unsupported .mjs preview route");
  t.diagnostic(`Checked ${visited.size} served modules, including every upstream dependency.`);
});
