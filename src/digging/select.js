import Choices from "npm:choices.js@11.1.0";
import {html} from "htl";
import {itemImage} from "./view.js";
import {createChoicesTemplates} from "../components/choicesTemplates.js";

let nextId = 0;

export function createDiggingSelect(items, {label, kind, value}) {
  const id = `digging-select-${++nextId}`;
  const labelId = `${id}-label`;
  const catalog = new Map(items.map((item) => [item.id, item]));
  const displayItem = (item) => kind === "materials" && item?.tags?.includes("[box2d]")
    ? {...item, name: `${item.name || item.id} (object)`} : item;
  // A single select keeps search in the dropdown, out of the selected field.
  const select = html`<select id=${id} aria-label=${label}></select>`;
  const element = html`<div class="card digging-field"><label id=${labelId} for=${id}>${label}</label>${select}</div>`;
  const choices = new Choices(select, {
    labelId,
    choices: [...items].sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id)
      || Number(a.tags?.includes("[box2d]") || false) - Number(b.tags?.includes("[box2d]") || false)
      || a.id.localeCompare(b.id)).map((item) => ({
      value: item.id, label: `${displayItem(item).name || item.id} (${item.id})`, selected: item.id === value,
    })),
    allowHTML: false,
    shouldSort: false,
    removeItemButton: false,
    renderSelectedChoices: "always",
    closeDropdownOnSelect: true,
    itemSelectText: "",
    searchEnabled: true,
    searchFields: ["label", "value"],
    searchResultLimit: 100,
    searchPlaceholderValue: `Search ${label.toLowerCase()} names or IDs`,
    callbackOnCreateTemplates: createChoicesTemplates(Choices, {
      getItem: (id) => displayItem(catalog.get(id)),
      getImageUrl: (id) => itemImage(catalog.get(id) || {}, kind),
    }),
  });
  Object.defineProperty(element, "value", {get: () => catalog.get(select.value) ?? null});
  const notify = () => element.dispatchEvent(new Event("input", {bubbles: true}));
  select.addEventListener("change", notify);
  // Typing in Choices' search box must not act like a changed selection.
  element.addEventListener("input", (event) => {
    if (event.target !== element) event.stopImmediatePropagation();
  });
  return {
    element,
    setValue(id) {
      if (!catalog.has(id)) return;
      choices.setChoiceByValue(id);
      notify();
    },
    dispose() {
      select.removeEventListener("change", notify);
      choices.destroy();
    },
  };
}
