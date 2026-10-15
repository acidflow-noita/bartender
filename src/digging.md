---
title: Spells' Digging Ability (β)
---

<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/choices.js@11.1.0/public/assets/styles/choices.min.css">
<link href="custom.css" rel="stylesheet">
<link href="digging/digging.css" rel="stylesheet">

<h1 id="acidTitle" class="bartender-heading-decrypted">Spells' Digging Ability (β)</h1>

```js
import {initializeTitleAnimation} from "./components/titleAnimation.js";
import {isDiggingSpell} from "./digging/model.js";
import {evaluateComparison} from "./digging/comparison.js";
import {createDiggingSelect} from "./digging/select.js";
import {createDiggingOptions} from "./digging/options.js";
import {renderDiggingComparison} from "./digging/view.js";
import {DIGGING_DEFAULTS, readDiggingParams, diggingUrl, getDiggingSpellLimit} from "./digging/url.js";
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
const spellLimit = getDiggingSpellLimit(window.location.href, spells, materials);
const spellPicker = createDiggingSelect(spells, {label: "Spells", kind: "spells", value: initialSelection.spells, multiple: true, maxItems: spellLimit});
const materialPicker = createDiggingSelect(materials, {label: "Material", kind: "materials", value: initialSelection.material});
const optionsControl = createDiggingOptions(Inputs, initialSelection);
const fitControl = Inputs.toggle({label: "Fit whole effect", value: initialSelection.fit});
const restoreAddress = () => {
  const selection = readDiggingParams(window.location.href, spells, materials);
  spellPicker.setValue(selection.spells);
  materialPicker.setValue(selection.material);
  optionsControl.setValue(selection);
  fitControl.value = selection.fit;
  fitControl.dispatchEvent(new Event("input", {bubbles: true}));
};
window.addEventListener("popstate", restoreAddress);
invalidation.then(() => {
  window.removeEventListener("popstate", restoreAddress);
  spellPicker.dispose();
  materialPicker.dispose();
  optionsControl.dispose();
});
```

```js
const selectedSpells = Generators.input(spellPicker.element);
const selectedMaterial = Generators.input(materialPicker.element);
const modifiers = Generators.input(optionsControl.element);
const fitRadius = Generators.input(fitControl);
```

```js
// Keep calculations in a dependent cell: Generators.input returns an iterator,
// and Observable resolves its selected value between cells.
const comparisons = evaluateComparison(selectedSpells, selectedMaterial, modifiers);
const boostNames = [modifiers.glassCannon === 1 ? "Glass Cannon" : modifiers.glassCannon === 2 ? "Glass Cannon 2×" : null,
  modifiers.berserkium ? "Berserkium" : null].filter(Boolean);
const spellAssumptions = selectedSpells.length && selectedMaterial
  ? `Individual casts ${boostNames.length ? `with ${boostNames.join(" and ")}` : "without perks or Berserkium"}. No spell modifiers or wand bonuses.${modifiers.glassCannon && modifiers.berserkium ? ` Assumes Glass Cannon before Berserkium.${modifiers.glassCannon === 2 ? " With two stacks, Berserkium adds no further boost." : ""}` : ""}${selectedSpells.some((spell) => spell.groundPenetrationCoeff > 0) ? " First-cell damage uses the launch-speed range." : ""}`
  : "";
```

```js
const resetButton = createResetButton(Inputs, () => {
  spellPicker.setValue(DIGGING_DEFAULTS.spells);
  materialPicker.setValue(DIGGING_DEFAULTS.material);
  optionsControl.setValue(DIGGING_DEFAULTS);
  fitControl.value = DIGGING_DEFAULTS.fit;
  fitControl.dispatchEvent(new Event("input", {bubbles: true}));
});
const shareControl = createShareButton(() => diggingUrl(window.location.href, {
  spells: spellPicker.element.value.map((spell) => spell.id),
  material: materialPicker.element.value?.id,
  fit: fitControl.value,
  ...optionsControl.element.value,
}), Inputs);
shareControl.button.querySelector("button").disabled = true;
```

```js
const shareUrl = diggingUrl(window.location.href, {
  spells: selectedSpells.map((spell) => spell.id), material: selectedMaterial?.id, fit: fitRadius, ...modifiers,
});
if (shareUrl !== window.location.href) window.history.replaceState(window.history.state, "", shareUrl);
shareControl.button.querySelector("button").disabled = !selectedSpells.length || !selectedMaterial;
shareControl.clear();
```

<div class="grid grid-cols-2 digging-controls">
  ${spellPicker.element}
  ${materialPicker.element}
</div>

<div class="digging-options-host">
  ${optionsControl.element}
</div>

<p class="digging-assumptions">${spellAssumptions}</p>

<div class="grid grid-cols-3 gap-1 digging-toolbar">
  <div class="card">${resetButton}</div>
  <div class="card">${shareControl.button}</div>
  <div class="card">${fitControl}</div>
</div>
${shareControl.feedback}

<div class="digging-comparison-host">
  ${resize((width) => renderDiggingComparison(comparisons, selectedMaterial, width, fitRadius))}
</div>

<div class="card digging-info">
    <details class="digging-method">
      <summary>About this estimate</summary>
      <p>Each spell has its own plot with the chosen perks and Berserkium setting. Every plot uses the same scale, including when fitted, so spell sizes and Minä stay comparable. Speckling illustrates partial removal.</p>
      <p>Moving spells show one example path. The length range accounts for their speed and lifetime variation. Penetrating spells slow down while digging; their first-cell damage uses the launch-speed range.</p>
      <p>Explosion circles estimate size from ray energy and material hardness, capped by the spell's explosion radius. A material's durability can stop the explosion from digging. These circles do not predict the exact crater boundary.</p>
      <p>Acid spreads with the liquid and has no fixed final size. Conversion outlines show where material can change. Separate effects and physics objects are described in the results below.</p>
    </details>
</div>
