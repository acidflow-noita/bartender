import Choices from "npm:choices.js@11.1.0";
import { html } from "npm:htl";
import { materialName, selectedMaterial } from "./catalog.js";

const images = "https://noita-bartender-images.acidflow.stream/images/materials/";
let nextId = 0;

export function materialNode(id, catalog) {
  if (id === "NOTHING") id = "air";
  if (id === "OTHER" || id === "presentation") return html`<span class="fs-held">Held material</span>`;
  if (!id) return html`<span class="fs-muted">—</span>`;
  id = String(id); // Match the source table's text conversion without altering engine data.
  const material = catalog.get(id) ?? {id, name: materialName(id), type: "N/A"};
  const image = html`<img src=${images + encodeURIComponent(material.image_local || `Material_${id}.png`)} alt="" width="24" height="24" loading="lazy">`;
  image.addEventListener("error", () => {
    if (image.dataset.fallback) image.style.visibility = "hidden";
    else { image.dataset.fallback = "1"; image.src = images + "no_image_available.png"; }
  });
  const type = String(material.type).toLowerCase().replace(/[^a-z]/g, "");
  return html`<span class="fs-material" title=${`${material.name} (${id})`}>
    ${image}<span class="material-name-text">${material.name}</span><span class=${`material-type-${type}`}>(${id})</span>
  </span>`;
}

// One stable Choices instance per field. Its backing select is never recreated
// for seed changes, toggles, search progress, or slider movement.
export function materialSelect(catalog, {label, value = "air", count = false, placeholder = "Search materials…", onChange = () => {}}) {
  const id = `fs-material-${++nextId}`;
  let map = new Map(catalog.map((m) => [m.id, m]));
  let muted = false;
  const select = html`<select id=${id} multiple aria-label=${label}></select>`;
  const counter = html`<span class="fs-material-count">(${catalog.length})</span>`;
  const root = html`<div class="fs-material-field"><label for=${id}>${label} ${count ? counter : ""}</label>${select}</div>`;
  const options = (materials, selected) => materials.map((m) => ({value: m.id, label: `${m.name} (${m.id})`, selected: m.id === selected}));
  const choices = new Choices(select, {
    // An implicit Air sentinel is an empty field, not a preselected chip.
    choices: options([...catalog].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0), value === "air" ? "" : value), allowHTML: false, shouldSort: false,
    maxItemCount: 1, singleModeForMultiSelect: true, closeDropdownOnSelect: true,
    renderSelectedChoices: "always", removeItemButton: true, itemSelectText: "",
    searchEnabled: true, searchFields: ["label", "value"], searchResultLimit: 100, renderChoiceLimit: -1,
    placeholder: true, placeholderValue: placeholder,
    callbackOnCreateTemplates() {
      const decorate = (kind, args) => {
        const node = Choices.defaults.templates[kind].apply(this, args);
        const remove = node.querySelector("button[data-button]");
        node.replaceChildren(materialNode(args[1].value, map));
        if (remove) node.append(remove);
        return node;
      };
      return {choice: (...args) => decorate("choice", args), item: (...args) => decorate("item", args)};
    },
  });
  select.addEventListener("change", () => {
    if (muted) return;
    const value = selectedMaterial(choices.getValue(true));
    // Clearing stays visually empty; only the model receives the Air sentinel.
    onChange(value);
  });
  return {
    element: root,
    get value() { return selectedMaterial(choices.getValue(true)); },
    setValue(value) {
      value = value || "air";
      if (selectedMaterial(choices.getValue(true)) === value) return;
      muted = true;
      try {
        choices.removeActiveItems();
        if (value !== "air") choices.setChoiceByValue(value);
      }
      finally { muted = false; }
    },
    setCatalog(materials, value = selectedMaterial(choices.getValue(true))) {
      muted = true;
      try {
        const nextMap = new Map(materials.map((m) => [m.id, m]));
        const additions = materials.filter((m) => !map.has(m.id));
        const reset = [...map.keys()].some((id) => !nextMap.has(id));
        map = nextMap;
        counter.textContent = "(" + materials.length + ")";
        const current = choices.getValue(true);
        const displayed = (Array.isArray(current) ? current[0] : current) || "";
        const selected = value === "air" && displayed !== "air" ? "" : value;
        if (reset) {
          // Only an explicit reset can discard earlier options. New fields
          // sort IDs like dream(); ordinary additions append like imagine_real.
          const sorted = [...materials].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
          choices.setChoices(options(sorted, selected), "value", "label", true, true, true);
        } else {
          if (additions.length) choices.setChoices(options(additions, ""), "value", "label", false, false, false);
          if (displayed !== selected) {
            choices.removeActiveItems();
            if (selected) choices.setChoiceByValue(selected);
          }
        }
      } finally { muted = false; }
    },
    dispose() { choices.destroy(); },
  };
}
