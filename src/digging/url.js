export const DIGGING_DEFAULTS = Object.freeze({spells: Object.freeze([]), material: null, fit: false, glassCannon: 0, berserkium: false});

export function readDiggingParams(href, spells, materials) {
  const params = new URL(href).searchParams;
  const spellIds = new Set(spells.map((spell) => spell.id));
  const material = params.get("material");
  return {
    spells: [...new Set(params.getAll("spell").filter((id) => spellIds.has(id)))],
    material: materials.some((item) => item.id === material) ? material : DIGGING_DEFAULTS.material,
    fit: ["1", "true"].includes(params.get("fit")),
    glassCannon: ["1", "2"].includes(params.get("glassCannon")) ? Number(params.get("glassCannon")) : 0,
    berserkium: ["1", "true"].includes(params.get("berserkium")),
  };
}

export function diggingUrl(href, {spells = [], material, fit, glassCannon = 0, berserkium = false}) {
  const url = new URL(href);
  for (const key of ["spell", ...Object.keys(DIGGING_DEFAULTS)]) url.searchParams.delete(key);
  for (const id of new Set(spells)) if (typeof id === "string" && id) url.searchParams.append("spell", id);
  if (material) url.searchParams.set("material", material);
  if (fit) url.searchParams.set("fit", "1");
  if ([1, 2].includes(glassCannon)) url.searchParams.set("glassCannon", String(glassCannon));
  if (berserkium) url.searchParams.set("berserkium", "1");
  return url.href;
}
