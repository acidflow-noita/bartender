import {html} from "htl";

export function createDiggingOptions(Inputs, initial = {}) {
  const glassCannon = Inputs.toggle({label: "Glass Cannon", value: initial.glassCannon === 1});
  const glassCannon2 = Inputs.toggle({label: "Glass Cannon 2×", value: initial.glassCannon === 2});
  const berserkium = Inputs.toggle({label: "Berserkium", value: !!initial.berserkium});
  const element = html`<div class="grid grid-cols-3 digging-options" role="group" aria-label="Perks and status effects">
    <div class="card">${glassCannon}</div><div class="card">${glassCannon2}</div><div class="card">${berserkium}</div>
  </div>`;
  Object.defineProperty(element, "value", {get: () => ({
    glassCannon: glassCannon2.value ? 2 : glassCannon.value ? 1 : 0,
    berserkium: berserkium.value,
  })});
  const notify = () => element.dispatchEvent(new Event("input", {bubbles: true}));
  const listen = (control, other) => {
    const change = (event) => {
      event.stopPropagation();
      if (control.value && other) other.value = false;
      notify();
    };
    control.addEventListener("input", change);
    return () => control.removeEventListener("input", change);
  };
  const dispose = [listen(glassCannon, glassCannon2), listen(glassCannon2, glassCannon), listen(berserkium)];
  return {element, glassCannon, glassCannon2, berserkium,
    setValue(value = {}) {
      glassCannon.value = value.glassCannon === 1;
      glassCannon2.value = value.glassCannon === 2;
      berserkium.value = !!value.berserkium;
      notify();
    },
    dispose() { dispose.forEach((remove) => remove()); },
  };
}
