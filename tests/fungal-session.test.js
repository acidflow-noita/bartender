import test from "node:test";
import assert from "node:assert/strict";
import {emptySession, readSession, sessionUrl, syncAddress, copyLinkText} from "../src/fungal/session.js";

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

test("share URLs are readable, omit defaults and support 200 Hyper shifts", () => {
  const state = {...emptySession(), seed: "12345", mode: "apotheosis_bungal_spam", spoilers: true,
    view: "simulation", cycle: 3, after: 200, transition: 38,
    goals: [{base: "water", target: "oil", stain: "air"}, {base: "lava", target: "blood", stain: "sand"}],
    held: Array.from({length: 200}, (_, i) => i === 199 ? "blood" : i === 1 ? "oil" : "air")};
  const href = sessionUrl("https://example.test/fungal_shifting?old=1#old", state);
  assert.equal(href, "https://example.test/fungal_shifting?seed=12345&mode=hyper&spoilers=1&view=simulation&ng=3&goal=water:oil&goal=lava:blood:sand&hold=2:oil,200:blood&next=38");
  assert.deepEqual(readSession(href), {state, error: ""});
  assert.equal(sessionUrl("https://example.test/fungal_shifting", emptySession()), "https://example.test/fungal_shifting");
  assert.equal(readSession("https://example.test/?mode=hyper").state.after, 200);
  assert.equal(readSession("https://example.test/?mode=spell").state.after, 20);
});

test("address synchronization survives a transient History API error and still flushes the latest setup", () => {
  const location = {href: "https://example.test/fungal_shifting"};
  const errors = [];
  let fail = true, next;
  const history = {state: {keep: true}, replaceState(state, title, href) {
    if (fail) throw new Error("History rate limit");
    assert.equal(state, this.state);
    location.href = href;
  }};
  const address = syncAddress({location, history}, {schedule: (fn) => {next = fn; return 1;}, cancel: () => {next = undefined;}, onError: (error) => errors.push(error)});
  address.update({...emptySession(), seed: "12"});
  assert.equal(errors.length, 1);
  address.update({...emptySession(), seed: "13", goals: [{base: "water", target: "oil", stain: "air"}]});
  fail = false;
  next();
  assert.equal(location.href, "https://example.test/fungal_shifting?seed=13&goal=water:oil");
  address.update({...emptySession(), seed: "14"});
  address.flush();
  assert.equal(readSession(location.href).state.seed, "14");
  address.dispose();
});

test("reset/back navigation cancels pending URL writes", () => {
  const f = addressFixture();
  f.sync.update({...emptySession(), seed: "1"});
  f.sync.update({...emptySession(), seed: "2"});
  f.sync.clear();
  f.location.href = "https://example.test/fungal_shifting?seed=3";
  f.tick();
  assert.equal(readSession(f.location.href).state.seed, "3");
  f.sync.update({...emptySession(), seed: "3"});
  assert.equal(f.writes.length, 1);
  f.sync.dispose();
});

test("Copy link supports Clipboard API, permission failure, fallback, and explicit manual-copy failure", async () => {
  const href = "https://example.test/fungal_shifting?seed=12&goal=water:oil";
  const copied = [];
  assert.equal(await copyLinkText(href, {clipboard: {async writeText(text) {copied.push(text);}}, fallback() {throw new Error("fallback should not run");}}), true);
  assert.deepEqual(copied, [href]);
  assert.equal(await copyLinkText(href, {clipboard: {async writeText() {throw new Error("Permission denied");}}, fallback(text) {copied.push(text); return true;}}), true);
  assert.deepEqual(copied, [href, href]);
  assert.equal(await copyLinkText(href, {clipboard: undefined, fallback: () => false}), false);
  assert.equal(await copyLinkText(href, {clipboard: undefined, fallback: () => {throw new Error("Unavailable");}}), false);
});
