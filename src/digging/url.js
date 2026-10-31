export const DIGGING_DEFAULTS = Object.freeze({spells: Object.freeze([]), material: null, fit: false, glassCannon: 0, berserkium: false});
export const MAX_DIGGING_SPELLS = 5;
export const MAX_DIGGING_URL_LENGTH = 499;

const plainId = (id) => typeof id === "string" && /^[A-Za-z0-9_-]+$/.test(id);

function baseUrl(href) {
  const url = new URL(href);
  // Share only this page and its comparison state. Tracking parameters and
  // fragments can contain commas, encoded text, or arbitrary extra length.
  const base = `${url.origin}${url.pathname}`;
  if (!/^https?:\/\/[A-Za-z0-9.-]+(?::\d+)?\/[A-Za-z0-9_./-]*$/.test(base)) {
    throw new TypeError("This page address cannot form a plain-text share URL.");
  }
  return base;
}

function formatUrl(base, {spells = [], material, fit, glassCannon = 0, berserkium = false}) {
  const ids = [...new Set(spells)];
  if (ids.some((id) => !plainId(id)) || material != null && !plainId(material)) {
    throw new TypeError("Share URLs require plain spell and material IDs.");
  }
  const parameters = ids.map((id) => `spell=${id}`);
  if (material) parameters.push(`material=${material}`);
  if (fit) parameters.push("fit=1");
  if ([1, 2].includes(glassCannon)) parameters.push(`glassCannon=${glassCannon}`);
  if (berserkium) parameters.push("berserkium=1");
  return base + (parameters.length ? `?${parameters.join("&")}` : "");
}

export function getDiggingSpellLimit(href, spells, materials) {
  const base = baseUrl(href);
  const longestSpells = [...new Set(spells.map((spell) => spell.id))].sort((a, b) => b.length - a.length);
  const longestMaterial = materials.reduce((longest, material) => material.id.length > (longest?.length ?? 0) ? material.id : longest, null);
  // Reserve space for the longest material and every optional flag, so
  // changing those controls cannot make a permitted selection too long.
  for (let count = Math.min(MAX_DIGGING_SPELLS, longestSpells.length); count > 0; count--) {
    const worst = formatUrl(base, {spells: longestSpells.slice(0, count), material: longestMaterial,
      fit: true, glassCannon: 2, berserkium: true});
    if (worst.length <= MAX_DIGGING_URL_LENGTH) return count;
  }
  return 0;
}

export function readDiggingParams(href, spells, materials) {
  const params = new URL(href).searchParams;
  const spellIds = new Set(spells.map((spell) => spell.id));
  const material = params.get("material");
  return {
    spells: [...new Set(params.getAll("spell").filter((id) => spellIds.has(id)))].slice(0, getDiggingSpellLimit(href, spells, materials)),
    material: materials.some((item) => item.id === material) ? material : DIGGING_DEFAULTS.material,
    fit: ["1", "true"].includes(params.get("fit")),
    glassCannon: ["1", "2"].includes(params.get("glassCannon")) ? Number(params.get("glassCannon")) : 0,
    berserkium: ["1", "true"].includes(params.get("berserkium")),
  };
}

export function readInitialDiggingParams(href, spells, materials) {
  const url = new URL(href);
  if (url.searchParams.size === 0) url.search = 'spell=BOMB&material=rock_static';
  return readDiggingParams(url.href, spells, materials);
}

export function diggingUrl(href, selection) {
  if (new Set(selection.spells ?? []).size > MAX_DIGGING_SPELLS) throw new RangeError("Too many spells for a share URL.");
  const url = formatUrl(baseUrl(href), selection);
  // The input limit prevents this for allowed UI selections. Keep a final
  // invariant here so another caller can never emit an oversized link.
  if (url.length > MAX_DIGGING_URL_LENGTH) throw new RangeError("Share URLs must be shorter than 500 characters.");
  return url;
}
