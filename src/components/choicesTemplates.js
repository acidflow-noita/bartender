import {html} from "htl";
import {icon, decorateRemoveButton} from '../ui/icons.js';
import {materialTypeClass} from './materialTypeStyles.js';

export function materialDisplayName(item) {
  const name = item?.name || item?.id || '';
  return item?.tags?.includes('[box2d]') ? `${name} (object)` : name;
}

export function choiceLabel(name, id, type, {code = false} = {}) {
  return html`<span class="choices-label"><span class="material-name-text">${name}</span> <span class="choices-id">(<span class=${materialTypeClass(type)}>${code ? html`<code>${id}</code>` : id}</span>)</span></span>`;
}

// Shared by Reactions Finder and digging: preserve Choices' own option
// attributes and buttons, then add the same image, name, and material ID.
export function createChoicesTemplates(Choices, {getItem, getImageUrl}) {
  return function () {
    const decorate = (kind, args) => {
      const node = Choices.defaults.templates[kind].apply(this, args);
      const data = args[1];
      const item = getItem(data.value);
      const name = item?.name || data.label?.split(" (")[0] || data.value;
      const remove = decorateRemoveButton(node.querySelector("button[data-button]"));
      node.title = `${name} (${data.value})`;
      node.replaceChildren(html.fragment`
        ${String(data.value).startsWith('[') ? icon('tag') : html`<img src="${getImageUrl(data.value)}" width="24" height="24" alt="" loading="lazy"
          style="object-fit:contain;image-rendering:pixelated;">`}
        ${choiceLabel(name, data.value, item?.type || data.type, {code: kind === 'item'})}
      `);
      if (remove) node.append(remove);
      return node;
    };
    return {choice: (...args) => decorate("choice", args), item: (...args) => decorate("item", args)};
  };
}
