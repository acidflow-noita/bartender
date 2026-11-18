import {html} from 'htl';
import {icon} from './icons.js';
import {numberText} from './format.js';

// Sort the complete result set before taking a render batch. Equal values retain
// source order; zero, missing values and duplicate reactions stay distinct.
export function sortRows(data, key, reverse = false) {
  if (!key) return [...data];
  return [...data].sort((a, b) => {
    const x = a[key], y = b[key];
    if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1;
    const comparison = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
    return reverse ? -comparison : comparison;
  });
}

export function table(data, {columns = Object.keys(data[0] ?? {}), header = {}, format = {},
  align = {}, width = {}, sortBy = {}, sort, reverse = false, sortable = true, rows = 30, height = 560,
  eager = false, compact = false, fitViewport = false, viewportGap = 8, minWidth, caption = 'Results'} = {}) {
  let source = data, ordered, first = 0, rendered = 0, fittedWidth = -1, observedShell = false, disposed = false;
  const batch = Math.max(1, rows * 2);
  const cssSize = value => typeof value === 'number' ? `${value}px` : value;
  const body = html`<tbody></tbody>`;
  const more = html`<button type="button" class="btn-text theme-primary">Show more rows</button>`;
  const earlier = html`<button type="button" class="btn-text theme-primary mx-4 my-2">Show earlier rows</button>`;
  const footer = html`<div hidden class="table-footer d-flex flex-wrap align-items-center gap-3 px-4 py-2">${more}</div>`;
  const scrollHint = html`<small class="fg-3 d-block px-4 py-2" hidden>Scroll sideways to see all columns</small>`;
  const colgroup = columns.map(key => html`<col style=${{width: cssSize(width[key])}}>`);
  const headers = columns.map(key => {
    const cell = html`<th scope="col">${sortable ? html`<button type="button" class="btn-text btn-sm"><span class="table-heading-label">${header[key] ?? key}</span><span class="table-sort-indicator" aria-hidden="true">${icon('arrow-down')}</span></button>` : header[key] ?? key}</th>`;
    if (align[key]) cell.style.textAlign = align[key];
    if (sortable) cell.querySelector('button').addEventListener('click', () => root.setSort(key, sort === key ? !reverse : false));
    return cell;
  });
  const element = html`<table class=${`table table-hover align-middle${compact ? ' table-sm' : ''}`} style=${{minWidth: cssSize(minWidth)}}><caption class="visually-hidden">${caption}</caption><colgroup>${colgroup}</colgroup><thead><tr>${headers}</tr></thead>${body}</table>`;
  const root = html`<div class="data-table table-responsive" tabindex="0" role="region" aria-label=${caption} style=${{maxHeight: cssSize(height)}}>${scrollHint}${element}
    ${footer}
  </div>`;
  const ownerDocument = root.ownerDocument, view = ownerDocument.defaultView;

  // Fit content once per available width. Sorting and lazy insertion keep the
  // same columns instead of allowing each new batch to resize the entire table.
  function fitColumns() {
    const available = root.clientWidth;
    if (!available || available === fittedWidth) return;
    element.style.tableLayout = 'auto';
    colgroup.forEach((col, i) => {col.style.width = cssSize(width[columns[i]]) ?? '';});
    const sizes = headers.map(cell => cell.getBoundingClientRect().width);
    if (sizes.some(size => !size)) return;
    colgroup.forEach((col, i) => {col.style.width = `${sizes[i]}px`;});
    element.style.tableLayout = 'fixed';
    fittedWidth = available;
  }
  function refreshLayout() {
    if (disposed || !root.isConnected) return;
    fitColumns();
    scrollHint.hidden = element.getBoundingClientRect().width <= root.clientWidth + 1;
    if (!fitViewport) return;
    const main = root.closest('main');
    const footer = ownerDocument.querySelector('.site-footer');
    if (!observedShell && observer) {
      for (const node of [main, footer, ownerDocument.getElementById('site-header')]) if (node) observer.observe(node);
      observedShell = true;
    }
    const bottomPadding = main ? parseFloat(view.getComputedStyle(main).paddingBottom) || 0 : 0;
    const card = root.closest('.card');
    const cardStyle = card ? view.getComputedStyle(card) : null;
    const cardBottom = cardStyle ? ['paddingBottom', 'borderBottomWidth', 'marginBottom']
      .reduce((total, key) => total + (parseFloat(cardStyle[key]) || 0), 0) : 0;
    const top = root.getBoundingClientRect().top + view.scrollY;
    const available = Math.floor((view.visualViewport?.height ?? view.innerHeight) - top
      - (footer?.getBoundingClientRect().height ?? 0) - bottomPadding - cardBottom - viewportGap);
    const firstRow = body.firstElementChild;
    const rowHeight = firstRow?.getBoundingClientRect().height ?? 0;
    const cellStyle = firstRow?.cells[0] ? view.getComputedStyle(firstRow.cells[0]) : null;
    const normalRow = cellStyle ? parseFloat(cellStyle.lineHeight) * 2
      + (parseFloat(cellStyle.paddingTop) || 0) + (parseFloat(cellStyle.paddingBottom) || 0) : rowHeight;
    const minimum = (root.contains(scrollHint) ? scrollHint.getBoundingClientRect().height : 0)
      + element.tHead.getBoundingClientRect().height + Math.min(rowHeight, Number.isFinite(normalRow) ? normalRow : rowHeight)
      + root.offsetHeight - root.clientHeight;
    // If the controls already fill a small screen, use ordinary page scrolling
    // with the explicit load-more button, rather than nesting vertical scrollers.
    const nextHeight = available > 0 && available >= minimum ? `${available}px` : 'none';
    if (root.style.maxHeight !== nextHeight) root.style.maxHeight = nextHeight;
    if (nextHeight !== 'none' && root.clientHeight > 0 && root.scrollHeight <= root.clientHeight && rendered < ordered.length) append();
  }
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(refreshLayout) : null;
  observer?.observe(root);
  if (fitViewport) {
    view.addEventListener('resize', refreshLayout);
    view.visualViewport?.addEventListener('resize', refreshLayout);
    ownerDocument.fonts?.ready?.then(refreshLayout);
  }

  function rowFragment(start, end) {
    const fragment = ownerDocument.createDocumentFragment();
    for (let i = start; i < end; i++) {
      const row = ordered[i];
      const tr = html`<tr>${columns.map(key => {
        const value = row[key];
        const cell = html`<td>${format[key] ? format[key](value, i, row) : typeof value === 'number' ? numberText(value) : value ?? '—'}</td>`;
        if (align[key]) cell.style.textAlign = align[key];
        return cell;
      })}</tr>`;
      fragment.append(tr);
    }
    return fragment;
  }
  function renderRows(append = false) {
    const start = append ? rendered : first;
    const end = eager ? ordered.length : Math.min(ordered.length, start + batch);
    const fragment = rowFragment(start, end);
    const scrollLeft = root.scrollLeft;
    if (append) body.append(fragment);
    else body.replaceChildren(fragment);
    rendered = end;
    if (!append) root.scrollTop = 0;
    root.scrollLeft = scrollLeft;
    footer.hidden = eager || rendered === ordered.length;
  }
  function render(anchor) {
    ordered = sortRows(source, sortBy[sort] ?? sort, reverse);
    const index = anchor == null || eager ? -1 : ordered.indexOf(anchor);
    // A shared result can be thousands of rows down. Start near it and extend
    // the same table in either direction as the reader scrolls.
    first = index < batch ? 0 : Math.min(index - Math.floor(batch / 2), ordered.length - batch);
    if (first) element.before(earlier);
    else earlier.remove();
    headers.forEach((th, i) => {
      if (!sortable) return;
      th.setAttribute('aria-sort', columns[i] === sort ? (reverse ? 'descending' : 'ascending') : 'none');
      const indicator = th.querySelector('.table-sort-indicator');
      indicator.style.visibility = columns[i] === sort ? 'visible' : 'hidden';
      indicator.replaceChildren(icon(reverse ? 'arrow-down' : 'arrow-up'));
    });
    renderRows();
    refreshLayout();
    if (index >= 0 && root.isConnected) {
      const row = body.rows[index - first].getBoundingClientRect(), viewport = root.getBoundingClientRect();
      if (first > 0 || row.bottom > viewport.bottom) root.scrollTop += row.top - viewport.top - element.tHead.offsetHeight;
    }
  }
  const append = () => {renderRows(true);};
  const prepend = (keepPosition = false) => {
    const next = Math.max(0, first - batch), top = root.scrollTop, height = root.scrollHeight;
    body.prepend(rowFragment(next, first)); first = next;
    if (!first) earlier.remove();
    if (keepPosition) root.scrollTop = top + root.scrollHeight - height;
  };
  const scroll = () => {
    if (root.scrollHeight <= root.clientHeight) return;
    if (first > 0 && root.scrollTop < Math.min(200, root.clientHeight / 2)) prepend(true);
    else if (rendered < ordered.length && root.scrollHeight - root.scrollTop - root.clientHeight < 200) append();
  };
  const loadEarlier = () => prepend();
  earlier.addEventListener('click', loadEarlier);
  root.addEventListener('scroll', scroll, {passive: true}); more.addEventListener('click', append);
  root.setData = (rows, anchor) => {source = rows; render(anchor);};
  root.setSort = (key, descending = false) => {sort = key; reverse = descending; render();};
  root.loadMore = append;
  root.overflowHint = scrollHint;
  root.dispose = () => {
    if (disposed) return;
    disposed = true; observer?.disconnect();
    earlier.removeEventListener('click', loadEarlier);
    root.removeEventListener('scroll', scroll); more.removeEventListener('click', append);
    if (fitViewport) {
      view.removeEventListener('resize', refreshLayout);
      view.visualViewport?.removeEventListener('resize', refreshLayout);
    }
  };
  render();
  return root;
}
