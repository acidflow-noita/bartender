import {html} from 'htl';
import {iconPaths} from '../generated/bootstrap-icons.js';

// Original Bootstrap SVG paths; include only the icons the app uses.
export function icon(name) {
  if (!iconPaths[name]) throw new Error(`Unknown Bootstrap icon: ${name}`);
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const [key, value] of Object.entries({class: `bi bi-${name}`, viewBox: '0 0 16 16', width: '1em', height: '1em', fill: 'currentColor', 'aria-hidden': 'true'})) node.setAttribute(key, value);
  node.innerHTML = iconPaths[name];
  return node;
}

export function iconLabel(name, label) {
  return html.fragment`${icon(name)}${label}`;
}

export function decorateRemoveButton(button) {
  if (button) button.replaceChildren(icon('x-lg'));
  return button;
}
