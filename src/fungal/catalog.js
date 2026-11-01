export function materialName(id) {
  return id.replace(/^\$(?:mat|material)_/, "").replace(/^apotheosis_/, "")
    .replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Resolve CellDataChild inheritance against the site's existing vanilla metadata.
export function apotheosisMaterials(base, documents) {
  const vanilla = new Map(base.map((m) => [m.id, m]));
  const definitions = new Map();
  for (const {data, secret} of documents) {
    for (const key of ["CellData", "CellDataChild"]) {
      const rows = data.Materials?.[key] ?? [];
      for (const row of Array.isArray(rows) ? rows : [rows]) {
        if (row.name) definitions.set(row.name, {...row, secret});
      }
    }
  }
  const resolved = new Map();
  function resolve(id, visiting = new Set()) {
    if (resolved.has(id)) return resolved.get(id);
    const raw = definitions.get(id);
    if (!raw || visiting.has(id)) return vanilla.get(id) ?? {};
    const parent = raw._parent === id ? vanilla.get(id) : resolve(raw._parent, new Set([...visiting, id]));
    const inherited = {...parent, ...raw};
    const cell = raw.cell_type ?? parent?.cell_type ?? parent?.original_cell_type;
    const sand = raw.liquid_sand ?? parent?.liquid_sand;
    const type = cell === "liquid" ? ([true, 1, "1"].includes(sand) ? "Powder" : "Liquid")
      : ({solid: "Solid", gas: "Gas", fire: "Fire"}[cell] ?? parent?.type ?? "N/A");
    const uiId = raw.ui_name?.replace(/^\$(?:mat|material)_/, "");
    const material = {
      ...inherited,
      id, name: vanilla.get(uiId)?.name ?? vanilla.get(id)?.name ?? materialName(raw.ui_name || id),
      type, source: "apotheosis", secret: raw.secret,
      image_local: vanilla.get(id)?.image_local || `Material_${id}.png`,
    };
    resolved.set(id, material);
    return material;
  }
  return [...definitions.keys()].map((id) => {
    const {name, type, image_local, source, secret} = resolve(id);
    return {id, name, type, image_local, source, secret};
  }).sort((a, b) => a.id.localeCompare(b.id));
}


// Use mode-specific names for the full catalog and any explicitly restored IDs.
export function materialMetadata(base, apotheosis, mode = "vanilla") {
  const map = new Map(base.map((material) => [material.id, material]));
  for (const material of apotheosis) {
    if (mode !== "vanilla" || !map.has(material.id)) map.set(material.id, material);
  }
  return map;
}

export function materialCatalog(base, apotheosis, mode = "vanilla", ids = []) {
  const metadata = materialMetadata(base, apotheosis, mode);
  return [...ids].map((id) => metadata.get(id) ?? {
    id, name: materialName(id), type: id === "air" ? "no type" : "N/A", image_local: "Material_" + id + ".png",
  });
}

// Choices returns a scalar in singleModeForMultiSelect and an array otherwise.
export function selectedMaterial(value) {
  return (Array.isArray(value) ? value[0] : value) || "air";
}
