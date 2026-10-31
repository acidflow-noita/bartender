// Observe the actual plot host, including sidebar and grid changes.
export function observeWidth(host, render) {
  let last = -1;
  const update = width => {
    width = Math.floor(width);
    if (width <= 0 || width === last) return;
    last = width; render(width);
  };
  const observer = new ResizeObserver(entries => update(entries[0].contentRect.width));
  observer.observe(host);
  update(host.clientWidth);
  return {refresh: () => {last = -1; update(host.clientWidth);}, dispose: () => observer.disconnect()};
}
