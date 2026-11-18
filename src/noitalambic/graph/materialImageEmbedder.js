// ============================================================================
// MATERIAL IMAGE EMBEDDER - Turns graph image URLs into data: URIs for the SVG export
// ============================================================================
// The graph shows material textures from the image CDN, which sends no CORS headers: the page
// can display them but not read their bytes. A mirror of those PNGs ships with the app
// (src/data/images/materials-cdn, refreshed with `npm run images:sync`), so they are loaded from
// the app's own origin instead. The glob is lazy: nothing is fetched (or
// even resolved) until an export asks for a given file. This module is itself only imported when
// the user exports, and relies on Vite's import.meta.glob.

const localImages = import.meta.glob("../../data/images/materials-cdn/*.png", { query: "?url", import: "default" });
const localByFileName = new Map(Object.entries(localImages).map(([path, load]) => [path.split("/").pop(), load]));

const fileNameOf = (href) => decodeURIComponent(new URL(href, document.baseURI).pathname.split("/").pop());

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function fetchAsDataUrl(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return await blobToDataUrl(await response.blob());
  } catch {
    return null; // network error or CORS refusal
  }
}

// Returns a data: URI for the image, or null when it can't be read (not bundled and the remote
// host refuses cross-origin reads).
export async function embedMaterialImage(href) {
  const load = localByFileName.get(fileNameOf(href));
  if (load) {
    const localUrl = await load();
    const embedded = await fetchAsDataUrl(localUrl);
    if (embedded) return embedded;
  }
  return fetchAsDataUrl(href);
}
