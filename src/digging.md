---
title: Spells' Digging Ability (β)
---

<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/choices.js@11.1.0/public/assets/styles/choices.min.css">
<link href="custom.css" rel="stylesheet">
<link href="digging/digging.css" rel="stylesheet">

<h1 id="acidTitle" class="bartender-heading-decrypted">Spells' Digging Ability (β)</h1>

```js
import {initializeTitleAnimation} from "./components/titleAnimation.js";
import {isDiggingSpell, evaluateDigging} from "./digging/model.js";
import {createDiggingSelect} from "./digging/select.js";
import {renderDiggingResult, renderDiggingPlot} from "./digging/view.js";
import {DIGGING_DEFAULTS, readDiggingParams, diggingUrl} from "./digging/url.js";
import {createShareButton} from "./components/shareButton.js";
import {createResetButton} from "./components/resetButton.js";
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
const fitControl = Inputs.toggle({label: "Fit whole effect", value: initialSelection.fit});
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
const spellAssumptions = selectedSpell && selectedMaterial
  ? `${selectedSpell.name} without modifiers, perks, or wand bonuses.${selectedSpell.groundPenetrationCoeff > 0 ? " First-cell damage uses the launch-speed range; actual impact speed changes during flight." : ""}`
  : "";
```

```js
const resetButton = createResetButton(Inputs, () => {
  spellPicker.setValue(DIGGING_DEFAULTS.spell);
  materialPicker.setValue(DIGGING_DEFAULTS.material);
  fitControl.value = DIGGING_DEFAULTS.fit;
  fitControl.dispatchEvent(new Event("input", {bubbles: true}));
});
const shareControl = createShareButton(() => diggingUrl(window.location.href, {
  spell: spellPicker.element.value?.id,
  material: materialPicker.element.value?.id,
  fit: fitControl.value,
}), Inputs);
shareControl.button.querySelector("button").disabled = true;
```

```js
const shareUrl = diggingUrl(window.location.href, {
  spell: selectedSpell?.id, material: selectedMaterial?.id, fit: fitRadius,
});
if (shareUrl !== window.location.href) window.history.replaceState(window.history.state, "", shareUrl);
shareControl.button.querySelector("button").disabled = !selectedSpell || !selectedMaterial;
shareControl.clear();
```

<div class="grid grid-cols-2 digging-controls">
  ${spellPicker.element}
  ${materialPicker.element}
</div>

<p class="digging-assumptions">${spellAssumptions}</p>

<div class="grid grid-cols-3 gap-1 digging-toolbar">
  <div class="card">${resetButton}</div>
  <div class="card">${shareControl.button}</div>
  <div class="card">${fitControl}</div>
</div>
${shareControl.feedback}

<div class="grid grid-cols-2 digging-comparison">
  <section class="card grid-colspan-2 digging-preview" aria-label="Terrain and digging footprint">
    ${resize((width) => renderDiggingPlot(selectedSpell, selectedMaterial, result, width, fitRadius))}
  </section>
  <aside class="card grid-colspan-2 digging-info">
    ${renderDiggingResult(selectedSpell, selectedMaterial, result)}
    <details class="digging-method">
      <summary>About this estimate</summary>
      <p>The preview uses one unmodified cast in a block of the selected material. Minä shows the scale. Empty areas show removed material; speckling illustrates partial removal.</p>
      <p>Moving spells show one example path. The length range accounts for their speed and lifetime variation. Penetrating spells slow down while digging; their first-cell damage uses the launch-speed range.</p>
      <p>Explosion circles estimate size from ray energy and material hardness, capped by the spell's explosion radius. A material's durability can stop the explosion from digging. These circles do not predict the exact crater boundary.</p>
      <p>Acid spreads with the liquid and has no fixed final size. Conversion outlines show where material can change. Separate effects and physics objects are described in the results below.</p>
    </details>
  </aside>
</div>
