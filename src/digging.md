---
title: Spells' Digging Ability
---

<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/choices.js@11.1.0/public/assets/styles/choices.min.css">
<link href="custom.css" rel="stylesheet">
<link href="digging/digging.css" rel="stylesheet">

<h1 id="acidTitle" class="bartender-heading-decrypted">Spells' Digging Ability</h1>

```js
import {initializeTitleAnimation} from "./components/titleAnimation.js";
import {isDiggingSpell, evaluateDigging} from "./digging/model.js";
import {createDiggingSelect} from "./digging/select.js";
import {renderDiggingResult, renderDiggingPlot} from "./digging/view.js";
import {DIGGING_DEFAULTS, readDiggingParams, diggingUrl} from "./digging/url.js";
import {createShareButton} from "./components/shareButton.js";
initializeTitleAnimation();
```

```js
const allSpells = await FileAttachment("./data/FULL_SPELLS_FINAL.json").json();
const materials = await FileAttachment("./data/FULL_MATERIALS_FINAL.json").json();
const spells = allSpells.filter(isDiggingSpell);
```

```js
const initialSelection = readDiggingParams(window.location.href, spells, materials);
const spellPicker = createDiggingSelect(spells, {label: "Spell", kind: "spells", value: initialSelection.spell});
const materialPicker = createDiggingSelect(materials, {label: "Material", kind: "materials", value: initialSelection.material});
const fitControl = Inputs.toggle({label: "Fit whole radius", value: initialSelection.fit});
const restoreAddress = () => {
  const selection = readDiggingParams(window.location.href, spells, materials);
  spellPicker.setValue(selection.spell);
  materialPicker.setValue(selection.material);
  fitControl.value = selection.fit;
  fitControl.dispatchEvent(new Event("input", {bubbles: true}));
};
window.addEventListener("popstate", restoreAddress);
invalidation.then(() => {
  window.removeEventListener("popstate", restoreAddress);
  spellPicker.dispose();
  materialPicker.dispose();
});
```

```js
const selectedSpell = Generators.input(spellPicker.element);
const selectedMaterial = Generators.input(materialPicker.element);
const fitRadius = Generators.input(fitControl);
```

```js
// Keep calculations in a dependent cell: Generators.input returns an iterator,
// and Observable resolves its selected value between cells.
const result = evaluateDigging(selectedSpell, selectedMaterial);
```

```js
const resetButton = Inputs.button("Reset", {
  reduce: () => {
    spellPicker.setValue(DIGGING_DEFAULTS.spell);
    materialPicker.setValue(DIGGING_DEFAULTS.material);
    fitControl.value = DIGGING_DEFAULTS.fit;
    fitControl.dispatchEvent(new Event("input", {bubbles: true}));
  },
});
const shareControl = createShareButton(() => diggingUrl(window.location.href, {
  spell: spellPicker.element.value.id,
  material: materialPicker.element.value.id,
  fit: fitControl.value,
}));
```

```js
const shareUrl = diggingUrl(window.location.href, {
  spell: selectedSpell.id, material: selectedMaterial.id, fit: fitRadius,
});
if (shareUrl !== window.location.href) window.history.replaceState(window.history.state, "", shareUrl);
shareControl.clear();
```

<div class="digging-controls">
  ${spellPicker.element}
  ${materialPicker.element}
</div>

<div class="digging-comparison">
  <section class="digging-preview" aria-label="Terrain and digging radius">
    <div class="digging-toolbar">
      ${fitControl}<div class="digging-actions">${resetButton}${shareControl.button}</div>
    </div>
    <div class="digging-share-feedback">${shareControl.feedback}</div>
    ${resize((width) => renderDiggingPlot(selectedSpell, selectedMaterial, result, width, fitRadius))}
  </section>
  <aside class="digging-info">
    ${renderDiggingResult(selectedSpell, selectedMaterial, result)}
    <details class="digging-method">
      <summary>About this estimate</summary>
      <p>For uniform terrain within the spell's durability limit, the estimated radius is the smaller of its maximum radius and <code>floor(ray energy / hardness)</code>. Zero-hardness terrain uses the maximum radius.</p>
      <p>Acid uses corrosion reactions, not explosion durability limits. It dissolves Brickwork and other corrodible materials, but Dense Rock resists it. Corrosion spreads with the liquid and has no fixed circular radius. <a href="https://noita.wiki.gg/wiki/Acid_Ball" target="_blank" rel="noopener noreferrer">Acid Ball reference</a>.</p>
      <p>Projectile penetration is separate from impact explosions. Glowing Lance and Holy Lance have no penetration durability cap; their explosion limits do not prevent them from chipping harder terrain. Depth depends on impact speed, mass and terrain hardness and is not quantified here. <a href="https://note.com/hanrei_7/n/n5d242fdb38bd" target="_blank" rel="noopener noreferrer">Projectile penetration observations</a>.</p>
      <p>Cell-eating spells use their cell-eating radius and material restrictions. Movement, reactions, modifiers, physics objects, and scripted effects may need a different model. All materials remain selectable.</p>
      <p>Distances are in game pixels. <a href="https://noita.wiki.gg/wiki/Digging" target="_blank" rel="noopener noreferrer">Digging reference</a>.</p>
    </details>
  </aside>
</div>
