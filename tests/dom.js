import {JSDOM} from 'jsdom';

// Node-only component tests. No browser process, network resources or layout engine.
export function installDom(t, url = 'https://example.test/') {
  const dom = new JSDOM('<!doctype html><html><body><main id="main"></main></body></html>', {url, pretendToBeVisual: true});
  const previous = new Map();
  for (const name of ['window', 'document', 'navigator', 'location', 'history', 'CSS', 'Node', 'NodeList', 'HTMLCollection', 'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLSelectElement', 'Option', 'Event', 'CustomEvent', 'MutationObserver', 'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle']) {
    previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, {configurable: true, writable: true, value: dom.window[name]});
  }
  t.after(() => {
    dom.window.close();
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  return dom.window;
}
