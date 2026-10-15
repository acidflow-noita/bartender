import Choices from "npm:choices.js@11.1.0";
import {html} from "htl";
import {itemImage} from "./view.js";
import {createChoicesTemplates} from "../components/choicesTemplates.js";

let nextId = 0;

export function createDiggingSelect(items, {label, kind, value, multiple = false}) {
  const id = `digging-select-${++nextId}`;
  const labelId = `${id}-label`;
  const catalog = new Map(items.map((item) => [item.id, item]));
  const displayItem = (item) => kind === "materials" && item?.tags?.includes("[box2d]")
    ? {...item, name: `${item.name || item.id} (object)`} : item;
  const selected = new Set(Array.isArray(value) ? value : value ? [value] : []);
  const select = html`<select id=${id} aria-label=${label} multiple=${multiple}></select>`;
  const element = html`<div class="card digging-field"><label id=${labelId} for=${id}>${label}</label>${select}</div>`;
  const choices = new Choices(select, {
    labelId,
    placeholder: true,
    placeholderValue: multiple ? "Select spells to compare" : `Select a ${label.toLowerCase()}`,
    choices: [...items].sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id)
      || Number(a.tags?.includes("[box2d]") || false) - Number(b.tags?.includes("[box2d]") || false)
      || a.id.localeCompare(b.id)).map((item) => ({
      value: item.id, label: `${displayItem(item).name || item.id} (${item.id})`, selected: !multiple && selected.has(item.id),
    })),
    allowHTML: false,
    shouldSort: false,
    removeItemButton: multiple,
    renderSelectedChoices: "always",
    closeDropdownOnSelect: !multiple,
    itemSelectText: "",
    searchEnabled: true,
    searchFields: ["label", "value"],
    searchResultLimit: 100,
    searchPlaceholderValue: `Search ${label.toLowerCase()} names or IDs`,
    callbackOnCreateTemplates() {
      const templates = createChoicesTemplates(Choices, {
        getItem: (id) => displayItem(catalog.get(id)),
        getImageUrl: (id) => itemImage(catalog.get(id) || {}, kind),
      }).call(this);
      return {...templates, item: (...args) => args[1].placeholder
        ? Choices.defaults.templates.item.apply(this, args) : templates.item(...args)};
    },
  });
  // Restore chip/comparison order from the URL rather than dropdown sorting.
  if (multiple && selected.size) choices.setChoiceByValue([...selected].filter((id) => catalog.has(id)));
  // A native single select may auto-select its first option even while
  // Choices displays its placeholder. Read the actual Choices selection.
  if (!multiple && !catalog.has(value)) select.value = "";
  Object.defineProperty(element, "value", {get: () => {
    const current = choices.getValue(true);
    return multiple ? (Array.isArray(current) ? current : current ? [current] : []).map((id) => catalog.get(id)).filter(Boolean)
      : catalog.get(current) ?? null;
  }});
  let updating = false;
  const notify = () => { if (!updating) element.dispatchEvent(new Event("input", {bubbles: true})); };
  select.addEventListener("change", notify);
  // Typing in Choices' search box must not act like a changed selection.
  element.addEventListener("input", (event) => {
    if (event.target !== element) event.stopImmediatePropagation();
  });
  return {
    element,
    setValue(id) {
      const ids = [...new Set((Array.isArray(id) ? id : id ? [id] : []).filter((key) => catalog.has(key)))];
      updating = true;
      try {
        choices.removeActiveItems();
        if (ids.length) choices.setChoiceByValue(multiple ? ids : ids[0]);
      } finally { updating = false; }
      notify();
    },
    dispose() {
      select.removeEventListener("change", notify);
      choices.destroy();
    },
  };
}
