import {pageHeading} from '../ui/heading.js';
import {html} from 'htl';
import * as Controls from '../ui/controls.js';
import {loadDatasets} from '../ui/data.js';
import {observeWidth} from '../ui/resize.js';
import {bindDiggingControls} from '../digging/controller.js';
import {createDiggingSelect} from '../digging/select.js';
import {createDiggingOptions} from '../digging/options.js';
import {renderDiggingComparison} from '../digging/view.js';
import {readInitialDiggingParams, getDiggingSpellLimit} from '../digging/url.js';
import {createShareButton} from '../components/shareButton.js';
import {createResetButton} from '../components/resetButton.js';
import {setControlDisabled} from '../ui/disabled.js';
import '../digging/digging.css';

export async function mount(host) {
  const [spells, materials] = await loadDatasets(['diggingSpells', 'materials']);
  const initial = readInitialDiggingParams(location.href, spells, materials);
  const spellPicker = createDiggingSelect(spells, {label: 'Spells', kind: 'spells', value: initial.spells,
    multiple: true, maxItems: getDiggingSpellLimit(location.href, spells, materials)});
  const materialPicker = createDiggingSelect(materials, {label: 'Material', kind: 'materials', value: initial.material});
  const optionsControl = createDiggingOptions(Controls, initial);
  const fitControl = Controls.toggle({label: 'Fit whole effect', value: initial.fit});
  const assumptions = html`<p class="fg-3 mb-0" role="status"></p>`;
  const plots = html`<div class="digging-comparison-host"></div>`;
  let controller;
  const reset = createResetButton(Controls, () => controller.reset());
  const share = createShareButton(() => controller.get().shareUrl, Controls);
  host.replaceChildren(html`<div>
    ${pageHeading("Spells’ Digging Ability", {beta: true})}
    <section class="card mb-4 lg:mb-5" aria-label="Comparison settings"><div class="card-body">
      <div class="row g-4"><div class="col-12 lg:col-7 d-flex">${spellPicker.element}</div><div class="col-12 lg:col-5 d-flex">${materialPicker.element}</div></div>
      <div class="result-toolbar">${optionsControl.element}<div class="d-flex flex-wrap align-items-center gap-3">${fitControl}${reset}${share.button}</div></div>
      ${assumptions}${share.feedback}
    </div></section>
    ${plots}
    <section class="card mt-4 lg:mt-5"><div class="card-body digging-method gap-3"><h2>About this estimate</h2>
      <p>Each spell has its own plot with the chosen perks and Berserkium setting. Every plot uses the same scale, including when fitted, so spell sizes and Minä stay comparable.</p>
      <p>Some spells have a random chance to remove each terrain pixel they check. Dotted gaps illustrate that chance; they do not predict which pixels survive a full cast.</p>
      <p>Moving spells show one example path. The length range accounts for their speed and lifetime variation. Penetrating spells slow down while digging; their first-cell damage uses the launch-speed range.</p>
      <p>Explosion circles estimate size from ray energy and material hardness, capped by the spell's explosion radius. A material's durability can stop the explosion from digging. These circles do not predict the exact crater boundary.</p>
      <p>For acid, the page checks whether the selected material can be dissolved. It does not simulate acid flowing through terrain or calculate a final hole size.</p>
      <p>For material-changing spells such as Touch of Gold, the outline marks the spell’s range. The result identifies what the selected material changes into.</p>
    </div></section>
  </div>`);
  let state;
  const resize = observeWidth(plots, width => {
    if (state) plots.replaceChildren(renderDiggingComparison(state.comparisons, state.selectedMaterial, width, state.fitRadius));
  });
  controller = bindDiggingControls({spells, materials, spellPicker, materialPicker, optionsControl, fitControl, window,
    render(next) {
      state = next; assumptions.textContent = next.spellAssumptions;
      setControlDisabled(share.button.querySelector('button'), !next.selectedSpells.length || !next.selectedMaterial,
        'Select at least one spell and a material to share this comparison.');
      setControlDisabled(fitControl.querySelector('input'), !next.selectedSpells.length || !next.selectedMaterial,
        'Select a spell and a material to display an effect.');
      setControlDisabled(optionsControl.glassCannon, !next.selectedSpells.length,
        'Select a spell to change its modifiers.', optionsControl.glassCannon);
      setControlDisabled(optionsControl.berserkium.querySelector('input'), !next.selectedSpells.length,
        'Select a spell to change its modifiers.');
      share.clear(); resize.refresh();
    }});
  return () => {share.dispose(); controller.dispose(); resize.dispose(); spellPicker.dispose(); materialPicker.dispose(); optionsControl.dispose();};
}
