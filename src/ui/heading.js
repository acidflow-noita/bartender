import {html} from 'htl';

function releaseMark(label, symbol, tag) {
  const mark = document.createElement(tag);
  mark.className = `${label.toLowerCase()}-mark`;
  mark.setAttribute('aria-label', label);
  mark.textContent = symbol;
  return mark;
}
export const betaMark = (tag = 'span') => releaseMark('Beta', 'β', tag);
export const alphaMark = (tag = 'span') => releaseMark('Alpha', 'α', tag);
export const pageHeading = (title, {alpha = false, beta = false, compact = false} = {}) => html`<h1 class=${compact ? 'page-title mb-3 lg:mb-5' : 'page-title'}><span id="acidTitle" class="bartender-heading-decrypted">${title}</span>${alpha ? alphaMark() : beta ? betaMark() : ''}</h1>`;
