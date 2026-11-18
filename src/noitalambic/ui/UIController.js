import {html} from "htl";
import {icon, iconLabel} from "../../ui/icons.js";
import {setControlDisabled} from '../../ui/disabled.js';
import {numberText} from '../../ui/format.js';
// ============================================================================
// UI CONTROLLER - Manages UI controls and interactions
// ============================================================================

import { CONFIG } from "../config/config.js";
import { UIHelper } from "./UIHelper.js";
import { downloadBlob } from "./download.js";
import { buildStandaloneSvg } from "../graph/SvgExporter.js";
import { EXPORT_FORMATS, rasterizeSvg } from "../graph/rasterizeSvg.js";

export class UIController {
  // reactionSetWorkspace/reactionSetPanel are optional: they are only set when the multi-set
  // feature (ReactionSetPanel) drives the graph through updateUIFromResolvedSets().
  constructor(state, reactionFilter, graphRenderer, dataRepo, reactionSetWorkspace = null, reactionSetPanel = null) {
    this.state = state;
    this.reactionFilter = reactionFilter;
    this.graphRenderer = graphRenderer;
    this.dataRepo = dataRepo;
    this.reactionSetWorkspace = reactionSetWorkspace;
    this.reactionSetPanel = reactionSetPanel;
  }

  createUnusedMaterialsToggle(Inputs) {
    const toggle = Inputs.toggle({label: "Exclude unused materials (base game)", value: this.state.excludeUnusedMaterials});
    toggle.title = "Hides materials classified as unused in normal gameplay.";
    toggle.addEventListener("input", () => this.state.setExcludeUnusedMaterials(toggle.value));
    this.unusedMaterialsToggle = toggle;
    this.updateUnusedMaterialsToggle();
    return toggle;
  }

  updateUnusedMaterialsToggle() {
    const toggle = this.unusedMaterialsToggle;
    if (!toggle) return;
    toggle.value = this.state.excludeUnusedMaterials;
    setControlDisabled(toggle.querySelector("input"), this.state.reactionSource !== "base",
      'Material availability has only been audited for the base game.');
  }

  // Split button: the main part exports SVG; the arrow, part of the same button, opens a menu
  // with the raster formats (Bootstrap menu, kept in place so it also works in fullscreen).
  createExportButton() {
    const copyLabel = (format) => `Copy as ${EXPORT_FORMATS[format].label} to the clipboard`;
    const main = html`<button type="button" class="btn-outline theme-secondary" data-export-format="svg">${iconLabel("download", "Export SVG")}</button>`;
    const copy = html`<button type="button" class="btn-outline theme-secondary" data-copy-format="svg"
      aria-label=${copyLabel("svg")} title=${copyLabel("svg")}>${icon("clipboard")}</button>`;
    const toggle = html`<button type="button" class="btn-outline theme-secondary export-format-toggle" data-bs-toggle="menu"
      aria-expanded="false" aria-label="Other export formats" title="Other export formats">${icon("chevron-down")}</button>`;
    // Each other format: export it, or copy it (the clipboard icon at the end of its row).
    const items = ["png", "jpeg"].map((format) => html`<div class="export-menu-row">
      <button type="button" class="menu-item" data-export-format=${format}>${icon("download")} Export ${EXPORT_FORMATS[format].label}</button>
      <button type="button" class="menu-item export-copy" data-copy-format=${format} aria-label=${copyLabel(format)} title=${copyLabel(format)}>${icon("clipboard")}</button>
    </div>`);
    this.exportButton = html`<span class="action-control"><div class="btn-group" role="group" aria-label="Export graph">${main}${copy}${toggle}<div class="menu">${items}</div></div></span>`;

    this.exportButton.querySelectorAll("[data-export-format]").forEach((el) =>
      el.addEventListener("click", () => this.exportGraph(el.dataset.exportFormat)));
    this.exportButton.querySelectorAll("[data-copy-format]").forEach((el) =>
      el.addEventListener("click", () => this.copyGraph(el.dataset.copyFormat)));
    this._loadMenu().catch((error) => console.error("Export menu unavailable", error));
    this.updateExportButton();
    return this.exportButton;
  }

