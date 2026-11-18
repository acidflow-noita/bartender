// ============================================================================
// RASTERIZE SVG - Renders a standalone SVG string to a PNG/JPEG Blob through a canvas
// ============================================================================
// The SVG is drawn as an <img>: in that mode browsers never fetch external resources, so only
// what is embedded (data: URIs) shows up. That is also why the canvas is never tainted.

export const EXPORT_FORMATS = {
  svg: { label: "SVG", extension: "svg", mime: "image/svg+xml" },
  png: { label: "PNG", extension: "png", mime: "image/png" },
  jpeg: { label: "JPEG", extension: "jpg", mime: "image/jpeg", quality: 0.92 },
};

// Browsers refuse (or silently blank) canvases past these limits; Safari is the strictest.
const MAX_SIDE = 8192;
const MAX_PIXELS = 16_777_216;

// Pixel scale for a width x height graph: `preferred` (2 = crisp on high-DPI screens) unless that
// would exceed the canvas limits.
export function rasterScale(width, height, preferred = 2) {
  return Math.min(preferred, MAX_SIDE / width, MAX_SIDE / height, Math.sqrt(MAX_PIXELS / (width * height)));
}

export async function rasterizeSvg(svgText, { width, height, mime, quality, background = "#ffffff", scale = rasterScale(width, height) }) {
  const url = URL.createObjectURL(new Blob([svgText], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    // JPEG has no alpha: paint a background even if the SVG has none.
    if (background) {
      context.fillStyle = background;
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, mime, quality));
    if (!blob) throw new Error(`The browser could not encode a ${canvas.width}x${canvas.height} ${mime} image`);
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}
