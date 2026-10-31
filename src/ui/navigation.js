import {html} from 'htl';
import {routes} from '../routes.js';
import {icon} from './icons.js';
import {alphaMark, betaMark} from './heading.js';

export function createNavigation(path) {
  return html`<nav class="navbar xl:navbar-expand border-bottom" aria-label="Main navigation"><div class="container-fluid px-4">
  <a class="navbar-brand" href="/"><img src="https://noita-bartender-images.acidflow.stream/images/logo/bartender_logo.svg" alt="Noita Bartender" width="180" height="48"></a>
  <button class="btn-icon navbar-toggler" type="button" data-bs-toggle="drawer" data-bs-target="#navigation" aria-controls="navigation" aria-expanded="false" aria-label="Toggle navigation">${icon('list')}</button>
  <dialog class="drawer drawer-end" id="navigation" tabindex="-1" aria-labelledby="navigation-title">
    <div class="drawer-header"><h2 class="drawer-title" id="navigation-title">Navigation</h2><button type="button" class="btn-close" data-bs-dismiss="drawer" aria-label="Close navigation"></button></div>
    <div class="drawer-body gap-3"><ul class="nav navbar-nav gap-1 justify-content-center xl:mx-auto">${routes.slice(1, 6).map(item => html`<li class="nav-item"><a class=${`nav-link ${item.path === path ? 'active' : ''}`} href=${item.path} aria-current=${item.path === path ? 'page' : null}><span>${item.title}${item.alpha ? alphaMark('sup') : item.beta ? betaMark('sup') : ''}</span></a></li>`)}</ul>
      <div class="d-flex align-items-center justify-content-center xl:justify-content-end gap-3 mt-3 xl:mt-0">
        <a class="btn-text btn-icon" href="https://github.com/acidflow-noita/bartender/" aria-label="Bartender on GitHub">${icon('github')}</a>
        <a class="brand-link" href="https://runfast.stream/"><img src="https://noita-bartender-images.acidflow.stream/images/logo/runfast-logo.svg" alt="runfast.stream" width="100" height="28"></a>
      </div>
    </div>
  </dialog>
</div></nav>`;
}
