export function fitGraphToViewport(container, {credit, controls, heading, minimum = 160, gap = 8, onOverflow = () => {}} = {}) {
  const document = container.ownerDocument, view = document.defaultView;
  const main = container.closest('main'), card = container.parentElement;
  const footer = document.querySelector('.site-footer');
  const observed = new Set();
  let disposed = false;
  const pixels = (node, keys) => {
    if (!node) return 0;
    const style = view.getComputedStyle(node);
    return keys.reduce((sum, key) => sum + (parseFloat(style[key]) || 0), 0);
  };
  const outerHeight = node => node ? node.getBoundingClientRect().height + pixels(node, ['marginTop', 'marginBottom']) : 0;
  const observe = node => {if (node && observer && !observed.has(node)) {observed.add(node);observer.observe(node);}};
  const refresh = () => {
    if (disposed || !container.isConnected) return;
    if (document.fullscreenElement?.contains(container)) {container.dataset.viewportOverflow = 'false';onOverflow(false);return;}
    let after = 0;
    for (let node = container.nextElementSibling; node; node = node.nextElementSibling) {after += outerHeight(node);observe(node);}
    const available = Math.floor((view.visualViewport?.height ?? view.innerHeight)
      - container.getBoundingClientRect().top - view.scrollY - after - outerHeight(credit)
      - (footer?.getBoundingClientRect().height ?? 0) - pixels(main, ['paddingBottom'])
      - pixels(card, ['paddingBottom', 'borderBottomWidth', 'marginBottom']) - gap);
    const overflow = available < minimum;
    const height = `${Math.max(minimum, available)}px`;
    container.dataset.viewportOverflow = String(overflow);
    if (container.style.height !== height) container.style.height = height;
    onOverflow(overflow);
  };
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(refresh) : null;
  for (const node of [main, card, footer, controls, heading, credit, document.getElementById('site-header')]) observe(node);
  view.addEventListener('resize', refresh);view.visualViewport?.addEventListener('resize', refresh);
  document.fonts?.ready?.then(refresh);
  refresh();
  return {refresh,dispose() {
    disposed = true;observer?.disconnect();
    view.removeEventListener('resize',refresh);view.visualViewport?.removeEventListener('resize',refresh);
  }};
}

export function allowGraphGesture(event, container) {
  const document = container.ownerDocument, view = document.defaultView;
  const pageScrolls = !document.fullscreenElement?.contains(container) && (container.dataset.viewportOverflow === 'true'
    || document.documentElement.scrollHeight > (view.visualViewport?.height ?? view.innerHeight) + 1);
  if (event.type === 'wheel' && pageScrolls && !event.ctrlKey && !event.metaKey) return false;
  return (!event.ctrlKey || event.type === 'wheel') && !event.button;
}
