// DOM tests (jsdom) for the SVG export (UIController.exportGraphAsSVG + graph/SvgExporter.js).
// The exported file must render like the screen with nothing around it: no page stylesheet, no
// page background, no network, and not cropped to the current zoom/pan.

import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const XLINK_NS = "http://www.w3.org/1999/xlink";

async function setup(svgInnerHTML, { svgAttrs = 'viewBox="0 0 400 300" width="400" height="300"', containerStyle = "", uiOptions = {} } = {}) {
  const dom = new JSDOM(
    `<!doctype html><html><head><style>.css-colored { fill: rgb(10, 20, 30); }</style></head>
     <body><div id="graphContainer" style="${containerStyle}"><svg ${svgAttrs}>${svgInnerHTML}</svg></div></body></html>`,
    { url: "https://example.test/" },
  );
  global.window = dom.window;
  global.document = dom.window.document;
  global.XMLSerializer = dom.window.XMLSerializer;
  for (const name of ["Node", "NodeList", "HTMLCollection", "Element", "HTMLElement", "SVGElement", "DocumentFragment", "Text"]) global[name] = dom.window[name];
  Object.defineProperty(global, "navigator", { value: dom.window.navigator, configurable: true });

  let captured = null;
  global.URL.createObjectURL = (blob) => {
    captured = blob;
    return "blob:mock";
  };
  global.URL.revokeObjectURL = () => {};

  const { UIController } = await import("../ui/UIController.js");
  const { UIHelper } = await import("../ui/UIHelper.js");
  const notifications = [];
  UIHelper.showNotification = (text) => notifications.push(text);

  const state = { selectedReagents: [], selectedProduct: "", ...uiOptions.state };
  const ui = new UIController(state, null, uiOptions.graphRenderer ?? null, null, uiOptions.workspace ?? null);
  ui._loadImageEmbedder = async () => uiOptions.embedImage ?? (async () => null);

  const exportSvg = async () => {
    await ui.exportGraphAsSVG();
    if (!captured) return null;
    const text = await captured.text();
    return { text, doc: new dom.window.DOMParser().parseFromString(text, "image/svg+xml") };
  };

  // jsdom has no layout: a fake getBBox where leaves read their local box from data-bbox="x y w h",
  // groups union their children (shifted by translate(x,y)), and display:none content counts
  // for nothing - like in a browser. Also records the display state seen while measuring.
  const measuredDisplays = [];
  const enableLayout = () => {
    const translateOf = (el) => {
      const m = /translate\(([-\d.]+),([-\d.]+)\)/.exec(el.getAttribute("transform") || "");
      return m ? [Number(m[1]), Number(m[2])] : [0, 0];
    };
    const box = (el) => {
      if (el.style.display === "none") return null;
      const boxes = [];
      if (el.hasAttribute("data-bbox")) {
        const [x, y, width, height] = el.getAttribute("data-bbox").split(" ").map(Number);
        boxes.push({ x, y, width, height });
      }
      for (const child of el.children) {
        const b = box(child);
        if (!b) continue;
        const [dx, dy] = translateOf(child);
        boxes.push({ x: b.x + dx, y: b.y + dy, width: b.width, height: b.height });
      }
      if (boxes.length === 0) return null;
      const x = Math.min(...boxes.map((b) => b.x));
      const y = Math.min(...boxes.map((b) => b.y));
      return {
        x, y,
        width: Math.max(...boxes.map((b) => b.x + b.width)) - x,
        height: Math.max(...boxes.map((b) => b.y + b.height)) - y,
      };
    };
    dom.window.SVGElement.prototype.getBBox = function () {
      document.querySelectorAll("[clip-path]").forEach((el) => measuredDisplays.push(el.style.display));
      return box(this) ?? { x: 0, y: 0, width: 0, height: 0 };
    };
  };

  let downloadName = null;
  const originalClick = dom.window.HTMLAnchorElement.prototype.click;
  dom.window.HTMLAnchorElement.prototype.click = function () {
    downloadName = this.download;
    return originalClick.call(this);
  };

  return { dom, ui, notifications, exportSvg, enableLayout, measuredDisplays, getDownloadName: () => downloadName };
}

// ---------------------------------------------------------------------------
// Colors and markup
// ---------------------------------------------------------------------------

test("a color set only via a stylesheet rule is baked into the exported file", async () => {
  const { exportSvg } = await setup(`<g><circle class="css-colored" r="10"></circle></g>`);
  const { text } = await exportSvg();
  assert.match(text, /fill:\s*rgb\(10,\s*20,\s*30\)/);
});

