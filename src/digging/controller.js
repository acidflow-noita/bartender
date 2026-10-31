import {evaluateComparison} from './comparison.js';
import {DIGGING_DEFAULTS, readDiggingParams, diggingUrl} from './url.js';

export function bindDiggingControls({spells, materials, spellPicker, materialPicker, optionsControl, fitControl, window, render}) {
  let suspended = false, snapshot;
  const update = () => {
    if (suspended) return;
    const selectedSpells = spellPicker.element.value, selectedMaterial = materialPicker.element.value;
    const modifiers = optionsControl.element.value, fitRadius = fitControl.value;
    const comparisons = evaluateComparison(selectedSpells, selectedMaterial, modifiers);
    const boostNames = [modifiers.glassCannon === 1 ? 'Glass Cannon' : modifiers.glassCannon === 2 ? 'Glass Cannon 2×' : null,
      modifiers.berserkium ? 'Berserkium' : null].filter(Boolean);
    const spellAssumptions = selectedSpells.length && selectedMaterial
      ? `Individual casts ${boostNames.length ? `with ${boostNames.join(' and ')}` : 'without perks or Berserkium'}. No spell modifiers or wand bonuses.${modifiers.glassCannon && modifiers.berserkium ? ` Assumes Glass Cannon before Berserkium.${modifiers.glassCannon === 2 ? ' With two stacks, Berserkium adds no further boost.' : ''}` : ''}${selectedSpells.some(spell => spell.groundPenetrationCoeff > 0) ? ' First-cell damage uses the launch-speed range.' : ''}` : '';
    const shareUrl = diggingUrl(window.location.href, {
      spells: selectedSpells.map(spell => spell.id), material: selectedMaterial?.id, fit: fitRadius, ...modifiers,
    });
    if (shareUrl !== window.location.href) window.history.replaceState(window.history.state, '', shareUrl);
    snapshot = {selectedSpells, selectedMaterial, modifiers, fitRadius, comparisons, spellAssumptions, shareUrl};
    render(snapshot);
  };
  const restore = selection => {
    suspended = true;
    try {
      spellPicker.setValue(selection.spells); materialPicker.setValue(selection.material);
      optionsControl.setValue(selection); fitControl.value = selection.fit;
    } finally {suspended = false;}
    update();
  };
  const popstate = () => restore(readDiggingParams(window.location.href, spells, materials));
  const controls = [spellPicker.element, materialPicker.element, optionsControl.element, fitControl];
  controls.forEach(control => control.addEventListener('input', update));
  window.addEventListener('popstate', popstate);
  update();
  return {get: () => snapshot, reset: () => restore(DIGGING_DEFAULTS), dispose() {
    controls.forEach(control => control.removeEventListener('input', update));
    window.removeEventListener('popstate', popstate);
  }};
}
