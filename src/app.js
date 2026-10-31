import 'choices.js/public/assets/styles/choices.min.css';
import './styles/choices.css';
import 'bootstrap/js/dist/drawer.js';
import {html} from 'htl';
import {routes} from './routes.js';
import {createNavigation} from './ui/navigation.js';

const path = location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
const route = routes.find(route => route.path === path);
const main = document.getElementById('main');
main.classList.remove('py-3', 'py-5', 'pb-3', 'pb-5');
main.classList.add(route?.compact ? 'pb-3' : 'pb-5');
const header = document.getElementById('site-header');
if (!header.firstElementChild) header.append(createNavigation(path));
const pages = {
  home: () => import('./pages/home.js'),
  reactions: () => import('./pages/reactions.js'),
  graph: () => import('./pages/graph.js'),
  fungal: () => import('./pages/fungal.js'),
  materials: () => import('./pages/materials.js'),
  digging: () => import('./pages/digging.js'),
  thanks: () => import('./pages/thanks.js'),
};
let dispose, titleAnimation, disposed = false;
try {
  if (!route) {
    document.title = 'Page not found · Noita Bartender';
    main.replaceChildren(html`<div><h1>Page not found</h1><p><a href="/">Return to Noita Bartender</a></p></div>`);
  } else {
    document.title = `${route.title}${path === '/' ? '' : ' · Noita Bartender'}`;
    const {mount} = await pages[route.module]();
    dispose = await mount(main);
    document.documentElement.dataset.pageReady = 'true';
    import('./components/titleAnimation.js').then(({initializeTitleAnimation}) => {
      if (!disposed) titleAnimation = initializeTitleAnimation();
    });
  }
} catch (error) {
  console.error(error);
  main.replaceChildren(html`<div class="alert theme-danger" role="alert"><h1>Could not load this page</h1><p>${error.message}</p><a class="btn-outline" href=${location.href}>Retry</a></div>`);
}
const cleanup = () => {disposed = true; titleAnimation?.dispose(); dispose?.();};
window.addEventListener('pagehide', event => {if (!event.persisted) cleanup();});
if (import.meta.hot) import.meta.hot.dispose(cleanup);
