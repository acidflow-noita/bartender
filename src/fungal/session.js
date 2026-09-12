import { MODES } from "./engine.js";

export const EMPTY_GOAL = () => ({base: "air", target: "air", stain: "air"});
export const VIEWS = ["search", "predictions", "simulation"];
export const isMaterialId = (id) => typeof id === "string" && /^[a-zA-Z_][a-zA-Z0-9_]{0,127}$/.test(id);
export function emptySession() {
  return {seed: "", mode: "vanilla", spoilers: false, view: "search", cycle: 0,
    goals: [EMPTY_GOAL()], custom: [], held: [], after: 20};
}

export function readSession(href) {
  const state = emptySession();
  let error = "";
  try {
    const url = new URL(href);
    const p = url.searchParams;
    state.seed = p.get("seed") ?? "";
    state.mode = MODES.some((m) => m.id === p.get("mode")) ? p.get("mode") : "vanilla";
    state.spoilers = p.has("spoilers") ? p.get("spoilers") === "1" : state.mode.startsWith("apotheosis_bungal");
    state.view = VIEWS.includes(p.get("view")) ? p.get("view") : "search";
    state.cycle = Number(p.get("cycle") ?? p.get("ng") ?? 0);
    state.after = Number(p.get("after") ?? p.get("through") ?? 20);
    if (!Number.isInteger(state.cycle) || state.cycle < 0 || state.cycle > 28) state.cycle = 0;
    if (!Number.isInteger(state.after)) state.after = 20;
    state.after = Math.max(0, Math.min(20, state.after));
    const goals = JSON.parse(p.get("goals") ?? JSON.stringify([EMPTY_GOAL()]));
    const custom = JSON.parse(p.get("custom") ?? "[]");
    const held = JSON.parse(p.get("held") ?? "[]");
    if (!Array.isArray(goals) || !Array.isArray(custom) || !Array.isArray(held)) throw new Error("Invalid shared material lists.");
    const material = (id) => {
      if (!id) return "air";
      if (!isMaterialId(id)) throw new Error("Invalid material ID in the shared setup.");
      return id;
    };
    state.goals = goals.map((goal) => {
      if (!goal || typeof goal !== "object") throw new Error("Invalid shared goal.");
      return {base: material(goal.base), target: material(goal.target), stain: material(goal.stain)};
    });
    state.custom = custom.map(material);
    state.held = held.slice(0, 20).map(material);
    if (!p.has("seed") && /^#\d/.test(url.hash)) {
      const [seed, ...goals] = decodeURIComponent(url.hash.slice(1)).split("&");
      state.seed = seed;
      state.goals = goals.map((goal) => {
        const [base, target, stain] = goal.split("/");
        return {base: material(base), target: material(target), stain: material(stain)};
      });
      if (!state.goals.length) state.goals = [EMPTY_GOAL()];
    }
  } catch (cause) { error = cause.message; }
  return {state, error};
}

export function sessionUrl(href, state) {
  const url = new URL(href);
  url.search = "";
  url.hash = "";
  const p = url.searchParams;
  p.set("seed", String(state.seed));
  p.set("mode", state.mode);
  if (state.spoilers) p.set("spoilers", "1");
  else if (state.mode.startsWith("apotheosis_bungal")) p.set("spoilers", "0");
  if (state.view !== "search") p.set("view", state.view);
  if (state.cycle) p.set("cycle", String(state.cycle));
  const defaultGoals = state.goals.length === 1 && Object.values(state.goals[0]).every((id) => id === "air");
  if (!defaultGoals) p.set("goals", JSON.stringify(state.goals));
  if (state.custom.length) p.set("custom", JSON.stringify(state.custom));
  const held = state.held.map((id) => id || "air");
  while (held.length && held.at(-1) === "air") held.pop();
  if (held.length) p.set("held", JSON.stringify(held));
  if (state.after !== 20) p.set("after", String(state.after));
  return url.href;
}

// Coalesce slider updates without navigation or extra Back-button entries.
// Copy link flushes the latest value; ordinary edits update the address bar too.
export function syncAddress({location, history}, {schedule = setTimeout, cancel = clearTimeout} = {}) {
  let timer = null;
  let pending;
  let disposed = false;
  function write() {
    if (!pending) return;
    const url = sessionUrl(location.href, pending);
    pending = undefined;
    if (url !== location.href) history.replaceState(history.state, "", url);
  }
  function tick() {
    timer = null;
    if (!pending || disposed) return;
    write();
    timer = schedule(tick, 150);
  }
  return {
    update(state) {
      if (disposed) return;
      pending = state;
      if (timer === null) { write(); timer = schedule(tick, 150); }
    },
    flush() { if (!disposed) write(); },
    dispose() { disposed = true; if (timer !== null) cancel(timer); pending = undefined; },
  };
}
