// DOM tests (jsdom) for UIController.exportGraphAsSVG(). The core bug this guards against: a
// standalone exported .svg file has no access to the page's stylesheets, so any color that is
// only correct on screen because of CSS (not a plain inline attribute) would silently be lost on
// export unless the live computed style is baked into the clone first.

import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

async function setupDom(svgInnerHTML) {
  const dom = new JSDOM(
    `<!doctype html><html><head><style>.css-colored { fill: rgb(10, 20, 30); }</style></head>
     <body><div id="graphContainer"><svg>${svgInnerHTML}</svg></div></body></html>`,
    { url: "https://example.test/" },
  );

  global.window = dom.window;
  global.document = dom.window.document;
  global.XMLSerializer = dom.window.XMLSerializer;
  Object.defineProperty(global, "navigator", { value: dom.window.navigator, configurable: true });

  let capturedBlob = null;
  global.URL.createObjectURL = (blob) => {
    capturedBlob = blob;
    return "blob:mock";
  };
  global.URL.revokeObjectURL = () => {};

  const { UIController } = await import("../ui/UIController.js");
  const state = { selectedReagents: [], selectedProduct: "" };
  const uiController = new UIController(state, null, null, null);

  return { dom, uiController, getCapturedBlob: () => capturedBlob };
}

test("a color set only via an external stylesheet rule is baked into the exported file", async () => {
  const { uiController, getCapturedBlob } = await setupDom(
    `<circle class="css-colored node-background" r="10"></circle>`,
  );

  uiController.exportGraphAsSVG();

  const text = await getCapturedBlob().text();
  // jsdom applies the <style> rule, so the live computed fill is rgb(10, 20, 30); the exported
  // file must carry that forward as an explicit inline style, since the <style> element itself
  // (and any external custom.css) is not guaranteed to travel with a standalone .svg.
  assert.match(text, /fill:\s*rgb\(10,\s*20,\s*30\)/);
});

test("a plain inline fill attribute still survives export unchanged", async () => {
  const { uiController, getCapturedBlob } = await setupDom(`<circle fill="rgb(5, 6, 7)" r="10"></circle>`);

  uiController.exportGraphAsSVG();

  const text = await getCapturedBlob().text();
  assert.match(text, /rgb\(5,\s*6,\s*7\)/);
});

test("tag-visibility and generic UI icons are removed, but material images are kept", async () => {
  const { uiController, getCapturedBlob } = await setupDom(`
    <image class="tag-visibility-icon" href="https://example.com/images/icons/eye-open.svg"></image>
    <image href="https://example.com/images/icons/eye-closed.svg"></image>
    <image class="material-image" href="https://example.com/images/materials/Material_water.png"></image>
  `);

  uiController.exportGraphAsSVG();

  const text = await getCapturedBlob().text();
  assert.doesNotMatch(text, /icons\/eye-open/);
  assert.doesNotMatch(text, /icons\/eye-closed/);
  assert.match(text, /materials\/Material_water/);
});

test("the injected export <style> element is correctly namespaced, unlike before the fix", async () => {
  const { uiController, getCapturedBlob } = await setupDom(`<circle fill="red" r="10"></circle>`);

  uiController.exportGraphAsSVG();

  const text = await getCapturedBlob().text();
  // Before the fix (document.createElement instead of createElementNS), the <style> element was
  // HTML(XHTML)-namespaced, which XMLSerializer expresses as an explicit xmlns="...xhtml" once
  // embedded in the namespaced SVG document - confirmed empirically against the old code.
  assert.doesNotMatch(text, /xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/);
});

test("shows a notification instead of throwing when there is no graph to export", async () => {
  const { uiController } = await setupDom("");
  document.getElementById("graphContainer").innerHTML = ""; // remove the <svg> entirely

  assert.doesNotThrow(() => uiController.exportGraphAsSVG());
});
