import test from "node:test";
import assert from "node:assert/strict";

import { ShortcutManager } from "../core/ShortcutManager.js";
import { InMemoryStorage } from "../core/ReactionSetManager.js";

function buildManager() {
  return new ShortcutManager(new InMemoryStorage());
}

test("default bindings cover every legacy and new interaction", () => {
  const manager = buildManager();
  assert.deepEqual(manager.getBinding("selectAsReagent"), { trigger: "click", ctrl: true, shift: false, alt: false });
  assert.deepEqual(manager.getBinding("selectAsProduct"), { trigger: "click", ctrl: false, shift: true, alt: false });
  assert.deepEqual(manager.getBinding("openMaterialWiki"), { trigger: "click", ctrl: true, shift: true, alt: false });
  assert.deepEqual(manager.getBinding("addReagentToNewSet"), { trigger: "click", ctrl: false, shift: false, alt: true });
  assert.deepEqual(manager.getBinding("addProductToNewSet"), { trigger: "click", ctrl: false, shift: true, alt: true });
  assert.deepEqual(manager.getBinding("openTagMenu"), { trigger: "contextmenu", ctrl: false, shift: false, alt: false });
});

test("matchesEvent distinguishes click from contextmenu even with identical modifiers", () => {
  const manager = buildManager();
  const clickEvent = { type: "click", detail: 1, ctrlKey: false, shiftKey: false, altKey: false };
  const contextEvent = { type: "contextmenu", ctrlKey: false, shiftKey: false, altKey: false };

  assert.equal(manager.matchesEvent("openTagMenu", clickEvent), false);
  assert.equal(manager.matchesEvent("openTagMenu", contextEvent), true);
});

test("matchesEvent for a 'click' trigger does not match the first click of a double-click", () => {
  const manager = buildManager();
  manager.setBinding("selectAsReagent", { trigger: "click", ctrl: false, shift: false, alt: false });

  assert.equal(manager.matchesEvent("selectAsReagent", { type: "click", detail: 1, ctrlKey: false, shiftKey: false, altKey: false }), true);
  assert.equal(manager.matchesEvent("selectAsReagent", { type: "click", detail: 2, ctrlKey: false, shiftKey: false, altKey: false }), false);
});

test("matchesEvent for a 'dblclick' trigger only matches detail === 2", () => {
  const manager = buildManager();
  manager.setBinding("openTagMenu", { trigger: "dblclick", ctrl: false, shift: false, alt: false });

  assert.equal(manager.matchesEvent("openTagMenu", { type: "click", detail: 2, ctrlKey: false, shiftKey: false, altKey: false }), true);
  assert.equal(manager.matchesEvent("openTagMenu", { type: "click", detail: 1, ctrlKey: false, shiftKey: false, altKey: false }), false);
});

test("setBinding refuses a combo already used by another action", () => {
  const manager = buildManager();
  const result = manager.setBinding("addReagentToNewSet", { trigger: "click", ctrl: true, shift: false, alt: false });
  assert.equal(result.ok, false);
  assert.match(result.error, /reagent/i);
  assert.deepEqual(manager.getBinding("addReagentToNewSet"), { trigger: "click", ctrl: false, shift: false, alt: true });
});

test("setBinding accepts a free combo, including changing the trigger, and persists it", () => {
  const manager = buildManager();
  const result = manager.setBinding("openTagMenu", { trigger: "dblclick", ctrl: false, shift: false, alt: false });
  assert.equal(result.ok, true);
  assert.deepEqual(manager.getBinding("openTagMenu"), { trigger: "dblclick", ctrl: false, shift: false, alt: false });
});

test("setBinding rejects an unknown trigger", () => {
  const manager = buildManager();
  const result = manager.setBinding("openTagMenu", { trigger: "tripleclick", ctrl: false, shift: false, alt: false });
  assert.equal(result.ok, false);
});

test("bindings persist across instances sharing the same storage", () => {
  const storage = new InMemoryStorage();
  const manager1 = new ShortcutManager(storage);
  manager1.setBinding("openTagMenu", { trigger: "dblclick", ctrl: false, shift: false, alt: false });

  const manager2 = new ShortcutManager(storage);
  assert.deepEqual(manager2.getBinding("openTagMenu"), { trigger: "dblclick", ctrl: false, shift: false, alt: false });
});

test("resetToDefaults restores every original binding", () => {
  const manager = buildManager();
  manager.setBinding("openTagMenu", { trigger: "dblclick", ctrl: false, shift: false, alt: false });
  manager.resetToDefaults();
  assert.deepEqual(manager.getBinding("openTagMenu"), { trigger: "contextmenu", ctrl: false, shift: false, alt: false });
});

test("formatCombo produces a readable label for every trigger type", () => {
  assert.equal(ShortcutManager.formatCombo({ trigger: "click", ctrl: true, shift: false, alt: false }), "Ctrl+Click");
  assert.equal(ShortcutManager.formatCombo({ trigger: "dblclick", ctrl: false, shift: false, alt: false }), "Double-click");
  assert.equal(ShortcutManager.formatCombo({ trigger: "contextmenu", ctrl: false, shift: false, alt: false }), "Right-click");
});

test("loading an older saved binding without a trigger field defaults it to 'click'", () => {
  const storage = new InMemoryStorage();
  storage.setItem("noitalambic.shortcuts", JSON.stringify({ addReagentToNewSet: { ctrl: true, shift: false, alt: true } }));

  const manager = new ShortcutManager(storage);
  assert.deepEqual(manager.getBinding("addReagentToNewSet"), { trigger: "click", ctrl: true, shift: false, alt: true });
});
