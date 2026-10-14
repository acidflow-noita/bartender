import * as Inputs from "npm:@observablehq/inputs";
import {html} from "htl";
import {copyLinkText} from "./clipboard.js";

export function createShareButton(getUrl) {
  const status = html`<span role="status"></span>`;
  const copyInput = Inputs.text({label: "Share URL", value: "", readonly: true, width: "100%"});
  const fallback = html`<div hidden>${copyInput}</div>`;
  const feedback = html`<div hidden>${status}${fallback}</div>`;
  const button = Inputs.button(
    html`<img src="https://noita-bartender-images.acidflow.stream/images/icons/copy.svg" alt="" />Share`,
    {reduce: async () => {
      const copied = await copyLinkText(getUrl(), {
        clipboard: navigator.clipboard,
        fallback: (text) => {
          copyInput.value = text;
          feedback.hidden = false;
          fallback.hidden = false;
          const input = copyInput.querySelector("input");
          input.focus({preventScroll: true});
          input.select();
          return document.execCommand?.("copy") === true;
        },
      });
      status.textContent = copied ? "Link copied." : "Copy the selected link below.";
      feedback.hidden = false;
      fallback.hidden = copied;
    }},
  );
  return {
    button, feedback,
    clear() { feedback.hidden = true; fallback.hidden = true; status.textContent = ""; },
  };
}
