import {iconLabel} from '../ui/icons.js';
import {html} from "htl";
import {copyLinkText} from "./clipboard.js";
import {UIHelper} from "../noitalambic/ui/UIHelper.js";

export function createShareButton(getUrl, Inputs) {
  let disposed = false, sequence = 0;
  const status = html`<span role="status"></span>`;
  const copyInput = Inputs.text({label: "Share URL", value: "", readonly: true, width: "100%"});
  const fallback = html`<div hidden>${copyInput}</div>`;
  const feedback = html`<div hidden>${status}${fallback}</div>`;
  const button = Inputs.button(
    iconLabel("copy", "Share"),
    {reduce: async () => {
      if (disposed) return;
      const request = ++sequence;
      const active = () => !disposed && request === sequence;
      const copied = await copyLinkText(getUrl(), {
        clipboard: navigator.clipboard,
        fallback: (text) => {
          if (!active()) return false;
          copyInput.value = text;
          feedback.hidden = false;
          fallback.hidden = false;
          const input = copyInput.querySelector("input");
          input.focus({preventScroll: true});
          input.select();
          return document.execCommand?.("copy") === true;
        },
      });
      if (!active()) return;
      status.textContent = copied ? "" : "Copy the selected link below.";
      feedback.hidden = copied;
      fallback.hidden = copied;
      if (copied) {
        if (document.activeElement === copyInput.querySelector('input')) button.querySelector('button').focus({preventScroll: true});
        await UIHelper.showNotification("URL copied to clipboard", {success: true});
      }
    }},
  );
  return {
    button, feedback,
    clear() { sequence++; feedback.hidden = true; fallback.hidden = true; status.textContent = ""; },
    dispose() { disposed = true; sequence++; feedback.hidden = true; },
  };
}
