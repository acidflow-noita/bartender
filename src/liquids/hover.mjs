let nextHoverId = 0;

export function hoveredMaterial(world, point, displayCells = world.cells) {
  if (!point) return null;
  const x = Math.max(0, Math.min(world.width - 1, Math.floor(point.x)));
  const y = Math.max(0, Math.min(world.height - 1, Math.floor(point.y)));
  const physicalCell = world.cells[y * world.width + x];
  const cell = typeof displayCells === 'function' ? displayCells(point.x, point.y) : displayCells[y * world.width + x];
  const material = world.materials[cell];
  return {x, y, cell, name: material?.name ?? (cell === 65535 ? 'Boundary' : 'Air'),
    id: material?.id ?? (cell === 65535 ? 'boundary' : 'air'),
    type: material?.type ?? (cell === 65535 ? 'Solid' : 'Empty'),
    physicalCell, surface: physicalCell !== cell};
}

export function createMaterialHover(canvas, world, displayCells = world.cells) {
  const document = canvas.ownerDocument, view = document.defaultView, host = canvas.parentElement;
  const element = document.createElement('div');
  element.className = 'card liquid-hover'; element.hidden = true;
  element.id = `liquid-hover-${++nextHoverId}`; element.setAttribute('role', 'tooltip');
  const name = document.createElement('strong'), id = document.createElement('code'), detail = document.createElement('span');
  name.className = 'liquid-hover-name'; id.className = 'liquid-hover-id'; detail.className = 'liquid-hover-detail';
  element.append(name, id, detail); host.append(element);
  const describedBy = canvas.getAttribute('aria-describedby');
  canvas.setAttribute('aria-describedby', [describedBy, element.id].filter(Boolean).join(' '));
  let cursor = null, geometry = null, width = 240, height = 74, disposed = false;

  const measure = () => {
    const bounds = canvas.getBoundingClientRect(), parent = host.getBoundingClientRect();
    geometry = {x: bounds.left - parent.left, y: bounds.top - parent.top, width: bounds.width, height: bounds.height};
    element.style.setProperty('--liquid-hover-limit', `${Math.max(0, bounds.width - 12)}px`);
  };
  const place = () => {
    if (!cursor || element.hidden) return;
    if (!geometry) measure();
    const px = geometry.x + (cursor.x + .5) * geometry.width / world.width;
    const py = geometry.y + (cursor.y + .5) * geometry.height / world.height;
    let x = px + 14, y = py + 14;
    if (x + width > geometry.x + geometry.width - 4) x = px - width - 14;
    if (y + height > geometry.y + geometry.height - 4) y = py - height - 14;
    x = Math.max(geometry.x + 4, Math.min(x, geometry.x + geometry.width - width - 4));
    y = Math.max(geometry.y + 4, Math.min(y, geometry.y + geometry.height - height - 4));
    element.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  };
  const invalidate = () => {geometry = null; place();};
  const observer = view.ResizeObserver ? new view.ResizeObserver(entries => {
    for (const entry of entries) {
      if (entry.target === element) {
        const size = entry.borderBoxSize?.[0];
        if (size) {width = size.inlineSize; height = size.blockSize;}
        else {const bounds = element.getBoundingClientRect(); width = bounds.width; height = bounds.height;}
      } else geometry = null;
    }
    place();
  }) : null;
  observer?.observe(canvas); observer?.observe(element);
  view.addEventListener('resize', invalidate);
  const setText = (node, text) => {if (node.textContent !== text) node.textContent = text;};
  return {
    element,
    update(point) {
      if (disposed) return null;
      const material = hoveredMaterial(world, point, displayCells);
      cursor = point;
      if (!material) {element.hidden = true; return null;}
      const first = element.hidden;
      setText(name, material.name); setText(id, material.id);
      setText(detail, `${material.type}${material.surface ? ' surface' : ''}`);
      element.dataset.material = material.id;
      element.hidden = false;
      if (first || !observer) {
        if (!geometry) measure();
        const bounds = element.getBoundingClientRect();
        width = bounds.width; height = bounds.height;
      }
      place();
      return material;
    },
    dispose() {
      disposed = true; observer?.disconnect(); view.removeEventListener('resize', invalidate);
      element.remove();
      if (describedBy === null) canvas.removeAttribute('aria-describedby');
      else canvas.setAttribute('aria-describedby', describedBy);
    },
  };
}
