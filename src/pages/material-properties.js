import {scalePow} from 'd3';

export const properties = [
  {key: 'hardness', title: 'Hardness', step: 1, exponent: 1 / 4, description: 'Hardness determines resistance to damage, secondarily to durability.'},
  {key: 'density', title: 'Liquid density', step: .5, exponent: 1 / 5, reverse: true, description: 'Liquids with different density values form layers. Some non-liquids have density too.'},
  {key: 'durability', title: 'Durability', step: 1, exponent: 1, description: "Durability determines material's resistance to damage."},
  {key: 'gfx_glow', title: 'Glow', step: 1, exponent: 1, description: 'Materials with glow properties that emit light in the darkness.'},
];

// These predicates preserve the original four pages' table and plot inputs.
// Missing and zero values are not silently converted to one another.
export function propertyRows(materials, key, maximum = Infinity) {
  return materials.filter(d => d[key] !== null && d[key] <= maximum && (key !== 'density' || d.type === 'Liquid'));
}
export function propertyPlotRows(materials, key, selected = null) {
  const rows = key === 'hardness' ? materials.filter(d => d.hardness !== null && d.durability !== null)
    : key === 'density' ? materials.filter(d => d.density !== null && d.density > 0 && d.name && d.image_local && d.type === 'Liquid')
    : materials.filter(d => d[key] !== null && d[key] > 0);
  const point = materials.find(d => d.id === selected?.id);
  // The overview keeps its original population. An explicitly selected zero
  // is still a real position; missing values and non-liquid density are not.
  if (point && !rows.includes(point) && Number.isFinite(point[key])
      && (key !== 'hardness' || Number.isFinite(point.durability)) && (key !== 'density' || point.type === 'Liquid')) return [...rows, point];
  return rows;
}

// Packing only changes the non-data horizontal coordinate. All y values and
// records survive. Try smaller markers when a dense group exceeds the frame.
export function packPropertyPoints(rows, property, width, height = 380, inset = 0) {
  const left = 64, right = Math.max(left + 1, width - 16), top = 18, bottom = height - 44;
  const values = rows.map(row => row[property.key]);
  let domain = [Math.min(...values), Math.max(...values)];
  if (!rows.length) domain = [0, 1];
  else if (domain[0] === domain[1]) domain = [Math.min(0, domain[0]), domain[1] || 1];
  let points = [], radius;
  for (radius = 7; radius >= .5; radius -= .5) {
    const y = scalePow().exponent(property.exponent).domain(domain)
      .range(property.reverse ? [top + radius + inset, bottom - radius - inset] : [bottom - radius - inset, top + radius + inset]);
    const center = (left + right) / 2, spacing = radius * 2 + 1;
    points = [];
    let fits = true;
    for (const row of rows) {
      const py = y(row[property.key]);
      const nearby = points.filter(point => Math.abs(point.y - py) < spacing);
      let px;
      for (let slot = 0; slot * spacing <= right - left; slot++) {
        const offset = Math.ceil(slot / 2) * spacing * (slot % 2 ? 1 : -1);
        const candidate = center + offset;
        if (candidate - radius < left + inset || candidate + radius > right - inset) continue;
        if (nearby.every(point => Math.hypot(point.x - candidate, point.y - py) >= spacing - 1e-6)) {px = candidate; break;}
      }
      if (px === undefined) {fits = false; break;}
      points.push({row, x: px, y: py});
    }
    if (fits) return {points, radius, domain, left, right, top, bottom};
  }
  throw new Error('Plot is too narrow to display these materials.');
}
