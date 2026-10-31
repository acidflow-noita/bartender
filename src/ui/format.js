// Group the integer part without rounding decimals or coercing XML strings.
// IDs, hexadecimal colors, and other text are left alone by their renderers.
export function formatNumber(value) {
  return String(value).replace(/^(\s*[+-]?)(\d+)(?=\.|[eE]|\s*$)/, (_match, sign, integer) =>
    sign + integer.replace(/\B(?=(\d{3})+(?!\d))/g, ','));
}

// Separators are CSS-generated decoration. The selectable text stays exactly
// as supplied, so native text/HTML copying never includes grouping commas.
export function numberText(value, {quoted = false} = {}) {
  const raw = quoted ? JSON.stringify(value) : String(value);
  const grouped = quoted ? JSON.stringify(formatNumber(value)) : formatNumber(value);
  if (raw === grouped) return raw;
  const parts = grouped.split(',');
  const node = document.createElement('span');
  node.className = 'number-value';
  node.append(parts[0]);
  for (const part of parts.slice(1)) {
    const group = document.createElement('span');
    group.className = 'number-group';
    group.textContent = part;
    node.append(group);
  }
  return node;
}
