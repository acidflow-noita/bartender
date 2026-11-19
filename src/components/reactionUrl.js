const plainId = (id) => typeof id === "string" && /^[A-Za-z0-9_-]+$/.test(id);
export const MAX_REACTION_REAGENTS = 3;

export function readReactionReagents(href) {
  // Accept previously shared comma-separated links as well as repeated keys.
  return [...new Set(new URL(href).searchParams.getAll("reagents")
    .flatMap((value) => value.split(",")).filter(plainId))].slice(0, MAX_REACTION_REAGENTS);
}

export function recipePathId(path) {
  const match = /^\/reactions\/([1-9]\d*)(?:\.html|\/)?$/.exec(path);
  const id = match && Number(match[1]);
  return Number.isSafeInteger(id) ? id : null;
}

export function readReactionState(href, byNumber, unused) {
  const url = new URL(href), params = url.searchParams;
  const id = recipePathId(url.pathname) ?? Number(params.get("reaction")), rule = Number.isSafeInteger(id) && id > 0 ? byNumber.get(id) : null;
  const product = params.get("product");
  const state = {
    selectedReaction: rule ? id : null,
    selectedReagents: readReactionReagents(href),
    selectedProduct: plainId(product) ? product : "",
    excludeSpecialMaterials: params.get("excludeSpecial") !== "false",
    onlyPracticalReactions: params.get("onlyPractical") !== "false",
    excludeUnusedMaterials: params.get("excludeUnused") !== "false",
  };
  if (rule) {
    const inputs = [rule.input_cell1, rule.input_cell2, rule.input_cell3];
    const outputs = [rule.output_cell1, rule.output_cell2, rule.output_cell3];
    state.selectedReagents = state.selectedReagents.filter(material => inputs.includes(material));
    if (!outputs.includes(state.selectedProduct)) state.selectedProduct = "";
    const materials = [...inputs, ...outputs];
    if (materials.some(material => unused.has(material))) state.excludeUnusedMaterials = false;
    if (materials.some(material => ["mimic_liquid", "midas_precursor", "midas"].includes(material))) state.excludeSpecialMaterials = false;
    if (rule.reaction_rate <= 5) state.onlyPracticalReactions = false;
  }
  return state;
}

export function defaultPreview(rows) {
  return rows.slice(0, 8).find(row => row.input_cell2 !== 'air' && !row.entity_file) ?? rows[0] ?? null;
}

export function reactionUrl(href, state) {
  const location = new URL(href);
  const isFinder = recipePathId(location.pathname) || /^\/reactions(?:\.html|\/)?$/.test(location.pathname);
  const selected = Number.isSafeInteger(state.selectedReaction) && state.selectedReaction > 0;
  const path = isFinder ? (selected ? "/reactions/" + state.selectedReaction : "/reactions") : location.pathname;
  const base = `${location.origin}${path}`;
  if (!/^https?:\/\/[A-Za-z0-9.-]+(?::\d+)?\/[A-Za-z0-9_./-]*$/.test(base)) throw new TypeError("A plain page address is required.");
  const ids = [...new Set(state.selectedReagents ?? [])];
  if (ids.length > MAX_REACTION_REAGENTS) throw new RangeError("Select at most three reagents.");
  const parameters = [];
  const add = (key, value) => {
    if (!plainId(value)) throw new TypeError("Share links require plain material and source IDs.");
    parameters.push(`${key}=${value}`);
  };
  ids.forEach((id) => add("reagents", id));
  if (!isFinder && selected) add("reaction", String(state.selectedReaction));
  if (state.selectedProduct) add("product", state.selectedProduct);
  if (Number.isSafeInteger(state.minReactionSpeed) && state.minReactionSpeed > 0) add("minSpeed", String(state.minReactionSpeed));
  if (state.reactionSource && state.reactionSource !== "base") add("source", state.reactionSource);
  for (const [field, parameter] of [["excludeSpecialMaterials", "excludeSpecial"], ["onlyPracticalReactions", "onlyPractical"], ["excludeUnusedMaterials", "excludeUnused"]]) {
    if (state[field] === false) parameters.push(`${parameter}=false`);
  }
  const url = base + (parameters.length ? `?${parameters.join("&")}` : "");
  if (url.length >= 500) throw new RangeError("Share URLs must be shorter than 500 characters.");
  return url;
}