  // Bootstrap's menu registers its data API (data-bs-toggle="menu") on import.
  _loadMenu() {
    return import("bootstrap/js/dist/menu.js");
  }

  updateExportButton() {
    if (!this.exportButton) return;
    const disabled = !document.querySelector("#graphContainer svg");
    this.exportButton.querySelectorAll(".btn-group > button").forEach((button) =>
      setControlDisabled(button, disabled, "Choose filters that produce a graph before exporting."));
  }

  exportGraphAsSVG() {
    return this.exportGraph("svg");
  }

  // Downloads the whole graph as SVG, PNG or JPEG (see _renderGraph for what the file holds).
  async exportGraph(format = "svg") {
    const target = EXPORT_FORMATS[format];
    if (!target) throw new Error(`Unknown export format "${format}"`);
    if (!this._graphSvg()) return UIHelper.showNotification("No graph to export");

    let rendered;
    try {
      rendered = await this._renderGraph(format);
    } catch (error) {
      console.error(`${target.label} export failed`, error);
      UIHelper.showNotification(`${target.label} export failed`);
      return;
    }

    downloadBlob(rendered.blob, this._exportFileName(target.extension));
    UIHelper.showNotification(`Graph exported as ${target.label}${this._missingImagesNote(rendered, format)}`);
  }

  // Same picture as exportGraph, put on the clipboard instead of downloaded. SVG goes as its
  // source text (what drawing tools take when pasting SVG), plus as an SVG image where the browser
  // allows it. Clipboards hold no JPEG: its copy is the same opaque picture as PNG.
  async copyGraph(format = "svg") {
    const target = EXPORT_FORMATS[format];
    if (!target) throw new Error(`Unknown export format "${format}"`);
    const ClipboardItemClass = globalThis.ClipboardItem;
    if (typeof navigator === "undefined" || !navigator.clipboard?.write || typeof ClipboardItemClass !== "function") {
      return UIHelper.showNotification("Copying images isn't available in this browser");
    }
    if (!this._graphSvg()) return UIHelper.showNotification("No graph to copy");

    const supports = (type) => (typeof ClipboardItemClass.supports === "function" ? ClipboardItemClass.supports(type) : type === "image/png");
    const asJpeg = format === "jpeg" && supports("image/jpeg");
    const renderAs = format === "jpeg" && !asJpeg ? "png" : format;
    // Started now and handed over as promises: the clipboard write keeps the click's user
    // activation while the picture is still being rendered (Safari and Chrome require it).
    const rendering = this._renderGraph(renderAs);
    const items = {};
    if (format === "svg") {
      items["text/plain"] = rendering.then((r) => new Blob([r.svgText], { type: "text/plain" }));
      if (supports("image/svg+xml")) items["image/svg+xml"] = rendering.then((r) => r.blob);
    } else {
      items[EXPORT_FORMATS[renderAs].mime] = rendering.then((r) => r.blob);
    }

    try {
      await navigator.clipboard.write([new ClipboardItemClass(items)]);
    } catch (error) {
      console.error(`${target.label} copy failed`, error);
      UIHelper.showNotification(`Copying the graph as ${target.label} failed`);
      return;
    }
    const rendered = await rendering;
    const label = format === "jpeg" && !asJpeg ? "an image (PNG: clipboards can't hold JPEG)" : target.label;
    UIHelper.showNotification(`Graph copied to the clipboard as ${label}${this._missingImagesNote(rendered, format)}`);
  }

  _graphSvg() {
    return document.querySelector("#graphContainer svg");
  }

  // The whole graph as a standalone picture: no zoom/pan crop, no highlight, page background
  // included and material images embedded, so it renders offline anywhere. Raster formats are
  // rendered from that same standalone SVG. -> {blob, svgText, externalImages}
  async _renderGraph(format) {
    const target = EXPORT_FORMATS[format];
    const svgElement = this._graphSvg();
    const embedImage = await this._loadImageEmbedder().catch(() => null);
    const background = UIHelper.backgroundColorOf(svgElement);
    // The clone (and its computed colors) is taken synchronously inside withoutHighlight; only
    // the image embedding that follows is asynchronous, and it works on the clone alone.
    const svg = await this._withoutHighlight(() => buildStandaloneSvg(svgElement, { background, embedImage: embedImage ?? undefined }));
    const blob = format === "svg"
      ? new Blob([svg.text], { type: "image/svg+xml;charset=utf-8" })
      : await this._rasterize(svg.text, { width: svg.width, height: svg.height, mime: target.mime, quality: target.quality, background });
    return { blob, svgText: svg.text, externalImages: svg.externalImages };
  }

