export function bindLiquidInput(canvas, {width, height, radius, paint, draw}) {
  const view = canvas.ownerDocument.defaultView;
  const events = new view.AbortController();
  const listen = (target, type, handler, options = {}) => target.addEventListener(type, handler, {signal: events.signal, ...options});
  let pointerId = null, inside = false, visible = false, disposed = false;
  let position = {x: Math.floor(width / 2), y: Math.min(16, height - 1)};
  const locate = event => {
    const bounds = canvas.getBoundingClientRect();
    const x = (event.clientX - bounds.left) * width / bounds.width;
    const y = (event.clientY - bounds.top) * height / bounds.height;
    return {x: Math.max(0, Math.min(width - 1, x)), y: Math.max(0, Math.min(height - 1, y)),
      inside: x >= 0 && x < width && y >= 0 && y < height};
  };
  const stroke = next => {
    if (inside) {
      const distance = Math.hypot(next.x - position.x, next.y - position.y);
      const steps = Math.max(1, Math.ceil(distance / Math.max(1, radius() / 2)));
      for (let i = 1; i <= steps; i++) paint({x: position.x + (next.x - position.x) * i / steps, y: position.y + (next.y - position.y) * i / steps});
    } else if (next.inside) paint(next);
    position = {x: next.x, y: next.y}; inside = next.inside; visible = inside;
  };
  const cancel = () => {
    const released = pointerId; pointerId = null;
    if (released !== null && canvas.hasPointerCapture?.(released)) canvas.releasePointerCapture(released);
  };
  listen(canvas, 'pointerdown', event => {
    if (event.button !== 0 || event.isPrimary === false || pointerId !== null) return;
    event.preventDefault();
    const next = locate(event);
    if (!next.inside) return;
    canvas.dataset.pointerInput = '';
    canvas.ownerDocument.getSelection()?.removeAllRanges();
    pointerId = event.pointerId; inside = visible = true; position = {x: next.x, y: next.y};
    try {canvas.setPointerCapture(pointerId);} catch { /* Window listeners still receive this stroke. */ }
    paint(position); draw();
  }, {passive: false});
  // Keep the stroke active when the pointer leaves the canvas.
  listen(view, 'pointermove', event => {
    if (event.pointerId !== pointerId) return;
    if (event.pointerType === 'mouse' && !(event.buttons & 1)) {cancel(); return;}
    event.preventDefault();
    const samples = event.getCoalescedEvents?.();
    for (const sample of samples?.length ? samples : [event]) stroke(locate(sample));
    draw();
  }, {capture: true, passive: false});
  listen(canvas, 'pointermove', event => {
    if (pointerId !== null) return;
    const next = locate(event); position = {x: next.x, y: next.y}; inside = visible = next.inside; draw();
  });
  listen(view, 'pointerup', event => {
    if (event.pointerId !== pointerId) return;
    event.preventDefault(); stroke(locate(event)); cancel(); draw();
  }, {capture: true, passive: false});
  listen(view, 'pointercancel', event => {if (event.pointerId === pointerId) {cancel(); visible = false; draw();}}, {capture: true});
  listen(canvas, 'pointerleave', () => {if (pointerId === null) {inside = visible = false; draw();}});
  listen(canvas, 'focus', () => {if (pointerId === null) {delete canvas.dataset.pointerInput; visible = true; draw();}});
  listen(canvas, 'blur', () => {if (pointerId === null) {visible = false; draw();}});
  listen(view, 'blur', () => {cancel(); visible = false; draw();});
  for (const type of ['dragstart', 'selectstart']) listen(canvas, type, event => event.preventDefault());
  listen(canvas, 'keydown', event => {
    const direction = {ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]}[event.key];
    if (direction) {
      event.preventDefault();
      position.x = Math.max(0, Math.min(width - 1, position.x + direction[0] * (event.shiftKey ? 12 : 3)));
      position.y = Math.max(0, Math.min(height - 1, position.y + direction[1] * (event.shiftKey ? 12 : 3)));
    } else if (event.code === 'Space') {event.preventDefault(); paint(position);}
    else return;
    delete canvas.dataset.pointerInput; visible = true; draw();
  });
  return {
    get active() {return pointerId !== null && inside;},
    get position() {return position;},
    get cursor() {return visible ? {...position, radius: radius()} : null;},
    cancel,
    dispose() {if (disposed) return; disposed = true; events.abort(); cancel();},
  };
}
