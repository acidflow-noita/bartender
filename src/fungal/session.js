import { maxShifts } from "./engine.js";

export const EMPTY_GOAL = () => ({base: "air", target: "air", stain: "air"});
export const VIEWS = ["search", "predictions", "simulation"];
export const isMaterialId = (id) => typeof id === "string" && /^[a-zA-Z_][a-zA-Z0-9_]{0,127}$/.test(id);
const modeNames = {vanilla: "vanilla", apotheosis: "apotheosis", apotheosis_bungal: "spell", apotheosis_bungal_spam: "hyper"};
export function emptySession() {
  return {seed: "", mode: "vanilla", spoilers: false, view: "search", cycle: 0,
    goals: [EMPTY_GOAL()], custom: [], held: [], after: 20, transition: 20};
}

export function readSession(href) {
  const state = emptySession();
  let error = "";
  try {
    const url = new URL(href);
    const p = url.searchParams;
    const requestedMode = p.get("mode");
    state.mode = Object.keys(modeNames).find((id) => id === requestedMode || modeNames[id] === requestedMode) ?? "vanilla";
    const limit = maxShifts[state.mode];
    state.seed = p.get("seed") ?? "";
    state.spoilers = p.has("spoilers") ? p.get("spoilers") === "1" : state.mode.startsWith("apotheosis_bungal");
    state.view = VIEWS.includes(p.get("view")) ? p.get("view") : "search";
    const integer = (value, min, max, fallback) => {
      const number = value === null ? fallback : Number(value);
      return Number.isInteger(number) && number >= min && number <= max ? number : fallback;
    };
    state.cycle = integer(p.get("ng") ?? p.get("cycle"), 0, 28, 0);
    state.after = integer(p.get("after") ?? p.get("through"), 0, limit, limit);
    state.transition = state.cycle === 28 ? limit : integer(p.get("next") ?? p.get("transition"), 1, limit, limit);
    const material = (id) => {
      if (!id) return "air";
      if (!isMaterialId(id)) throw new Error("Invalid material ID in the shared setup.");
      return id;
    };
    if (p.has("goal")) {
      state.goals = p.getAll("goal").map((value) => {
        const parts = value.split(":");
        if (parts.length > 3) throw new Error("Invalid shared goal.");
        const [base, target, stain] = parts;
        return {base: material(base), target: material(target), stain: material(stain)};
      });
    } else if (p.get("goals") === "none") state.goals = [];
    else if (p.has("goals")) {
      const goals = JSON.parse(p.get("goals"));
      if (!Array.isArray(goals)) throw new Error("Invalid shared goals.");
      state.goals = goals.map((goal) => {
        if (!goal || typeof goal !== "object") throw new Error("Invalid shared goal.");
        return {base: material(goal.base), target: material(goal.target), stain: material(goal.stain)};
      });
    }
    const customValue = p.get("custom");
    if (customValue) {
      const custom = /^[\[{]/.test(customValue) ? JSON.parse(customValue) : customValue.split(",");
      if (!Array.isArray(custom)) throw new Error("Invalid custom material list.");
      state.custom = custom.map(material);
    }
    if (p.has("hold")) {
      for (const entry of p.get("hold").split(",").filter(Boolean)) {
        const [index, id, extra] = entry.split(":");
        const shift = Number(index);
        if (extra !== undefined || !Number.isInteger(shift) || shift < 1 || shift > limit || !id) throw new Error("Invalid held-material shift in the shared setup.");
        while (state.held.length < shift) state.held.push("air");
        state.held[shift - 1] = material(id);
      }
    } else if (p.has("held")) {
      const held = JSON.parse(p.get("held"));
      if (!Array.isArray(held)) throw new Error("Invalid held-material list.");
      state.held = held.slice(0, limit).map(material);
    }
    // Original noita-fungal hash links remain importable.
    if (!p.has("seed") && /^#\d/.test(url.hash)) {
      const [seed, ...goals] = decodeURIComponent(url.hash.slice(1)).split("&");
      state.seed = seed;
      state.goals = goals.length ? goals.map((goal) => {
        const [base, target, stain] = goal.split("/");
        return {base: material(base), target: material(target), stain: material(stain)};
      }) : [EMPTY_GOAL()];
    }
  } catch (cause) { error = cause.message; }
  return {state, error};
}

// Human-readable IDs and delimiters instead of escaped JSON arrays/objects.
export function sessionUrl(href, state) {
  const url = new URL(href);
  const pairs = [];
  const add = (key, value) => pairs.push(`${key}=${encodeURIComponent(String(value)).replaceAll("%3A", ":").replaceAll("%2C", ",")}`);
  const limit = maxShifts[state.mode];
  if (state.seed !== "") add("seed", state.seed);
  if (state.mode !== "vanilla") add("mode", modeNames[state.mode]);
  if (state.spoilers) add("spoilers", 1);
  else if (state.mode.startsWith("apotheosis_bungal")) add("spoilers", 0);
  if (state.view !== "search") add("view", state.view);
  if (state.cycle) add("ng", state.cycle);
  if (!state.goals.length) add("goals", "none");
  else if (!(state.goals.length === 1 && Object.values(state.goals[0]).every((id) => !id || id === "air"))) {
    for (const goal of state.goals) {
      const parts = [goal.base, goal.target, goal.stain].map((id) => !id || id === "air" ? "" : id);
      while (parts.length > 1 && !parts.at(-1)) parts.pop();
      add("goal", parts.join(":"));
    }
  }
  if (state.custom.length) add("custom", state.custom.join(","));
  const held = [];
  state.held.slice(0, limit).forEach((id, index) => { if (id && id !== "air") held.push(`${index + 1}:${id}`); });
  if (held.length) add("hold", held.join(","));
  if (state.after !== limit) add("after", state.after);
  if (state.cycle < 28 && state.transition != null && state.transition < limit) add("next", state.transition);
  url.search = pairs.length ? `?${pairs.join("&")}` : "";
  url.hash = "";
  return url.href;
}

// Address sync is subscribed independently of UI rendering. The leading update
// is immediate; rapid input/slider changes are coalesced, and Copy link flushes.
export function syncAddress({location, history}, {schedule = setTimeout, cancel = clearTimeout, onError = () => {}} = {}) {
  let timer = null;
  let pending;
  let disposed = false;
  function write() {
    if (pending === undefined) return;
    try {
      if (pending !== location.href) history.replaceState(history.state, "", pending);
      pending = undefined;
    } catch (error) { onError(error); } // a transient browser rate limit must not break inputs
  }
  function tick() {
    timer = null;
    if (disposed || pending === undefined) return;
    write();
    timer = schedule(tick, 150);
  }
  return {
    update(state) {
      if (disposed) return;
      pending = sessionUrl(location.href, state);
      if (timer === null) { write(); timer = schedule(tick, 150); }
    },
    flush() { if (!disposed) write(); },
    clear() { if (timer !== null) cancel(timer); timer = null; pending = undefined; },
    dispose() { disposed = true; if (timer !== null) cancel(timer); pending = undefined; },
  };
}

export async function copyLinkText(value, {clipboard, fallback}) {
  try {
    if (!clipboard?.writeText) throw new Error("Clipboard unavailable");
    await clipboard.writeText(value);
    return true;
  } catch {
    try { return !!(await fallback(value)); }
    catch { return false; }
  }
}
