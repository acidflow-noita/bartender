import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

class Element extends EventTarget {}
class Choices {
  static instances = [];
  constructor(select, options) {
    this.select = select;
    this.options = options;
    this.selected = options.choices.filter((choice) => choice.selected).map((choice) => choice.value);
    Choices.instances.push(this);
  }
  getValue() { return this.select.multiple ? [...this.selected] : this.selected[0] ?? ""; }
  setChoiceByValue(value) {
    for (const id of Array.isArray(value) ? value : [value]) {
      if (!this.options.choices.some((choice) => choice.value === id) || this.selected.includes(id)) continue;
      if (!this.select.multiple) this.selected = [];
      this.selected.push(id);
      this.select.dispatchEvent(new Event("change"));
    }
  }
  removeActiveItems() { this.selected = []; this.select.dispatchEvent(new Event("change")); }
  destroy() { this.destroyed = true; }
}
const source = readFileSync(new URL("../src/digging/select.js", import.meta.url), "utf8")
  .replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "");
const create = runInNewContext(source + "\ncreateDiggingSelect", {
  Choices, Event, createChoicesTemplates: () => () => ({}), itemImage: () => "",
  html: (strings, ...values) => {
    const element = new Element();
    if (strings[0].startsWith("<select")) element.multiple = values[2];
    return element;
  },
});
const items = [{id: "DIGGER", name: "Digging Bolt"}, {id: "NUKE", name: "Nuke"}, {id: "ACIDSHOT", name: "Acid Ball"}];
const ids = (picker) => Array.from(picker.element.value, (item) => item.id);

test("multiselect restores URL order, supports adding/removing spells, and resets atomically", () => {
  const picker = create(items, {label: "Spells", kind: "spells", multiple: true, value: ["NUKE", "DIGGER"]});
  const choices = Choices.instances.at(-1);
  assert.equal(choices.select.multiple, true);
  assert.equal(choices.options.removeItemButton, true);
  assert.equal(choices.options.closeDropdownOnSelect, false);
  assert.deepEqual(ids(picker), ["NUKE", "DIGGER"], "chip order must follow the link, not alphabetical options");
  let events = 0;
  picker.element.addEventListener("input", () => events++);
  choices.setChoiceByValue("ACIDSHOT");
  assert.deepEqual(ids(picker), ["NUKE", "DIGGER", "ACIDSHOT"]);
  assert.equal(events, 1);
  picker.setValue(["ACIDSHOT", "DIGGER", "ACIDSHOT", "missing"]);
  assert.deepEqual(ids(picker), ["ACIDSHOT", "DIGGER"]);
  assert.equal(events, 2, "programmatic restoration emits only its final selection");
  picker.setValue([]);
  assert.deepEqual(ids(picker), []);
  assert.equal(events, 3);
  picker.dispose();
  assert.equal(choices.destroyed, true);
});

test("the material field remains a single selection with an empty initial state", () => {
  const picker = create(items, {label: "Material", kind: "materials", value: null});
  const choices = Choices.instances.at(-1);
  assert.equal(choices.select.multiple, false);
  assert.equal(choices.options.closeDropdownOnSelect, true);
  assert.equal(picker.element.value, null);
  picker.setValue("DIGGER");
  assert.equal(picker.element.value.id, "DIGGER");
  picker.setValue("NUKE");
  assert.equal(picker.element.value.id, "NUKE");
  picker.setValue(null);
  assert.equal(picker.element.value, null);
});
