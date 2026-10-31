import {html} from 'htl';

let nextId = 0;
const id = () => `control-${++nextId}`;
const emit = (root) => root.dispatchEvent(new Event('input', {bubbles: true}));

function field(input, label) {
  input.id ||= id();
  const root = html`<div class="form-field">${label ? html`<label class="form-label" for=${input.id}>${label}</label>` : ''}${input}</div>`;
  return root;
}

export function text({label, value = '', placeholder = '', readonly = false} = {}) {
  const input = html`<input class="form-control" type="text" value=${value} placeholder=${placeholder} readonly=${readonly}>`;
  const root = field(input, label);
  Object.defineProperty(root, 'value', {get: () => input.value, set: value => {input.value = value ?? '';}});
  return root;
}

export function number([min, max] = [], {label, value = min ?? 0, step = 1} = {}) {
  const input = html`<input class="form-control" type="number" min=${min} max=${max} step=${step} value=${value}>`;
  const root = field(input, label);
  Object.defineProperty(root, 'value', {get: () => input.valueAsNumber, set: value => {input.value = value;}});
  input.addEventListener('input', event => {
    if (!Number.isFinite(input.valueAsNumber) || !input.validity.valid) event.stopPropagation();
  });
  return root;
}

export function range([min, max], {label, value = max, step = 1} = {}) {
  const slider = html`<input class="form-range-input" type="range" min=${min} max=${max} step=${step} value=${value} aria-label=${label || 'Maximum value'}>`;
  const exact = html`<input class="form-control range-value" type="number" min=${min} max=${max} step=${step} value=${value} aria-label=${label || 'Maximum value'}>`;
  slider.id = id();
  const root = html`<div class="form-field">${label ? html`<label class="form-label" for=${slider.id}>${label}</label>` : ''}<div class="d-flex align-items-center gap-3"><div class="form-range">${slider}</div>${exact}</div></div>`;
  const set = value => {
    slider.value = value;
    exact.value = slider.value;
    slider.style.setProperty('--range-fill', max === min ? 0 : (slider.valueAsNumber - min) / (max - min));
  };
  Object.defineProperty(root, 'value', {get: () => slider.valueAsNumber, set});
  for (const input of [slider, exact]) input.addEventListener('input', event => {
    event.stopPropagation();
    if (!input.validity.valid || !Number.isFinite(input.valueAsNumber)) return;
    set(input.valueAsNumber); emit(root);
  });
  set(value);
  return root;
}

export function toggle({label, value = false} = {}) {
  const input = html`<input class="check" type="checkbox" id=${id()} checked=${value}>`;
  const root = html`<div class="form-field">${input}<label for=${input.id}>${label}</label></div>`;
  Object.defineProperty(root, 'value', {get: () => input.checked, set: value => {input.checked = !!value;}});
  return root;
}

export function radio(values, {label, value = values[0], format = String, buttons = false} = {}) {
  const name = id();
  const inputs = values.map((item, i) => html`<input type="radio" class="radio" name=${name} id=${`${name}-${i}`} value=${item} checked=${item === value}>`);
  const root = html`<fieldset class="form-group">${label ? html`<legend class="form-label">${label}</legend>` : ''}<div class=${buttons ? 'btn-group' : 'd-flex flex-wrap gap-4'}>${inputs.map((input, i) => buttons
    ? html`<label class="btn-check btn-outline theme-primary">${input}${format(values[i])}</label>`
    : html`<div class="form-field">${input}<label for=${input.id}>${format(values[i])}</label></div>`)}</div></fieldset>`;
  Object.defineProperty(root, 'value', {get: () => values[inputs.findIndex(input => input.checked)],
    set: value => inputs.forEach((input, i) => {input.checked = values[i] === value;})});
  return root;
}

export function select(values, {label, value = values[0], format = String} = {}) {
  const input = html`<select class="form-control">${values.map((item, i) => html`<option value=${i} selected=${item === value}>${format(item)}</option>`)}</select>`;
  const root = field(input, label);
  Object.defineProperty(root, 'value', {get: () => values[input.selectedIndex], set: value => {input.selectedIndex = values.indexOf(value);}});
  input.addEventListener('change', event => {event.stopPropagation(); emit(root);});
  // Native selects also emit input. Only forward change, once.
  input.addEventListener('input', event => event.stopPropagation());
  return root;
}

export function button(label, {reduce = () => {}, primary = false} = {}) {
  const control = html`<button type="button" class=${primary ? 'btn-solid theme-primary' : 'btn-outline theme-secondary'}>${label}</button>`;
  control.addEventListener('click', reduce);
  return html`<span class="action-control">${control}</span>`;
}
