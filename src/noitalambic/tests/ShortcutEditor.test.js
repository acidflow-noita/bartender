// DOM test for the shortcut editor shown in the graph legend: recording a gesture on the button,
// swap notification, clear / reset, and live refresh when the manager changes elsewhere.

import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import { ShortcutManager } from "../core/ShortcutManager.js";
import { InMemoryStorage } from "../core/ReactionSetManager.js";

async function setup() {
  const dom = new JSDOM("<!doctype html><html><head></head><body><div id='host'></div></body></html>");
  global.window = dom.window;
  global.document = dom.window.document;
  const { ShortcutEditor } = await import("../ui/ShortcutEditor.js");

  const manager = new ShortcutManager(new InMemoryStorage());
  const notifications = [];
  const editor = new ShortcutEditor(manager, { notify: (message) => notifications.push(message) });
  editor.mount(document.getElementById("host"));

  const row = (actionId) => document.querySelector(`[data-shortcut-action="${actionId}"]`);
  const recordBtn = (actionId) => row(actionId).querySelector('[data-role="record"]');
  const fire = (el, type, init = {}) => el.dispatchEvent(new window.MouseEvent(type, { bubbles: true, cancelable: true, ...init }));
  return { dom, manager, editor, notifications, row, recordBtn, fire };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("lists every action grouped by node type with its current shortcut", async () => {
  const { manager, recordBtn } = await setup();
  assert.equal(document.querySelectorAll("[data-shortcut-action]").length, manager.getActions().length);
  assert.equal(recordBtn("addReagentToNewSet").textContent, "Alt+Click");
  assert.equal(recordBtn("openTagMenu").textContent, "Right-click");
  assert.deepEqual(
    [...document.querySelectorAll(".shortcut-editor-scope")].map((el) => el.textContent),
    ["Material", "Tag", "Reaction"],
  );
});

test("clicking the shortcut starts recording, a right-click on it becomes the new shortcut", async () => {
  const { manager, recordBtn, fire } = await setup();
  fire(recordBtn("openMaterialWiki"), "click", { detail: 1 });
  assert.match(recordBtn("openMaterialWiki").textContent, /Perform gesture/);

  fire(recordBtn("openMaterialWiki"), "contextmenu", { altKey: true });
  assert.equal(manager.getBinding("openMaterialWiki"), "Alt+RightClick");
  assert.equal(recordBtn("openMaterialWiki").textContent, "Alt+Right-click");
});

test("a recorded single click is committed after the double-click delay", async () => {
  const { manager, recordBtn, fire } = await setup();
  fire(recordBtn("openTagMenu"), "click", { detail: 1 });
  fire(recordBtn("openTagMenu"), "click", { detail: 1, ctrlKey: true, altKey: true });
  assert.equal(manager.getBinding("openTagMenu"), "RightClick", "not committed yet");
  await wait(350);
  assert.equal(manager.getBinding("openTagMenu"), "Ctrl+Alt+Click");
});

test("a recorded double-click is committed as DoubleClick", async () => {
  const { manager, recordBtn, fire } = await setup();
  fire(recordBtn("openTagMenu"), "click", { detail: 1 });
  fire(recordBtn("openTagMenu"), "click", { detail: 1, shiftKey: true });
  fire(recordBtn("openTagMenu"), "click", { detail: 2, shiftKey: true });
  assert.equal(manager.getBinding("openTagMenu"), "Shift+DoubleClick");
  await wait(350);
  assert.equal(manager.getBinding("openTagMenu"), "Shift+DoubleClick", "the pending single click must not override it");
});

test("taking a gesture used by another action swaps them and says so", async () => {
  const { manager, notifications, recordBtn, fire } = await setup();
  fire(recordBtn("addReagentToNewSet"), "click", { detail: 1 });
  fire(recordBtn("addReagentToNewSet"), "contextmenu");
  fire(recordBtn("selectAsReagent"), "click", { detail: 1 });
  fire(recordBtn("selectAsReagent"), "contextmenu");
  assert.equal(manager.getBinding("selectAsReagent"), "RightClick");
  assert.equal(manager.getBinding("addReagentToNewSet"), "Ctrl+Click");
  assert.equal(recordBtn("addReagentToNewSet").textContent, "Ctrl+Click");
  assert.match(notifications.at(-1), /Add as reagent to a new set.*Ctrl\+Click/);
});

test("recording a plain click is refused (reserved for highlighting)", async () => {
  const { manager, notifications, recordBtn, fire } = await setup();
  fire(recordBtn("openTagMenu"), "click", { detail: 1 });
  fire(recordBtn("openTagMenu"), "click", { detail: 1 });
  await wait(350);
  assert.equal(manager.getBinding("openTagMenu"), "RightClick");
  assert.match(notifications.at(-1), /reserved/);
});

test("Escape cancels recording without changing anything", async () => {
  const { manager, recordBtn, fire } = await setup();
  fire(recordBtn("openTagMenu"), "click", { detail: 1 });
  recordBtn("openTagMenu").dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(recordBtn("openTagMenu").textContent, "Right-click");
  fire(recordBtn("openTagMenu"), "contextmenu", { ctrlKey: true });
  assert.equal(manager.getBinding("openTagMenu"), "RightClick", "no longer recording");
});

test("clear, per-action reset and reset all", async () => {
  const { manager, row, recordBtn } = await setup();
  const resetAll = () => document.querySelector("[data-shortcut-reset-all]");
  assert.equal(resetAll().disabled, true);

  row("selectAsReagent").querySelector('[data-role="clear"]').click();
  assert.equal(manager.getBinding("selectAsReagent"), null);
  assert.equal(recordBtn("selectAsReagent").textContent, "Unassigned");
  assert.equal(resetAll().disabled, false);

  row("selectAsReagent").querySelector('[data-role="reset"]').click();
  assert.equal(manager.getBinding("selectAsReagent"), "Ctrl+Click");

  manager.setBinding("openTagMenu", "DoubleClick");
  resetAll().click();
  assert.equal(manager.getBinding("openTagMenu"), "RightClick");
});

test("re-renders when the manager changes from elsewhere, and stops after unmount", async () => {
  const { manager, editor, recordBtn } = await setup();
  manager.setBinding("openTagMenu", "Ctrl+DoubleClick");
  assert.equal(recordBtn("openTagMenu").textContent, "Ctrl+Double-click");

  editor.unmount();
  manager.resetToDefaults();
  assert.equal(document.getElementById("host").innerHTML, "");
});

test("a quick single click right after starting to record is not mistaken for a double-click", async () => {
  const { manager, recordBtn, fire } = await setup();
  fire(recordBtn("openTagMenu"), "click", { detail: 1 });
  fire(recordBtn("openTagMenu"), "click", { detail: 2, altKey: true }); // browser counts the starting click
  await wait(350);
  assert.equal(manager.getBinding("openTagMenu"), "Alt+Click");
});
