export const DEFAULT_MATERIAL = 'magic_liquid_protection_all';

export function initialMaterial(href, materials) {
  const params = new URL(href).searchParams;
  const id = params.has('material') ? params.get('material') : DEFAULT_MATERIAL;
  return materials.some(material => material.id === id) ? id : null;
}

export function materialUrl(href, id) {
  const url = new URL(href);
  const base = `${url.origin}${url.pathname}`;
  if (/[%,\s]/.test(base) || id != null && (typeof id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(id))) throw new TypeError('Share URLs require a plain material ID and page address.');
  const result = base + (id ? `?material=${id}` : '');
  if (result.length >= 500) throw new RangeError('Share URLs must be shorter than 500 characters.');
  return result;
}
