// ============================================================================
// FORCE PRESETS - Selectable force-layout settings (see CONFIG.graph.forcePresets)
// ============================================================================

import { CONFIG } from "../config/config.js";

const STORAGE_KEY = "noitalambic.graph.forcePreset";
const SETTLE_STORAGE_KEY = "noitalambic.graph.settleSeconds";

// How long a layout takes to settle, in seconds at 60 frames per second: the time until d3
// stops the simulation (alpha from 1 down to its alphaMin, 0.001). 5 s is d3's own default
// (300 ticks). The untangle -> compact phase switch happens at a fixed alpha, so it scales along.
// 0 = no settling at all: the simulation never runs, nodes stay where they are put.
export const SETTLE_SECONDS = { min: 0, max: 5, step: 0.5, default: 5 };
const TICKS_PER_SECOND = 60;
const ALPHA_MIN = 0.001;

export function clampSettleSeconds(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value)) return SETTLE_SECONDS.default;
  return Math.min(SETTLE_SECONDS.max, Math.max(SETTLE_SECONDS.min, value));
}

// d3 alphaDecay giving that settling time: alpha * (1 - decay)^ticks reaches ALPHA_MIN.
export function alphaDecayFor(seconds) {
  const ticks = clampSettleSeconds(seconds) * TICKS_PER_SECOND;
  if (ticks === 0) return 1; // no settling: never ticked anyway
  return 1 - Math.pow(ALPHA_MIN, 1 / ticks);
}

export function loadSettleSeconds(storage = defaultStorage()) {
  try {
    const raw = storage?.getItem(SETTLE_STORAGE_KEY);
    if (raw != null) return clampSettleSeconds(raw);
  } catch {/* storage unavailable: fall back to the default */}
  return SETTLE_SECONDS.default;
}

export function saveSettleSeconds(seconds, storage = defaultStorage()) {
  try {
    storage?.setItem(SETTLE_STORAGE_KEY, String(clampSettleSeconds(seconds)));
  } catch {/* only loses the preference */}
}

export const FORCE_PRESET_IDS = Object.keys(CONFIG.graph.forcePresets);

export function getForcePreset(id) {
  return CONFIG.graph.forcePresets[id] ?? CONFIG.graph.forcePresets[CONFIG.graph.defaultForcePreset];
}

export function loadForcePresetId(storage = defaultStorage()) {
  try {
    const id = storage?.getItem(STORAGE_KEY);
    if (id && Object.hasOwn(CONFIG.graph.forcePresets, id)) return id;
  } catch {/* storage unavailable: fall back to the default */}
  return CONFIG.graph.defaultForcePreset;
}

export function saveForcePresetId(id, storage = defaultStorage()) {
  try {
    storage?.setItem(STORAGE_KEY, id);
  } catch {/* only loses the preference */}
}

function defaultStorage() {
  return typeof window !== "undefined" ? window.localStorage ?? null : null;
}