  _missingImagesNote({ externalImages }, format) {
    if (!(externalImages > 0)) return "";
    const missing = `${externalImages} image${externalImages > 1 ? "s" : ""} could not be embedded`;
    return ` (${missing}${format === "svg" ? " and still need the network" : " and are missing"})`;
  }

  // Separate so tests can stub it: jsdom has no canvas.
  _rasterize(svgText, options) {
    return rasterizeSvg(svgText, options);
  }

  _withoutHighlight(fn) {
    return this.graphRenderer?.withoutHighlight ? this.graphRenderer.withoutHighlight(fn) : fn();
  }

  // Separate so tests can stub it: the real module relies on Vite's import.meta.glob.
  async _loadImageEmbedder() {
    const { embedMaterialImage } = await import("../graph/materialImageEmbedder.js");
    return embedMaterialImage;
  }

  // reactions_graph[_<selection>]_<date>.<extension>. The classic selection names the file; in advanced
  // mode the global selection doesn't describe the graph (the sets do), so it is left out.
  _exportFileName(extension = "svg") {
    const parts = ["reactions_graph"];
    if (!this.reactionSetWorkspace) {
      if (this.state.selectedReagents.length > 0) parts.push("reagents", ...this.state.selectedReagents);
      if (this.state.selectedProduct) parts.push("product", this.state.selectedProduct);
    }
    const date = new Date().toISOString().slice(0, 10);
    const base = parts.join("_").replace(/[^\w.-]+/g, "-").slice(0, 100);
    return `${base}_${date}.${extension}`;
  }

  updateChoicesOptions() {
    const availableReagents = this.reactionFilter.getAvailableReagents(
      this.state.selectedReagents,
      this.state.selectedProduct,
    );
    const availableProducts = this.reactionFilter.getAvailableProducts(this.state.selectedReagents);

    if (this.state.reagentChoices?.initialised) {
      this.state.reagentChoices.clearStore();
      this.state.reagentChoices.setChoices(availableReagents, "value", "label", true);
      this.state.selectedReagents.forEach((value) => {
        if (availableReagents.some((r) => r.value === value)) {
          this.state.reagentChoices.setChoiceByValue(value);
        }
      });
    }

    if (this.state.productChoices?.initialised) {
      this.state.productChoices.clearStore();
      this.state.productChoices.setChoices(availableProducts, "value", "label", true);
      if (this.state.selectedProduct && availableProducts.some((p) => p.value === this.state.selectedProduct)) {
        this.state.productChoices.setChoiceByValue(this.state.selectedProduct);
      }
    }
  }

  updateUI() {
    this.updateUnusedMaterialsToggle();
    const filteredReactions = this.reactionFilter.getFilteredReactions(
      this.state.selectedReagents,
      this.state.selectedProduct,
      this.state.minReactionSpeed,
    );

    const reactionsCountContainer = document.getElementById("reactionsCount");
    if (reactionsCountContainer) {
      const count = document.createElement('code');
      count.className = 'bigger-number-better';
      count.append(numberText(filteredReactions.length));
      reactionsCountContainer.replaceChildren('Reactions found: ', count);
    }

    this.graphRenderer.render(filteredReactions);
    this.updateExportButton();
    this.state.updateURL();
  }

  // Multi-set counterpart of updateUI(), called by ReactionSetPanel every time the union /
  // intersection / difference of the active reaction sets is recomputed.
  updateUIFromResolvedSets(result) {
    this.updateUnusedMaterialsToggle();
    const reactionsCountContainer = document.getElementById("reactionsCount");
    if (reactionsCountContainer) {
      const count = document.createElement('code');
      count.className = 'bigger-number-better';
      count.append(numberText(result.totalCount));
      reactionsCountContainer.replaceChildren('Reactions found: ', count);
    }

    this.graphRenderer.render(result.entries);
    this.updateExportButton();
  }
}
