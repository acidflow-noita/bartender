import Choices from "choices.js";
import {html} from "htl";
import {itemImage} from "./view.js";
import {createChoicesTemplates, materialDisplayName} from "../components/choicesTemplates.js";
import {setControlDisabled} from '../ui/disabled.js';

let nextId = 0;

export function createDiggingSelect(items, {label, kind, value, multiple = false, maxItems = Infinity,
  placeholder = multiple ? 'Search' : kind === 'materials' ? 'Select a material' : 'Select a spell'}) {
  const id = `digging-select-${++nextId}`;
  const labelId = `${id}-label`;
  const catalog = new Map(items.map((item) => [item.id, item]));
  const displayItem = (item) => kind === "materials" && item?.tags?.includes("[box2d]")
    ? {...item, name: materialDisplayName(item)} : item;
  const limit = multiple && Number.isInteger(maxItems) && maxItems >= 0 ? maxItems : Infinity;
  const normalize = (value) => [...new Set((Array.isArray(value) ? value : value ? [value] : [])
    .filter((id) => catalog.has(id)))].slice(0, limit);
  const selected = new Set(normalize(value));
  const select = html`<select id=${id} aria-label=${label} multiple=${multiple}></select>`;
  const element = html`<div class="form-field digging-field d-flex flex-column w-100"><label class="form-label" id=${labelId} for=${id}>${label}${Number.isFinite(limit) ? ` (max ${limit})` : ""}</label>${select}</div>`;
  const choices = new Choices(select, {
    labelId,
    placeholder: true,
    placeholderValue: placeholder,
    choices: [...items].sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id)
      || Number(a.tags?.includes("[box2d]") || false) - Number(b.tags?.includes("[box2d]") || false)
      || a.id.localeCompare(b.id)).map((item) => ({
      value: item.id, label: `${displayItem(item).name || item.id} (${item.id})`, selected: !multiple && selected.has(item.id),
    })),
    allowHTML: false,
    shouldSort: false,
    removeItemButton: multiple,
    maxItemCount: Number.isFinite(limit) && limit > 0 ? limit : -1,
    maxItemText: (count) => `Select up to ${count} spells.`,
    renderSelectedChoices: "always",
    closeDropdownOnSelect: !multiple,
    itemSelectText: "",
    searchEnabled: true,
    searchFields: ["label", "value"],
    searchResultLimit: 100,
    renderChoiceLimit: 100,
    searchPlaceholderValue: multiple ? "Search" : `Search ${kind === 'materials' ? 'material' : 'spell'} names or IDs`,
    callbackOnCreateTemplates() {
      const templates = createChoicesTemplates(Choices, {
        getItem: (id) => displayItem(catalog.get(id)),
        getImageUrl: (id) => itemImage(catalog.get(id) || {}, kind),
      }).call(this);
      return {...templates, item: (...args) => args[1].placeholder
        ? Choices.defaults.templates.item.apply(this, args) : templates.item(...args)};
    },
  });
  if (limit === 0) {
    choices.disable();
    setControlDisabled(select, true, 'This page address is too long to fit a spell selection in a shareable link.');
  }
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
      const ids = normalize(id);
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
