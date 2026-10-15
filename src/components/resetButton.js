import {html} from "htl";

export function createResetButton(Inputs, onReset) {
  return Inputs.button(
    html`<img src="https://noita-bartender-images.acidflow.stream/images/icons/arrow-counterclockwise.svg" alt="" />Reset`,
    {label: "", reduce: onReset},
  );
}
