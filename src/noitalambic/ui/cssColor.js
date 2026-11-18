// ============================================================================
// CSS COLOR - Normalizes any CSS color to plain sRGB for standalone files
// ============================================================================
// Computed styles keep the authored color space: the theme's oklch(...) / color-mix(...) colors
// come back as-is. Many SVG renderers (Inkscape, image viewers, converters) don't understand
// them and fall back to black. Painting the color on a 1x1 canvas and reading the pixel back
// turns any syntax the browser understands into sRGB bytes.

let context;
const cache = new Map();

function canvasContext() {
  if (context !== undefined) return context;
  try {
    context = document.createElement("canvas").getContext("2d", { willReadFrequently: true }) ?? null;
  } catch {
    context = null; // jsdom without the canvas package
  }
  if (context) {
    context.canvas.width = 1;
    context.canvas.height = 1;
  }
  return context;
}

const RGB_PATTERN = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i;

// {r, g, b, a} with r/g/b in 0-255 and a in 0-1, or null if the color can't be resolved.
export function parseColor(color) {
  if (!color) return null;
  if (cache.has(color)) return cache.get(color);

  let result = null;
  const match = RGB_PATTERN.exec(color.trim());
  if (match) {
    const alpha = match[4] === undefined ? 1 : match[4].endsWith("%") ? parseFloat(match[4]) / 100 : Number(match[4]);
    result = { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]), a: alpha };
  } else if (color === "transparent") {
    result = { r: 0, g: 0, b: 0, a: 0 };
  } else {
    const ctx = canvasContext();
    if (ctx) {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "#000"; // reset: an invalid color leaves the previous fillStyle in place
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      result = { r, g, b, a: a / 255 };
    }
  }
  cache.set(color, result);
  return result;
}

export function formatColor({ r, g, b, a = 1 }) {
  const [R, G, B] = [r, g, b].map((v) => Math.round(v));
  return a >= 1 ? `rgb(${R}, ${G}, ${B})` : `rgba(${R}, ${G}, ${B}, ${Math.round(a * 1000) / 1000})`;
}

// sRGB form of a CSS color, or the original string when it can't be resolved.
export function toSrgb(color) {
  const parsed = parseColor(color);
  return parsed ? formatColor(parsed) : color;
}

// "over" alpha compositing of top onto an opaque bottom color.
export function composite(top, bottom) {
  const a = top.a;
  return { r: top.r * a + bottom.r * (1 - a), g: top.g * a + bottom.g * (1 - a), b: top.b * a + bottom.b * (1 - a), a: 1 };
}
