import {formatNumber} from '../ui/format.js';

export function referenceSections(record) {
  return [
    {key: 'catalog', label: 'Reference', file: 'FULL_MATERIALS_FINAL.json', value: record.catalog},
    {key: 'native', label: 'Runtime', file: 'materials.json', value: record.native},
    ...record.xml.map((node, i) => ({key: 'xml', label: `XML${record.xml.length > 1 ? ` (${i + 1})` : ''}`,
      file: 'materials.xml', kind: node.kind, value: node.definition})),
    ...record.parents.flatMap(parent => parent.definitions.map((node, i) => ({key: 'parents',
      label: `Parent XML: ${parent.id}${parent.definitions.length > 1 ? ` (${i + 1})` : ''}`,
      file: 'materials.xml', kind: node.kind, material: parent.id, value: node.definition}))),
  ];
}

export function propertyLeaves(value, path = []) {
  const entries = value !== null && typeof value === 'object' ? Object.entries(value) : [];
  return entries.length ? entries.flatMap(([key, child]) => propertyLeaves(child, [...path, Array.isArray(value) ? Number(key) : key])) : [{path, value}];
}

export function propertyPath(path) {
  return path.reduce((text, key) => typeof key === 'number' ? `${text}[${key}]`
    : /^[\w@#-]+$/.test(key) ? `${text}${text ? '.' : ''}${key}` : `${text}[${JSON.stringify(key)}]`, '');
}

const labels = {id: 'Material ID', ui_name: 'Translation key', type: 'Display type', cell_type: 'Engine cell type',
  original_cell_type: 'Original engine cell type', parent_material: 'Parent material', _parent: 'Parent material',
  hp: 'Hit points', hardness: 'Hardness', gfx_glow: 'Glow', unknown_field: 'Unknown field'};

export function propertyLabel(path, source) {
  if (typeof path.at(-1) === 'number') return `${propertyLabel(path.slice(0, -1), source)} [${path.at(-1)}]`;
  const key = String(path.at(-1) ?? '').replace(/^@/, '');
  if (key === 'hp' && source.key === 'native') return 'Hardness';
  return labels[key] ?? key.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ').replace(/^./, c => c.toUpperCase());
}

export function propertyText(value) {
  if (typeof value === 'string') return JSON.stringify(value);
  if (value === null || typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function isMaterialReference(row) {
  const key = String(row.path.at(-1) ?? '').replace(/^@/, '');
  return ['id', 'parent_material', '_parent', 'solid_break_to_type'].includes(key)
    || /(?:^|_)material(?:_name)?$/.test(key)
    || (key === 'name' && row.path.length === 1 && ['xml', 'parents'].includes(row.source.key));
}

export function isNumericPropertyValue(value, row) {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'string' || !['xml', 'parents'].includes(row.source.key) || isMaterialReference(row)) return false;
  const key = String(row.path.at(-1) ?? '').replace(/^@/, '').toLowerCase();
  if (key === 'color' || key.endsWith('_color')) return false;
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim()) && Number.isFinite(Number(value));
}

export function propertyDisplayText(value, row) {
  if (!isNumericPropertyValue(value, row)) return propertyText(value);
  const formatted = formatNumber(value);
  return typeof value === 'string' ? JSON.stringify(formatted) : formatted;
}

export function referenceRows(record) {
  return referenceSections(record).flatMap(source => propertyLeaves(source.value).map(({path, value}) => ({
    path, property: propertyPath(path), label: propertyLabel(path, source), value, source,
  })));
}

// Combine repeated declarations for display, retaining every original value.
// Parent declarations stay distinct from the selected material's own values.
export function referenceGroups(record) {
  const groups = new Map();
  for (const row of referenceRows(record)) {
    const path = row.source.key === 'native' && row.property === 'hp' ? ['hardness']
      : row.path.length === 1 && row.path[0] === '@name' ? ['id']
      : row.path.length === 1 && row.path[0] === '@_parent' ? ['parent_material']
      : row.path.map(key => typeof key === 'string' ? key.replace(/^@/, '') : key);
    const property = propertyPath(path);
    const parent = row.source.key === 'parents' ? row.source.material : null;
    const key = JSON.stringify([parent, property]);
    if (!groups.has(key)) groups.set(key, {...row, property,
      label: parent ? `${propertyLabel(path, row.source)} (parent: ${parent})` : propertyLabel(path, row.source), definitions: []});
    groups.get(key).definitions.push(row);
  }
  return [...groups.values()];
}

export function filterReferenceRows(rows, query = '', source = 'all') {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return rows.filter(row => (source === 'all' || row.source.key === source)
    && terms.every(term => `${row.label} ${row.property} ${propertyText(row.value)} ${propertyDisplayText(row.value, row)} ${row.source.label}`.toLocaleLowerCase().includes(term)));
}

