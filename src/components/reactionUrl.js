const plainId = (id) => typeof id === "string" && /^[A-Za-z0-9_-]+$/.test(id);
export const MAX_REACTION_REAGENTS = 3;

export function readReactionReagents(href) {
  // Accept previously shared comma-separated links as well as repeated keys.
  return [...new Set(new URL(href).searchParams.getAll("reagents")
    .flatMap((value) => value.split(",")).filter(plainId))].slice(0, MAX_REACTION_REAGENTS);
}

export function reactionUrl(href, state) {
  const location = new URL(href);
  const base = `${location.origin}${location.pathname}`;
  if (!/^https?:\/\/[A-Za-z0-9.-]+(?::\d+)?\/[A-Za-z0-9_./-]*$/.test(base)) throw new TypeError("A plain page address is required.");
  const ids = [...new Set(state.selectedReagents ?? [])];
  if (ids.length > MAX_REACTION_REAGENTS) throw new RangeError("Select at most three reagents.");
  const parameters = [];
  const add = (key, value) => {
    if (!plainId(value)) throw new TypeError("Share links require plain material and source IDs.");
    parameters.push(`${key}=${value}`);
  };
  ids.forEach((id) => add("reagents", id));
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
