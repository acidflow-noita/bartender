import {html} from 'htl';
import {featureCards} from '../ui/featureCards.js';
import {pageHeading} from '../ui/heading.js';

export function createHomeView(summary) {
  const plot = html`<div class="plot-host" data-material-types-plot></div>`;
  const heading = pageHeading('Noita Bartender', {compact: true});
  heading.classList.add('text-center');
  const view = html`<div class="home-page px-3 md:px-0">${heading}
    <div class="row justify-content-center"><div class="col-12 md:col-10 lg:col-8 xl:col-7">
    <div class="row g-3 lg:g-5 align-items-center mb-8">
      <div class="col-12 lg:col-6"><div class="d-flex flex-column gap-3 lg:gap-4" data-material-introduction>
        <p class="mb-0">Everything in the world of Noita is made of materials, even the visual effects.</p>
        <p class="mb-0">There are <strong>${summary.materialCount}</strong> materials total. Each material is described by <strong>1 to 10</strong> tags out of <strong>${summary.tagCount}</strong> unique tags.</p>
        <p class="mb-0">Each material can be of one type: <span class="material-type-solid"><code>solid</code></span>, <span class="material-type-liquid"><code>liquid</code></span>, <span class="material-type-powder"><code>powder</code></span>, <span class="material-type-gas"><code>gas</code></span>, or <span class="material-type-fire"><code>fire</code></span>. There are two exceptions: <a class="local-link" href="/materials?material=air">Air</a> ("nothing," the non-matter) and a special material <a class="local-link" href="/materials?material=fungal_shift_particle_fx"><code>fungal_shift_particle_fx</code></a> — these do not have a type.</p>
      </div></div>
      <div class="col-12 lg:col-6"><section aria-label="Material type distribution"><h2 class="h6 mb-2">Material types</h2>${plot}</section></div>
    </div>
    ${featureCards()}
    </div></div>
  </div>`;
  const data = document.createElement('script');
  data.type = 'application/json';
  data.dataset.homeSummary = '';
  data.textContent = JSON.stringify(summary).replaceAll('<', '\\u003c');
  view.append(data);
  return view;
}
