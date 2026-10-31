// Match the particle-animations UI: native disabled controls, with a focusable
// existing wrapper for the browser's title text and an accessible explanation.
const originals = new WeakMap();
const attributes = ['title', 'tabindex', 'role', 'aria-label', 'aria-description', 'aria-disabled'];

export function setControlDisabled(control, disabled, reason, wrapper = control.closest('.action-control, .form-range, .form-field')) {
  control.disabled = disabled;
  if (!wrapper) return;
  if (disabled) {
    if (!originals.has(wrapper)) originals.set(wrapper, {
      attributes: attributes.map(name => [name, wrapper.getAttribute(name)]),
      focusRing: wrapper.classList.contains('focus-ring'),
    });
    wrapper.setAttribute('data-disabled-hint-active', '');
    wrapper.classList.add('focus-ring');
    wrapper.tabIndex = 0;
    wrapper.setAttribute('role', 'group');
    wrapper.setAttribute('aria-disabled', 'true');
    const label = control.getAttribute('aria-label') || control.labels?.[0]?.textContent.trim()
      || control.querySelector('legend')?.textContent.trim() || control.textContent.trim();
    if (label) wrapper.setAttribute('aria-label', label);
    wrapper.title = reason;
    wrapper.setAttribute('aria-description', reason);
  } else if (originals.has(wrapper)) {
    const original = originals.get(wrapper);
    for (const [name, value] of original.attributes) {
      if (value === null) wrapper.removeAttribute(name);
      else wrapper.setAttribute(name, value);
    }
    wrapper.removeAttribute('data-disabled-hint-active');
    wrapper.classList.toggle('focus-ring', original.focusRing);
    originals.delete(wrapper);
  }
}
