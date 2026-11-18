import test from "node:test";
import assert from "node:assert/strict";

import { ShortcutManager, parseCombo, normalizeCombo, comboFromEvent, formatCombo } from "../core/ShortcutManager.js";
import { InMemoryStorage } from "../core/ReactionSetManager.js";

const build = (storage = new InMemoryStorage()) => new ShortcutManager(storage);
const ev = (type, { ctrlKey = false, shiftKey = false, altKey = false, detail = 1 } = {}) => ({ type, ctrlKey, shiftKey, altKey, detail });

// ---------------------------------------------------------------------------
// Combo strings
// ---------------------------------------------------------------------------

test("combos are normalized to a fixed modifier order whatever the input order/casing", () => {
  assert.equal(normalizeCombo("alt+ctrl+click"), "Ctrl+Alt+Click");
  assert.equal(normalizeCombo("Shift+Ctrl+RightClick"), "Ctrl+Shift+RightClick");
  assert.equal(normalizeCombo("DoubleClick"), "DoubleClick");
});

test("invalid combos are rejected", () => {
  assert.equal(parseCombo("Ctrl+Ctrl+Click"), null);
  assert.equal(parseCombo("Meta+Click"), null);
  assert.equal(parseCombo("Ctrl"), null);
  assert.equal(parseCombo(""), null);
  assert.equal(parseCombo(null), null);
});

test("comboFromEvent maps click / second click / contextmenu to the three gestures", () => {
  assert.equal(comboFromEvent(ev("click", { ctrlKey: true })), "Ctrl+Click");
  assert.equal(comboFromEvent(ev("click", { detail: 2, altKey: true })), "Alt+DoubleClick");
  assert.equal(comboFromEvent(ev("contextmenu", { shiftKey: true })), "Shift+RightClick");
  assert.equal(comboFromEvent(ev("keydown")), null);
});

test("formatCombo produces readable labels", () => {
  assert.equal(formatCombo("Ctrl+Shift+Click"), "Ctrl+Shift+Click");
  assert.equal(formatCombo("DoubleClick"), "Double-click");
  assert.equal(formatCombo("Alt+RightClick"), "Alt+Right-click");
  assert.equal(formatCombo(null), "Unassigned");
});

// ---------------------------------------------------------------------------
// Defaults and resolution
// ---------------------------------------------------------------------------

test("default bindings", () => {
  const m = build();
  assert.equal(m.getBinding("selectAsReagent"), "Ctrl+Click");
  assert.equal(m.getBinding("selectAsProduct"), "Shift+Click");
  assert.equal(m.getBinding("openMaterialWiki"), "Ctrl+Shift+Click");
  assert.equal(m.getBinding("addReagentToNewSet"), "Alt+Click");
  assert.equal(m.getBinding("addProductToNewSet"), "Shift+Alt+Click");
  assert.equal(m.getBinding("toggleTagMaterials"), "DoubleClick");
  assert.equal(m.getBinding("openTagMenu"), "RightClick");
});

test("resolve is scoped by node type", () => {
  const m = build();
  assert.equal(m.resolve("material", ev("click", { ctrlKey: true })), "selectAsReagent");
  assert.equal(m.resolve("tag", ev("click", { ctrlKey: true })), null);
  assert.equal(m.resolve("tag", ev("contextmenu")), "openTagMenu");
  assert.equal(m.resolve("material", ev("contextmenu")), "openMaterialMenu");
  assert.equal(m.resolve("reaction", ev("click", { ctrlKey: true })), null);
});

test("a single-click binding does not match the second click of a double-click", () => {
  const m = build();
  assert.equal(m.resolve("material", ev("click", { ctrlKey: true, detail: 2 })), null);
});

test("the same gesture can be bound in two scopes at once", () => {
  const m = build();
  const result = m.setBinding("openMaterialWiki", "RightClick");
  assert.deepEqual(result, { ok: true, swappedWith: "openMaterialMenu" });
  assert.equal(m.resolve("material", ev("contextmenu")), "openMaterialWiki");
  assert.equal(m.resolve("tag", ev("contextmenu")), "openTagMenu");
});

// ---------------------------------------------------------------------------
// Rebinding
// ---------------------------------------------------------------------------

test("binding a gesture already used in the same scope swaps the two actions", () => {
  const m = build();
  const result = m.setBinding("addReagentToNewSet", "Ctrl+Click");
  assert.deepEqual(result, { ok: true, swappedWith: "selectAsReagent" });
  assert.equal(m.getBinding("addReagentToNewSet"), "Ctrl+Click");
  assert.equal(m.getBinding("selectAsReagent"), "Alt+Click");
});

test("plain click is reserved for highlighting", () => {
  const m = build();
  const result = m.setBinding("openTagMenu", "Click");
  assert.equal(result.ok, false);
  assert.equal(m.getBinding("openTagMenu"), "RightClick");
});

