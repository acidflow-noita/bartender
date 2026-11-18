// ============================================================================
// SVG EXPORTER - Builds a standalone, self-contained copy of the live graph SVG
// ============================================================================
// The exported file must look like the screen without this page around it: no stylesheet, no
// CSS variables, no page background and, ideally, no network. So the copy:
//   - frames the whole graph (not the zoom/pan viewport), ignoring clipped textures' raw size,
//   - carries every rendered fill/stroke as an inline style (CSS rules don't travel),
//   - gets an explicit background (labels are white: invisible on a transparent background),
//   - embeds images as data: URIs when an embedImage() resolver can read them,
//   - crops each embedded image to the circle its node clips it to: the clip-path stays, but
//     viewers and converters that ignore clip-path would otherwise show whole textures.

import { toSrgb } from "../ui/cssColor.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";
const XMLNS_NS = "http://www.w3.org/2000/xmlns/";

// Options:
//   background  CSS color painted behind the graph, or null for transparent.
//   padding     margin around the graph's bounding box, in graph units.
//   embedImage  async (href) => data: URI | null.
// Returns {text, width, height, embeddedImages, externalImages}.
export async function buildStandaloneSvg(liveSvg, { background = null, padding = 20, embedImage = async () => null } = {}) {
  const liveContent = liveSvg.querySelector(":scope > g");
  const frame = contentFrame(liveSvg, liveContent, padding);

  const clone = liveSvg.cloneNode(true);
  // Must run before any change to the clone: elements are paired by document order.
  inlineComputedColors(liveSvg, clone);

  clone.setAttributeNS(XMLNS_NS, "xmlns", SVG_NS);
  clone.setAttributeNS(XMLNS_NS, "xmlns:xlink", XLINK_NS);
  clone.removeAttribute("style"); // on-page positioning (position:absolute...)
  clone.removeAttribute("preserveAspectRatio");
  clone.setAttribute("viewBox", frame.join(" "));
  clone.setAttribute("width", round(frame[2]));
  clone.setAttribute("height", round(frame[3]));
  if (frame.contentSpace) clone.querySelector(":scope > g")?.removeAttribute("transform");

  const style = document.createElementNS(SVG_NS, "style");
  style.textContent = ".node-label { font-family: Arial, sans-serif; } .material-image { image-rendering: optimizeQuality; }";
  clone.insertBefore(style, clone.firstChild);

  if (background) {
    const rect = document.createElementNS(SVG_NS, "rect");
    const [x, y, width, height] = frame;
    Object.entries({ x, y, width, height, fill: background }).forEach(([key, value]) => rect.setAttribute(key, value));
    style.after(rect);
  }

  const { embeddedImages, externalImages } = await embedImages(clone, embedImage);
  await cropClippedImages(clone);

  const text = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' + new XMLSerializer().serializeToString(clone);
  return { text, width: frame[2], height: frame[3], embeddedImages, externalImages };
}

// [x, y, width, height] to frame, in the content group's own space (zoom/pan removed): the
// whole graph plus padding. Falls back to the current viewBox (transform kept) when the browser
// can't measure (jsdom, graph not rendered).
function contentFrame(liveSvg, liveContent, padding) {
  const box = measureIgnoringClippedContent(liveContent);
  if (box) {
    const frame = [box.x - padding, box.y - padding, box.width + 2 * padding, box.height + 2 * padding].map(round);
    frame.contentSpace = true;
    return frame;
  }
  const viewBox = (liveSvg.getAttribute("viewBox") || "").split(/[\s,]+/).map(Number);
  if (viewBox.length === 4 && viewBox.every(Number.isFinite)) return viewBox;
  return [0, 0, Number(liveSvg.getAttribute("width")) || 800, Number(liveSvg.getAttribute("height")) || 600];
}

// getBBox() ignores clip-path: each material texture (252px, larger than its node, clipped to
// the node circle) would count at full size and leave large blank areas. Clipped content always sits
// inside its node, so it is hidden while measuring (display:none content doesn't count) and
// shown again right after. Synchronous: the hidden state is never painted.
function measureIgnoringClippedContent(content) {
  if (typeof content?.getBBox !== "function") return null;
  const clipped = [...content.querySelectorAll("[clip-path]")];
  const previous = clipped.map((el) => el.style.display);
  clipped.forEach((el) => (el.style.display = "none"));
  try {
    const box = content.getBBox();
    return box && (box.width > 0 || box.height > 0) ? box : null;
  } catch {
    return null; // not rendered
  } finally {
    clipped.forEach((el, i) => (el.style.display = previous[i]));
  }
}

const round = (value) => Math.round(value * 100) / 100;

// Copies the live computed fill/stroke onto the clone. Presentation attributes lose to CSS rules,
// and no CSS travels with the file, so the computed value is the only one sure to match the
// screen. It also resolves currentColor and var(--...), and converts to sRGB.
function inlineComputedColors(liveRoot, cloneRoot) {
  const liveElements = liveRoot.querySelectorAll("*");
  const cloneElements = cloneRoot.querySelectorAll("*");
  liveElements.forEach((liveEl, index) => {
    const cloneEl = cloneElements[index];
    if (!cloneEl) return;
    const computed = window.getComputedStyle(liveEl);
    // toSrgb: computed values keep oklch()/color-mix() from the theme, unknown to many renderers.
    if (computed.fill && computed.fill !== "none" && !computed.fill.startsWith("url(")) cloneEl.style.fill = toSrgb(computed.fill);
    if (computed.stroke && computed.stroke !== "none" && !computed.stroke.startsWith("url(")) cloneEl.style.stroke = toSrgb(computed.stroke);
    if (cloneEl.style.color?.startsWith("var(")) cloneEl.style.color = toSrgb(computed.color);
  });
}

