import test from "node:test";
import assert from "node:assert/strict";
import {Worker} from "node:worker_threads";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
const fixtures = JSON.parse(readFileSync(new URL("./fungal-upstream-fixtures.json", import.meta.url)));

// Exercise the real module-worker protocol in Node, not in a browser. The
// bootstrap only maps self.postMessage/onmessage onto node:worker_threads.
for (const expected of fixtures.searches.filter((test) => test.full)) {
  test(`real worker end-to-end source parity: ${expected.mode}`, {timeout: 10000}, async (t) => {
    const url = new URL("../src/fungal/search-worker.js", import.meta.url).href;
    const bootstrap = `
      import {parentPort} from 'node:worker_threads';
      globalThis.self = {postMessage: (data) => parentPort.postMessage(data)};
      console.log = () => {};
      await import(${JSON.stringify(url)});
      parentPort.on('message', (data) => self.onmessage({data}));
      parentPort.postMessage({type:'ready'});
    `;
    const worker = new Worker(new URL(`data:text/javascript,${encodeURIComponent(bootstrap)}`));
    t.after(() => worker.terminate());
    const recipes = [];
    const result = await new Promise((resolve, reject) => {
      worker.on("error", reject);
      worker.on("message", (data) => {
        if (data.type === "ready") worker.postMessage({type: "start", seed: expected.seed, mode: expected.mode, constraints: expected.goals});
        else if (data.type === "error") reject(new Error(data.message));
        else if (data.type === "progress") {
          recipes.push(...data.recipes);
          if (data.progress.finished) resolve(data.progress);
        }
      });
    });
    assert.equal(result.tested, expected.tested);
    assert.equal(result.shortest, expected.best);
    assert.equal(result.found, expected.solutions);
    assert.equal(createHash("sha256").update(JSON.stringify(recipes)).digest("hex"), expected.sha256);
  });
}

test("full model → actual worker → displayed source results integration", {timeout: 10000}, async (t) => {
  const {createModel} = await import("../src/fungal/model.js");
  const {emptySession} = await import("../src/fungal/session.js");
  const expected = fixtures.searches.find((entry) => entry.full && entry.mode === "vanilla");
  const url = new URL("../src/fungal/search-worker.js", import.meta.url).href;
  const model = createModel({...emptySession(), seed: String(expected.seed), goals: expected.goals.map((g) => ({...g, stain: "air"}))}, {
    base: [{id: "air", name: "Air"}], apotheosis: [],
    workerFactory() {
      const bootstrap = `import {parentPort} from 'node:worker_threads';
        globalThis.self = {postMessage: data => parentPort.postMessage(data)};
        console.log = () => {};
        await import(${JSON.stringify(url)});
        parentPort.on('message', data => self.onmessage({data}));
        parentPort.postMessage({type:'ready'});`;
      const worker = new Worker(new URL(`data:text/javascript,${encodeURIComponent(bootstrap)}`));
      t.after(() => worker.terminate());
      const queued = [];
      let ready = false;
      const adapter = {
        terminate: () => worker.terminate(),
        postMessage: (data) => ready ? worker.postMessage(data) : queued.push(data),
      };
      worker.on("message", (data) => {
        if (data.type === "ready") { ready = true; queued.forEach((data) => worker.postMessage(data)); }
        else adapter.onmessage({data});
      });
      worker.on("error", (error) => adapter.onerror({message: error.message}));
      return adapter;
    },
  });
  t.after(() => model.dispose());
  const complete = new Promise((resolve, reject) => {
    model.subscribe((state) => {
      if (state.search.status === "complete") resolve(state.search);
      if (state.search.status === "error") reject(new Error(state.search.error));
    });
  });
  model.startSearch();
  const search = await complete;
  assert.equal(search.progress.tested, expected.tested);
  assert.equal(createHash("sha256").update(JSON.stringify(search.recipes)).digest("hex"), expected.sha256);
  assert.equal(search.selected, 0);
});
