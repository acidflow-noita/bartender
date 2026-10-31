import {html} from 'htl';

export function createDiggingOptions(Controls, initial = {}) {
  const glassCannon = Controls.radio([0, 1, 2], {label: 'Glass Cannon', value: initial.glassCannon || 0,
    format: value => ['None', '1×', '2×'][value]});
  const berserkium = Controls.toggle({label: 'Berserkium', value: !!initial.berserkium});
  const element = html`<div class="d-flex flex-wrap align-items-end gap-5">${glassCannon}${berserkium}</div>`;
  Object.defineProperty(element, 'value', {get: () => ({glassCannon: glassCannon.value, berserkium: berserkium.value})});
  const notify = () => element.dispatchEvent(new Event('input', {bubbles: true}));
  const change = event => {event.stopPropagation(); notify();};
  glassCannon.addEventListener('input', change); berserkium.addEventListener('input', change);
  return {element, glassCannon, berserkium, setValue(value = {}) {
    glassCannon.value = [1, 2].includes(value.glassCannon) ? value.glassCannon : 0;
    berserkium.value = !!value.berserkium; notify();
  }, dispose() {glassCannon.removeEventListener('input', change); berserkium.removeEventListener('input', change);}};
}
