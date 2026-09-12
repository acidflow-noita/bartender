import test from "node:test";
import assert from "node:assert/strict";
import {emptySession, readSession, sessionUrl, syncAddress} from "../src/fungal/session.js";

function addressFixture() {
  const location = {href: "https://example.test/fungal_shifting"};
  const writes = [];
  const history = {state: {keep: "existing"}, replaceState(state, unused, href) { writes.push({state, href}); location.href = href; }};
  const timers = new Map();
  let id = 0;
  const sync = syncAddress({location, history}, {schedule(fn) {timers.set(++id, fn); return id;}, cancel(id) {timers.delete(id);}});
  return {sync, location, history, writes, timers, tick() {const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach((fn) => fn());}};
}

test("all visible setup values round-trip, including Air, empty rows, mode, and simulation controls", () => {
  const state = {...emptySession(), seed: "0", mode: "apotheosis_bungal_spam", spoilers: true, view: "simulation", cycle: 3, after: 7,
    goals: [{base: "air", target: "air", stain: "air"}, {base: "water", target: "oil", stain: "blood"}],
    held: ["air", "water"], custom: ["my_material"]};
  const url = sessionUrl("https://example.test/fungal_shifting?stale=1#old", state);
  assert.deepEqual(readSession(url), {state, error: ""});
  assert.ok(!url.includes("stale"));
  for (const state of [emptySession(), {...emptySession(), goals: []}, {...emptySession(), mode: "apotheosis_bungal", spoilers: false}]) {
    assert.deepEqual(readSession(sessionUrl(url, state)), {state, error: ""});
  }
});

test("original noita-fungal hash links and previous Bartender query links still load", () => {
  const legacy = readSession("https://example.test/#12&water/oil/blood&lava/water").state;
  assert.equal(legacy.seed, "12");
  assert.deepEqual(legacy.goals, [{base: "water", target: "oil", stain: "blood"}, {base: "lava", target: "water", stain: "air"}]);
  const old = readSession('https://example.test/?seed=12&mode=apotheosis&ng=3&through=6&goals=[{"base":"water","target":"oil","stain":""}]&held=[null,"blood"]').state;
  assert.equal(old.cycle, 3);
  assert.equal(old.after, 6);
  assert.equal(old.goals[0].stain, "air");
  assert.deepEqual(old.held, ["air", "blood"]);
});

test("malformed URLs produce a message without crashing page initialization", () => {
  for (const query of ["goals=bad-json", "goals={}", "goals=[null]", 'goals=[{"base":"<script>"}]', "held={}", "custom={}"]) {
    assert.ok(readSession(`https://example.test/?${query}`).error, query);
  }
  const invalid = readSession("https://example.test/?mode=invalid&cycle=-1&after=900").state;
  assert.equal(invalid.mode, "vanilla");
  assert.equal(invalid.cycle, 0);
  assert.equal(invalid.after, 20);
});

test("address bar changes without Copy link, preserves history state, and keeps latest slider value", () => {
  const f = addressFixture();
  const initial = {...emptySession(), seed: "12"};
  f.sync.update(initial);
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].state, f.history.state);
  for (let after = 0; after <= 10; after++) f.sync.update({...initial, view: "simulation", after});
  assert.equal(f.writes.length, 1);
  f.tick();
  assert.equal(f.writes.length, 2);
  assert.equal(readSession(f.location.href).state.after, 10);
  f.sync.update({...initial, seed: ""});
  f.sync.flush();
  assert.equal(readSession(f.location.href).state.seed, "");
  f.sync.dispose();
  f.tick();
  assert.equal(f.writes.length, 3);
});

test("partial goals, removals, and Air selections update the copied browser URL", () => {
  const f = addressFixture();
  const state = {...emptySession(), seed: "12", goals: [{base: "water", target: "air", stain: "air"}]};
  f.sync.update(state);
  assert.deepEqual(readSession(f.location.href).state.goals, state.goals);
  f.sync.update({...state, goals: [], held: ["air"]});
  f.sync.flush();
  assert.deepEqual(readSession(f.location.href).state.goals, []);
  assert.deepEqual(readSession(f.location.href).state.held, []);
  f.sync.dispose();
});
