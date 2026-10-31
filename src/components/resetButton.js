import {iconLabel} from '../ui/icons.js';

export function createResetButton(Inputs, onReset) {
  return Inputs.button(
    iconLabel("arrow-counterclockwise", "Reset"),
    {label: "", reduce: onReset},
  );
}