test("unknown actions and invalid combos are rejected without changes", () => {
  const m = build();
  assert.equal(m.setBinding("nope", "Ctrl+Click").ok, false);
  assert.equal(m.setBinding("openTagMenu", "TripleClick").ok, false);
  assert.equal(m.getBinding("openTagMenu"), "RightClick");
});

test("clearBinding unassigns an action so its gesture resolves to nothing", () => {
  const m = build();
  m.clearBinding("selectAsReagent");
  assert.equal(m.getBinding("selectAsReagent"), null);
  assert.equal(m.resolve("material", ev("click", { ctrlKey: true })), null);
});

test("swapping with an unassigned action leaves the other one unassigned", () => {
  const m = build();
  m.clearBinding("addReagentToNewSet");
  const result = m.setBinding("addReagentToNewSet", "Ctrl+Click");
  assert.equal(result.swappedWith, "selectAsReagent");
  assert.equal(m.getBinding("selectAsReagent"), null);
});

test("resetBinding restores one default, swapping with its current holder", () => {
  const m = build();
  m.setBinding("selectAsReagent", "Alt+Click"); // swaps with addReagentToNewSet
  m.resetBinding("addReagentToNewSet");
  assert.equal(m.getBinding("addReagentToNewSet"), "Alt+Click");
  assert.equal(m.getBinding("selectAsReagent"), "Ctrl+Click");
});

test("resetToDefaults restores every binding", () => {
  const m = build();
  m.setBinding("openTagMenu", "DoubleClick");
  m.clearBinding("selectAsReagent");
  m.resetToDefaults();
  assert.equal(m.getBinding("openTagMenu"), "RightClick");
  assert.equal(m.getBinding("selectAsReagent"), "Ctrl+Click");
  assert.ok(m.getActions().every((a) => m.isDefault(a.id)));
});

test("subscribers are notified on every change and can unsubscribe", () => {
  const m = build();
  let calls = 0;
  const unsubscribe = m.subscribe(() => calls++);
  m.setBinding("openTagMenu", "DoubleClick");
  m.clearBinding("openTagMenu");
  m.resetToDefaults();
  assert.equal(calls, 3);
  unsubscribe();
  m.setBinding("openTagMenu", "DoubleClick");
  assert.equal(calls, 3);
});

test("hasDoubleClickVariant tells whether a single click must wait for a possible double-click", () => {
  const m = build();
  assert.equal(m.hasDoubleClickVariant("material", ev("click", { ctrlKey: true })), false);
  m.setBinding("openMaterialWiki", "Ctrl+DoubleClick");
  assert.equal(m.hasDoubleClickVariant("material", ev("click", { ctrlKey: true })), true);
  assert.equal(m.hasDoubleClickVariant("tag", ev("click", { ctrlKey: true })), false);
});

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

test("only overrides are persisted, and they survive a reload", () => {
  const storage = new InMemoryStorage();
  const m1 = build(storage);
  m1.setBinding("addReagentToNewSet", "Ctrl+Click");
  m1.clearBinding("openTagMenu");

  assert.deepEqual(JSON.parse(storage.getItem("noitalambic.shortcuts.v2")), {
    selectAsReagent: "Alt+Click",
    addReagentToNewSet: "Ctrl+Click",
    openTagMenu: null,
  });

  const m2 = build(storage);
  assert.equal(m2.getBinding("addReagentToNewSet"), "Ctrl+Click");
  assert.equal(m2.getBinding("selectAsReagent"), "Alt+Click");
  assert.equal(m2.getBinding("openTagMenu"), null);
});

test("corrupted or conflicting stored data never yields two actions on one gesture", () => {
  const storage = new InMemoryStorage();
  storage.setItem("noitalambic.shortcuts.v2", JSON.stringify({ addReagentToNewSet: "Ctrl+Click", openTagMenu: "Click", nope: "Alt+Click", selectAsProduct: 42 }));
  const m = build(storage);
  assert.equal(m.getBinding("addReagentToNewSet"), "Ctrl+Click");
  assert.equal(m.getBinding("selectAsReagent"), "Alt+Click");
  assert.equal(m.getBinding("openTagMenu"), "RightClick");
  assert.equal(m.getBinding("selectAsProduct"), "Shift+Click");

  storage.setItem("noitalambic.shortcuts.v2", "{not json");
  assert.equal(build(storage).getBinding("openTagMenu"), "RightClick");
});

test("bindings saved in the previous format are migrated", () => {
  const storage = new InMemoryStorage();
  storage.setItem(
    "noitalambic.shortcuts",
    JSON.stringify({
      openTagMenu: { trigger: "dblclick", ctrl: false, shift: false, alt: false },
      addReagentToNewSet: { ctrl: true, shift: false, alt: true }, // pre-trigger format
    }),
  );
  const m = build(storage);
  assert.equal(m.getBinding("openTagMenu"), "DoubleClick");
  assert.equal(m.getBinding("addReagentToNewSet"), "Ctrl+Alt+Click");
});