// The part of an image its circular clip shows: image = {x, y, width, height} in user units (a
// square texture of naturalSize px drawn over a square box), circle = {cx, cy, r}. Returns the
// source square to read, in texture pixels, and the box it fills; null when the circle is not
// entirely over the image (nothing sensible to crop).
export function circularCrop(image, circle, naturalSize) {
  if (!(image.width > 0) || !(naturalSize > 0) || !(circle.r > 0)) return null;
  const box = { x: circle.cx - circle.r, y: circle.cy - circle.r, width: 2 * circle.r, height: 2 * circle.r };
  if (box.x < image.x || box.y < image.y || box.x + box.width > image.x + image.width || box.y + box.height > image.y + image.height) return null;
  const scale = naturalSize / image.width; // texture px per user unit
  return { sx: (box.x - image.x) * scale, sy: (box.y - image.y) * scale, size: box.width * scale, box };
}

// Replaces every embedded (data: URI) image that sits under a circular clip-path with just the
// disc that shows, cut on a canvas at the texture's own resolution. Needs a browser canvas: where
// there is none (jsdom), images are left as they are, the clip-path still doing the job.
async function cropClippedImages(clone) {
  if (typeof window.CanvasRenderingContext2D !== "function" || typeof window.Image !== "function") return;
  const cache = new Map(); // href + crop -> Promise<data URI | null>
  await Promise.all(
    [...clone.querySelectorAll("image")].map(async (image) => {
      const href = image.getAttribute("href");
      if (!href?.startsWith("data:")) return;
      const id = image.closest("[clip-path]")?.getAttribute("clip-path")?.match(/^url\(#(.+)\)$/)?.[1];
      const circle = id && [...clone.querySelectorAll("clipPath")].find((clip) => clip.id === id)?.querySelector("circle");
      if (!circle) return;
      const number = (el, name) => Number(el.getAttribute(name)) || 0;
      const shape = { cx: number(circle, "cx"), cy: number(circle, "cy"), r: number(circle, "r") };
      const rect = { x: number(image, "x"), y: number(image, "y"), width: number(image, "width"), height: number(image, "height") };
      const key = `${href.length}:${href.slice(-64)}|${JSON.stringify(shape)}|${JSON.stringify(rect)}`;
      if (!cache.has(key)) cache.set(key, cropToDisc(href, rect, shape).catch(() => null));
      const cropped = await cache.get(key);
      if (!cropped) return;
      const { dataUri, box } = cropped;
      Object.entries({ x: box.x, y: box.y, width: box.width, height: box.height, preserveAspectRatio: "none" })
        .forEach(([name, value]) => image.setAttribute(name, value));
      image.setAttribute("href", dataUri);
      image.setAttributeNS(XLINK_NS, "xlink:href", dataUri);
    }),
  );
}

async function cropToDisc(href, rect, circle) {
  const source = new window.Image();
  source.src = href;
  await source.decode();
  const crop = circularCrop(rect, circle, source.naturalWidth);
  if (!crop) return null;
  const side = Math.max(1, Math.round(crop.size));
  const canvas = document.createElement("canvas");
  canvas.width = side;
  canvas.height = side;
  const context = canvas.getContext("2d");
  context.imageSmoothingEnabled = false; // pixel-art textures: keep pixels sharp
  context.beginPath();
  context.arc(side / 2, side / 2, side / 2, 0, 2 * Math.PI);
  context.clip();
  context.drawImage(source, crop.sx, crop.sy, crop.size, crop.size, 0, 0, side, side);
  return { dataUri: canvas.toDataURL("image/png"), box: crop.box };
}

async function embedImages(clone, embedImage) {
  const cache = new Map(); // href -> Promise<data URI | null>, each distinct image read once
  let embeddedImages = 0;
  let externalImages = 0;

  await Promise.all(
    [...clone.querySelectorAll("image")].map(async (image) => {
      // Images that failed to load on screen are hidden: drop them rather than ship a broken link.
      if (image.style.display === "none") {
        image.remove();
        return;
      }
      const href = image.getAttribute("href") || image.getAttributeNS(XLINK_NS, "href");
      if (!href) return;
      if (href.startsWith("data:")) {
        embeddedImages++;
        return;
      }

      if (!cache.has(href)) cache.set(href, Promise.resolve(embedImage(href)).catch(() => null));
      const dataUri = await cache.get(href);
      const finalHref = dataUri || href;
      if (dataUri) embeddedImages++;
      else externalImages++;
      // Both forms: href is SVG 2, xlink:href is what older viewers/converters understand.
      image.setAttribute("href", finalHref);
      image.setAttributeNS(XLINK_NS, "xlink:href", finalHref);
    }),
  );

  return { embeddedImages, externalImages };
}
