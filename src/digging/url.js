export const DIGGING_DEFAULTS = Object.freeze({spell: "DIGGER", material: "soil", fit: false});

export function readDiggingParams(href, spells, materials) {
  const params = new URL(href).searchParams;
  const spell = params.get("spell");
  const material = params.get("material");
  return {
    spell: spells.some((item) => item.id === spell) ? spell : DIGGING_DEFAULTS.spell,
    material: materials.some((item) => item.id === material) ? material : DIGGING_DEFAULTS.material,
    fit: ["1", "true"].includes(params.get("fit")),
  };
}

export function diggingUrl(href, {spell, material, fit}) {
  const url = new URL(href);
  for (const key of Object.keys(DIGGING_DEFAULTS)) url.searchParams.delete(key);
  for (const [key, value] of Object.entries({spell, material})) {
    if (value && value !== DIGGING_DEFAULTS[key]) url.searchParams.set(key, value);
  }
  if (fit) url.searchParams.set("fit", "1");
  return url.href;
}
