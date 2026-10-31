import {defineConfig, normalizePath} from 'vite';
import {fileURLToPath} from 'node:url';
import autoprefixer from 'autoprefixer';
import {routes} from './src/routes.js';
import {renderPageShell} from './scripts/render-page-shell.mjs';

const shellModules = new Set([
  './scripts/render-page-shell.mjs', './src/pages/home-view.js', './src/ui/featureCards.js',
  './src/ui/navigation.js', './src/ui/heading.js', './src/reactions/introduction.js',
].map(path => normalizePath(fileURLToPath(new URL(path, import.meta.url)))));

export default defineConfig({
  root: fileURLToPath(new URL('./src', import.meta.url)),
  publicDir: '../public',
  server: {host: '127.0.0.1', port: 3000, strictPort: true},
  preview: {host: '127.0.0.1', port: 3000, strictPort: true},
  optimizeDeps: {include: ['choices.js', 'htl', '@observablehq/plot', 'd3', 'gsap', 'gsap/ScrambleTextPlugin.js',
    'bootstrap/js/dist/drawer.js', 'bootstrap/js/dist/tab.js', 'bootstrap/js/dist/toast.js']},
  css: {postcss: {plugins: [autoprefixer()]}},
  build: {
    outDir: '../dist', emptyOutDir: true, target: ['chrome130', 'firefox132', 'safari18'],
    rolldownOptions: {output: {codeSplitting: {groups: [
      {name: 'bootstrap', test: /\/node_modules\/bootstrap\/js\//, priority: 20},
      {name: 'ui', priority: 10, test: id => /\/src\/ui\/(controls|data|heading|icons|material|navigation|table)\.js$/.test(id)
        || /\/src\/components\/(?!titleAnimation)[^/]+\.js$/.test(id)},
    ]}}},
  },
  plugins: [{
    name: 'static-page-routes',
    enforce: 'post',
    handleHotUpdate({file, server}) {
      if (!shellModules.has(normalizePath(file))) return;
      server.environments.ssr.moduleGraph.invalidateAll();
      server.ws.send({type: 'full-reload'});
      return [];
    },
    transformIndexHtml: {
      order: 'pre',
      async handler(document, context) {
        const path = context.originalUrl ?? context.path;
        if (context.server) {
          // Use Vite's module graph so edits to imported view helpers invalidate
          // the server-rendered HTML as well as the client modules.
          const renderer = await context.server.ssrLoadModule(fileURLToPath(new URL('./scripts/render-page-shell.mjs', import.meta.url)));
          return renderer.renderPageShell(document, path, {cache: false});
        }
        return renderPageShell(document, path);
      },
    },
    generateBundle(_options, bundle) {
      const page = bundle['index.html'];
      if (!page) throw new Error('Missing page shell');
      const template = String(page.source);
      for (const route of routes) {
        let document = route.path === '/' ? template : renderPageShell(template, route.path);
        const chunk = Object.values(bundle).find(item => item.type === 'chunk' && item.facadeModuleId?.endsWith(`/pages/${route.module}.js`));
        const dependencies = new Set();
        const preload = item => {
          if (!item || item.type !== 'chunk' || dependencies.has(item.fileName)) return;
          dependencies.add(item.fileName);
          for (const name of item.imports) preload(bundle[name]);
        };
        preload(chunk);
        const links = [...dependencies].filter(name => !document.includes(`href="/${name}"`))
          .map(name => `<link rel="modulepreload" crossorigin href="/${name}">`).join('\n');
        document = document.replace('</head>', `${links}\n</head>`);
        if (route.path === '/') page.source = document;
        else this.emitFile({type: 'asset', fileName: `${route.path.slice(1)}.html`, source: document});
      }
    },
  }],
});
