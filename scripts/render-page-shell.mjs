import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {html} from 'htl';
import {routes} from '../src/routes.js';
import {createNavigation} from '../src/ui/navigation.js';
import {createHomeView} from '../src/pages/home-view.js';
import {pageHeading} from '../src/ui/heading.js';
import {reactionIntroduction} from '../src/reactions/introduction.js';

const datasets = {
  home: [],
  reactions: ['reactionMaterials', 'reactions', 'availability'],
  graph: ['materials', 'reactionRules', 'associations', 'availability', 'apotheosisReactions', 'apotheosisSecretReactions', 'allModReactions'],
  fungal: ['materials', 'apotheosisMaterials'],
  materials: ['materials', 'tags'],
  digging: ['diggingSpells', 'materials'],
  thanks: [],
};
const cache = new Map();
const sourceRoot = new URL('../src/', import.meta.url).href;

export function pageShell(path, {cache: useCache = true} = {}) {
  path = path.split('?')[0].replace(/\.html$/, '').replace(/\/$/, '') || '/';
  if (path === '/index') path = '/';
  const route = routes.find(route => route.path === path);
  if (!route) return null;
  const manifestText = readFileSync(new URL('../src/generated/data-manifest.json', import.meta.url), 'utf8');
  const key = path + manifestText;
  if (useCache && cache.has(key)) return cache.get(key);
  const manifest = JSON.parse(manifestText);
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const previous = new Map();
  for (const name of ['document', 'window', 'Node', 'NodeList', 'HTMLCollection']) {
    previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, {value: dom.window[name], configurable: true, writable: true});
  }
  try {
    const summary = JSON.parse(readFileSync(new URL('../public' + manifest.homeSummary, import.meta.url), 'utf8'));
    const introduction = route.module === 'reactions'
      ? reactionIntroduction(JSON.parse(readFileSync(new URL('../public' + manifest.reactionMaterials, import.meta.url), 'utf8')), summary.reactionCount)
      : null;
    const content = route.module === 'home'
      ? createHomeView(summary)
      : html`<div class=${route.module === 'reactions' ? 'reactions-page' : null}>${pageHeading(route.title, route)}${introduction}<p class="fg-3" role="status">Loading…</p></div>`;
    const result = {
      title: route.path === '/' ? route.title : `${route.title} · Noita Bartender`,
      compact: route.compact,
      header: createNavigation(path).outerHTML,
      main: content.outerHTML.replaceAll(sourceRoot, '/'),
      preloads: datasets[route.module].map(name => {
        if (!manifest[name]) throw new Error(`Missing page dataset: ${name}`);
        return `<link data-page-preload rel="preload" as="fetch" href="${manifest[name]}" crossorigin>`;
      }).join('\n'),
    };
    if (useCache) cache.set(key, result);
    return result;
  } finally {
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
    dom.window.close();
  }
}

export function renderPageShell(document, path, options) {
  const shell = pageShell(path, options);
  if (!shell) return document;
  return document
    .replace(/<title>[^<]*<\/title>/, `<title>${shell.title}</title>`)
    .replace(/(<header id="site-header">)[\s\S]*?(<\/header>)/, `$1${shell.header}$2`)
    .replace(/(<main\b[^>]*>)[\s\S]*?(<\/main>)/, `$1${shell.main}$2`)
    .replace(/(<main\b[^>]*class=")([^"]*)(")/, (_match, before, classes, after) => before + classes.replace(/\b(?:py|pb)-(?:3|5)\b/, shell.compact ? 'pb-3' : 'pb-5') + after)
    .replace(/\s*<link data-page-preload\b[^>]*>/g, '')
    .replace('</head>', `${shell.preloads}\n</head>`);
}
