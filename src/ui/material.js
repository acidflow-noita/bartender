import {html} from 'htl';
import {materialTypeClass} from '../components/materialTypeStyles.js';
import {icon} from './icons.js';

export function materialTagLink(tag, metadata, {badge = false} = {}) {
  const classes = badge ? 'badge badge-outline theme-secondary' : '';
  return metadata?.url ? html`<a class=${`icon-link icon-link-hover ${classes}`.trim()} href=${metadata.url} target="_blank" rel="noopener">${tag}${icon('box-arrow-up-right')}</a>`
    : html`<span class=${classes}>${tag}</span>`;
}

export const IMAGE_BASE = 'https://noita-bartender-images.acidflow.stream/images';
export function materialCell(item, fallback = '') {
  if (!item && !fallback) return '';
  const id = item?.id ?? fallback, name = item?.name || id;
  const content = html`<span><span class="material-name-text">${name}</span><br><code class=${materialTypeClass(item?.type)}>${id}</code></span>`;
  const image = html`<img src=${`${IMAGE_BASE}/materials/${item?.image_local || `Material_${id}.png`}`} width="28" height="28" alt="" loading="lazy">`;
  image.addEventListener('error', () => {image.style.visibility = 'hidden';}, {once: true});
  const location = globalThis.location;
  const current = location && location.pathname.replace(/\.html$/, '').replace(/\/$/, '') === '/materials'
    && new URLSearchParams(location.search).get('material') === id;
  return html`<span class="material-cell">${item?.id && !current
    ? html`<a href=${`/materials?material=${encodeURIComponent(id)}`} aria-label=${`View ${name} properties`}>${image}${content}</a>` : html.fragment`${image}${content}`}</span>`;
}