test("a plain inline fill attribute survives export", async () => {
  const { exportSvg } = await setup(`<g><circle fill="rgb(5, 6, 7)" r="10"></circle></g>`);
  const { text } = await exportSvg();
  assert.match(text, /rgb\(5,\s*6,\s*7\)/);
});

test("the file is a valid standalone SVG: XML declaration, namespaces, no XHTML element", async () => {
  const { exportSvg } = await setup(`<g><circle fill="red" r="10"></circle></g>`);
  const { text, doc } = await exportSvg();
  assert.ok(text.startsWith('<?xml version="1.0"'));
  assert.equal(doc.querySelector("parsererror"), null);
  assert.equal(doc.documentElement.namespaceURI, "http://www.w3.org/2000/svg");
  assert.match(text, /xmlns:xlink="http:\/\/www\.w3\.org\/1999\/xlink"/);
  assert.doesNotMatch(text, /xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"/);
});

test("on-page positioning styles are dropped from the root", async () => {
  const { exportSvg } = await setup(`<g></g>`, {
    svgAttrs: 'viewBox="0 0 400 300" width="400" height="300" preserveAspectRatio="none" style="position:absolute;left:0"',
  });
  const root = (await exportSvg()).doc.documentElement;
  assert.equal(root.getAttribute("style"), null);
  assert.equal(root.getAttribute("preserveAspectRatio"), null);
});

test("tag visibility icons are kept (their color is resolved, not left to CSS)", async () => {
  const { exportSvg } = await setup(`<g><svg class="bi bi-eye tag-visibility-icon" fill="currentColor" style="color: rgb(1, 2, 3)"><path d="M0 0"></path></svg></g>`);
  const { text } = await exportSvg();
  assert.match(text, /tag-visibility-icon/);
});

// ---------------------------------------------------------------------------
// Framing and background
// ---------------------------------------------------------------------------

// A material-like node: background circle r=25, clipped texture whose raw box is huge, label below.
const node = (x, y) => `
  <g class="node" transform="translate(${x},${y})">
    <circle class="node-background" r="25" data-bbox="-25 -25 50 50"></circle>
    <g clip-path="url(#clip)" style="display: inline"><image href="x.png" data-bbox="-16 -16 504 504"></image></g>
    <text data-bbox="-30 28 60 12"></text>
  </g>`;

test("the whole graph is framed with padding, ignoring the raw size of clipped textures", async () => {
  const { exportSvg, enableLayout, measuredDisplays } = await setup(
    `<g transform="translate(10,10) scale(0.5)">
      ${node(0, 0)}
      <line data-bbox="0 0 300 100"></line>
      ${node(300, 100)}
      ${node(2000, 900)}
    </g>`,
  );
  enableLayout();
  const { doc } = await exportSvg();
  const root = doc.documentElement;
  // x: -30 (label) .. 2030 (label), y: -25 (circle) .. 940 (label), padding 20 on each side.
  assert.equal(root.getAttribute("viewBox"), "-50 -45 2100 1005");
  assert.equal(root.getAttribute("width"), "2100");
  assert.equal(root.getAttribute("height"), "1005");
  assert.equal(root.querySelector(":scope > g").getAttribute("transform"), null, "zoom transform removed");

  assert.ok(measuredDisplays.length > 0 && measuredDisplays.every((d) => d === "none"), "textures hidden while measuring");
  document.querySelectorAll("[clip-path]").forEach((el) => assert.equal(el.style.display, "inline", "live graph restored"));
  doc.querySelectorAll("[clip-path]").forEach((el) => assert.notEqual(el.getAttribute("style")?.includes("none"), true, "textures present in the file"));
  assert.equal(doc.querySelectorAll("image").length, 3);
});

test("without getBBox the current viewport is kept as-is", async () => {
  const { exportSvg } = await setup(`<g transform="translate(5,5)"><circle r="10"></circle></g>`);
  const root = (await exportSvg()).doc.documentElement;
  assert.equal(root.getAttribute("viewBox"), "0 0 400 300");
  assert.equal(root.querySelector(":scope > g").getAttribute("transform"), "translate(5,5)");
});

test("the page background is painted behind the graph", async () => {
  const { exportSvg, enableLayout } = await setup(`<g>${node(0, 0)}</g>`, {
    containerStyle: "background-color: rgb(20, 21, 22)",
  });
  enableLayout();
  const root = (await exportSvg()).doc.documentElement;
  const rect = root.querySelector(":scope > rect");
  assert.ok(rect, "background rect present");
  assert.equal(rect.getAttribute("fill"), "rgb(20, 21, 22)");
  assert.deepEqual(["x", "y", "width", "height"].map((a) => rect.getAttribute(a)), ["-50", "-45", "100", "105"]);
  assert.ok(rect.compareDocumentPosition(root.querySelector(":scope > g")) & 4, "painted before the graph");
});

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

test("images are embedded as data: URIs (both href and xlink:href), each distinct one read once", async () => {
  const reads = [];
  const embedImage = async (href) => (reads.push(href), `data:image/png;base64,${href.endsWith("water.png") ? "V0FURVI=" : "T0lM"}`);
  const { exportSvg, notifications } = await setup(
    `<g>
      <image class="material-image" href="https://cdn.test/Material_water.png"></image>
      <image class="material-image" href="https://cdn.test/Material_water.png"></image>
      <image class="material-image" href="https://cdn.test/Material_oil.png"></image>
    </g>`,
    { uiOptions: { embedImage } },
  );
  const { text, doc } = await exportSvg();
  assert.doesNotMatch(text, /cdn\.test/, "no network reference left");
  const images = [...doc.querySelectorAll("image")];
  assert.equal(images.length, 3);
  images.forEach((img) => assert.equal(img.getAttribute("href"), img.getAttributeNS(XLINK_NS, "href")));
  assert.equal(images[0].getAttribute("href"), "data:image/png;base64,V0FURVI=");
  assert.equal(reads.length, 2);
  assert.equal(notifications.at(-1), "Graph exported as SVG");
});

test("an image that can't be embedded keeps its link and the user is told", async () => {
  const embedImage = async (href) => (href.includes("water") ? "data:image/png;base64,AAAA" : null);
  const { exportSvg, notifications } = await setup(
    `<g>
      <image href="https://cdn.test/Material_water.png"></image>
      <image href="https://cdn.test/Material_modded.png"></image>
    </g>`,
    { uiOptions: { embedImage } },
  );
  const { doc } = await exportSvg();
  const modded = doc.querySelectorAll("image")[1];
  assert.equal(modded.getAttributeNS(XLINK_NS, "href"), "https://cdn.test/Material_modded.png");
  assert.match(notifications.at(-1), /1 image could not be embedded/);
});

test("images that failed to load on screen are dropped, and a failing embedder doesn't break the export", async () => {
  const { exportSvg } = await setup(
    `<g>
      <image href="https://cdn.test/broken.png" style="display: none"></image>
      <image href="https://cdn.test/Material_water.png"></image>
    </g>`,
    { uiOptions: { embedImage: async () => { throw new Error("boom"); } } },
  );
  const { doc } = await exportSvg();
  const images = doc.querySelectorAll("image");
  assert.equal(images.length, 1);
  assert.equal(images[0].getAttribute("href"), "https://cdn.test/Material_water.png");
});

// ---------------------------------------------------------------------------
// Highlight, file name, errors
// ---------------------------------------------------------------------------

test("the copy is taken with the highlight removed, and the highlight comes back afterwards", async () => {
  const log = [];
  const graphRenderer = {
    withoutHighlight(fn) {
      document.querySelector("circle").setAttribute("opacity", "1");
      log.push("reset");
      try {
        return fn();
      } finally {
        document.querySelector("circle").setAttribute("opacity", "0.15");
        log.push("restore");
      }
    },
  };
  const { exportSvg } = await setup(`<g><circle opacity="0.15" r="10"></circle></g>`, { uiOptions: { graphRenderer } });
  const { doc } = await exportSvg();
  assert.deepEqual(log, ["reset", "restore"]);
  assert.equal(doc.querySelector("circle").getAttribute("opacity"), "1");
  assert.equal(document.querySelector("circle").getAttribute("opacity"), "0.15", "live graph untouched");
});

test("file name: classic selection plus date; advanced mode leaves the global selection out", async () => {
  const date = new Date().toISOString().slice(0, 10);
  const classic = await setup(`<g></g>`, { uiOptions: { state: { selectedReagents: ["water", "oil"], selectedProduct: "steam" } } });
  await classic.exportSvg();
  assert.equal(classic.getDownloadName(), `reactions_graph_reagents_water_oil_product_steam_${date}.svg`);

  const advanced = await setup(`<g></g>`, { uiOptions: { state: { selectedReagents: ["water"] }, workspace: {} } });
  await advanced.exportSvg();
  assert.equal(advanced.getDownloadName(), `reactions_graph_${date}.svg`);
});

test("shows a notification instead of throwing when there is no graph to export", async () => {
  const { ui, notifications } = await setup("");
  document.getElementById("graphContainer").innerHTML = "";
  await ui.exportGraphAsSVG();
  assert.deepEqual(notifications, ["No graph to export"]);
});

// ---------------------------------------------------------------------------
// Raster formats and split button
// ---------------------------------------------------------------------------

test("PNG and JPEG are rendered from the standalone SVG, with the right size, type and extension", async () => {
  const date = new Date().toISOString().slice(0, 10);
  for (const [format, mime, extension, label] of [["png", "image/png", "png", "PNG"], ["jpeg", "image/jpeg", "jpg", "JPEG"]]) {
    const { ui, notifications, getDownloadName } = await setup(`<g><circle r="10"></circle></g>`, { containerStyle: "background-color: rgb(1, 2, 3)" });
    let call = null;
    ui._rasterize = async (text, options) => {
      call = { text, options };
      return new Blob(["fake"], { type: mime });
    };
    await ui.exportGraph(format);
    assert.match(call.text, /^<\?xml/);
    assert.equal(call.options.width, 400);
    assert.equal(call.options.height, 300);
    assert.equal(call.options.mime, mime);
    assert.equal(call.options.background, "rgb(1, 2, 3)");
    assert.equal(getDownloadName(), `reactions_graph_${date}.${extension}`);
    assert.equal(notifications.at(-1), `Graph exported as ${label}`);
  }
});

test("a rasterization failure is reported, nothing is downloaded", async () => {
  const { ui, notifications, getDownloadName } = await setup(`<g></g>`);
  ui._rasterize = async () => {
    throw new Error("canvas too large");
  };
  await ui.exportGraph("png");
  assert.equal(notifications.at(-1), "PNG export failed");
  assert.equal(getDownloadName(), null);
});

test("split button: main part exports SVG, then its copy button, then the arrow opening the other formats", async () => {
  const { ui } = await setup(`<g></g>`);
  ui._loadMenu = async () => {};
  const exported = [];
  const copied = [];
  ui.exportGraph = async (format) => exported.push(format);
  ui.copyGraph = async (format) => copied.push(format);

  const control = ui.createExportButton();
  const group = control.querySelector(".btn-group");
  const [main, copy, toggle, menu] = group.children;
  assert.equal(copy.dataset.copyFormat, "svg");
  assert.match(copy.getAttribute("aria-label"), /clipboard/i);
  assert.equal(main.dataset.exportFormat, "svg");
  assert.match(main.textContent, /Export SVG/);
  assert.equal(toggle.getAttribute("data-bs-toggle"), "menu");
  assert.ok(menu.classList.contains("menu"), "menu right after the arrow (Bootstrap split button markup)");
  assert.deepEqual([...menu.querySelectorAll("[data-export-format]")].map((item) => item.dataset.exportFormat), ["png", "jpeg"]);
  assert.deepEqual([...menu.querySelectorAll("[data-copy-format]")].map((item) => item.dataset.copyFormat), ["png", "jpeg"], "each format row has its copy button");

  main.click();
  menu.querySelector('[data-export-format="png"]').click();
  menu.querySelector('[data-export-format="jpeg"]').click();
  toggle.click();
  assert.deepEqual(exported, ["svg", "png", "jpeg"], "the arrow itself exports nothing");
  copy.click();
  menu.querySelector('[data-copy-format="png"]').click();
  menu.querySelector('[data-copy-format="jpeg"]').click();
  assert.deepEqual(copied, ["svg", "png", "jpeg"]);
});

test("both parts of the split button are disabled while there is no graph", async () => {
  const { ui } = await setup(`<g></g>`);
  ui._loadMenu = async () => {};
  const control = ui.createExportButton();
  document.body.append(control);
  const buttons = () => [...control.querySelectorAll(".btn-group > button")];
  assert.ok(buttons().every((b) => !b.disabled));

  document.getElementById("graphContainer").innerHTML = "";
  ui.updateExportButton();
  assert.equal(buttons().length, 3, "export, copy, arrow");
  assert.ok(buttons().every((b) => b.disabled));
});

test("rasterScale keeps 2x unless the canvas would exceed browser limits", async () => {
  const { rasterScale } = await import("../graph/rasterizeSvg.js");
  assert.equal(rasterScale(800, 600), 2);
  assert.equal(rasterScale(6000, 1000), 8192 / 6000);
  assert.ok(Math.abs(rasterScale(4000, 4000) * 4000 - 4096) < 1e-6, "16M pixels max");
});

test("Bootstrap's menu styles are compiled in, otherwise the export menu is always shown", async () => {
  const { readFileSync } = await import("node:fs");
  const scss = readFileSync(new URL("../../styles/_bootstrap.scss", import.meta.url), "utf8");
  assert.match(scss, /^@forward "bootstrap\/scss\/menu";$/m);
});

// ---------------------------------------------------------------------------
// Copy to the clipboard
// ---------------------------------------------------------------------------

// A clipboard that records what is written; ClipboardItem resolves its promised blobs.
function fakeClipboard(dom, { supported = ["image/png", "text/plain"], fail = false } = {}) {
  const written = [];
  global.ClipboardItem = class {
    constructor(items) { this.items = items; }
    static supports(type) { return supported.includes(type); }
  };
  Object.defineProperty(dom.window.navigator, "clipboard", {
    configurable: true,
    value: {
      async write(items) {
        if (fail) throw new Error("denied");
        for (const item of items) {
          const entry = {};
          for (const [type, value] of Object.entries(item.items)) entry[type] = await value;
          written.push(entry);
        }
      },
    },
  });
  return written;
}

test("copy SVG: the standalone SVG source goes to the clipboard as text, and as an SVG image where supported", async () => {
  const { dom, ui, notifications } = await setup(`<g><circle fill="red" r="10"></circle></g>`);
  const written = fakeClipboard(dom, { supported: ["image/png", "text/plain", "image/svg+xml"] });
  await ui.copyGraph("svg");
  assert.equal(written.length, 1);
  assert.match(await written[0]["text/plain"].text(), /^<\?xml[\s\S]*<svg/);
  assert.match(await written[0]["image/svg+xml"].text(), /<svg/);
  assert.equal(notifications.at(-1), "Graph copied to the clipboard as SVG");

  const plain = fakeClipboard(dom); // no SVG image support: text only
  await ui.copyGraph("svg");
  assert.deepEqual(Object.keys(plain[0]), ["text/plain"]);
});

test("copy PNG: the rendered PNG goes to the clipboard; nothing is downloaded", async () => {
  const { dom, ui, notifications, getDownloadName } = await setup(`<g><circle r="10"></circle></g>`);
  const written = fakeClipboard(dom);
  const png = new Blob(["png"], { type: "image/png" });
  ui._rasterize = async (text, options) => {
    assert.equal(options.mime, "image/png");
    return png;
  };
  await ui.copyGraph("png");
  assert.equal(written[0]["image/png"], png);
  assert.equal(getDownloadName(), null);
  assert.equal(notifications.at(-1), "Graph copied to the clipboard as PNG");
});

test("copy JPEG: clipboards hold no JPEG, so the same opaque picture goes as PNG, and the user is told", async () => {
  const { dom, ui, notifications } = await setup(`<g></g>`, { containerStyle: "background-color: rgb(1, 2, 3)" });
  const written = fakeClipboard(dom);
  let options = null;
  ui._rasterize = async (text, o) => {
    options = o;
    return new Blob(["png"], { type: "image/png" });
  };
  await ui.copyGraph("jpeg");
  assert.equal(options.mime, "image/png");
  assert.equal(options.background, "rgb(1, 2, 3)", "still painted on the page background, like the JPEG");
  assert.deepEqual(Object.keys(written[0]), ["image/png"]);
  assert.match(notifications.at(-1), /as an image \(PNG: clipboards can't hold JPEG\)/);
});

test("copy failures and missing clipboard support are reported, never thrown", async () => {
  const { dom, ui, notifications } = await setup(`<g></g>`);
  fakeClipboard(dom, { fail: true });
  await ui.copyGraph("svg");
  assert.equal(notifications.at(-1), "Copying the graph as SVG failed");

  delete global.ClipboardItem;
  await ui.copyGraph("png");
  assert.equal(notifications.at(-1), "Copying images isn't available in this browser");

  fakeClipboard(dom);
  document.getElementById("graphContainer").innerHTML = "";
  await ui.copyGraph("png");
  assert.equal(notifications.at(-1), "No graph to copy");
  delete global.ClipboardItem;
});
