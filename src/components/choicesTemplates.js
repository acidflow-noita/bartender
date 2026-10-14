import {html} from "htl";

// Shared by Reactions Finder and digging: preserve Choices' own option
// attributes and buttons, then add the same image, name, and material ID.
export function createChoicesTemplates(Choices, {getItem, getImageUrl}) {
  return function () {
    const decorate = (kind, args) => {
      const node = Choices.defaults.templates[kind].apply(this, args);
      const data = args[1];
      const item = getItem(data.value);
      const name = item?.name || data.label?.split(" (")[0] || data.value;
      const type = String(item?.type || data.type || "").toLowerCase().replace(/[^a-z]/g, "");
      const remove = node.querySelector("button[data-button]");
      node.title = `${name} (${data.value})`;
      node.replaceChildren(html.fragment`
        <img src="${getImageUrl(data.value)}" width="24" height="24" alt="" loading="lazy"
          style="display:inline-block;vertical-align:middle;margin-right:8px;object-fit:contain;image-rendering:pixelated;">
        <span class="material-name-text">${name}</span>
        (<span class="material-type-${type}">${kind === "item" ? html`<code>${data.value}</code>` : data.value}</span>)
      `);
      if (remove) node.append(remove);
      return node;
    };
    return {choice: (...args) => decorate("choice", args), item: (...args) => decorate("item", args)};
  };
}
