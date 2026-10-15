import {evaluateDigging, getDiggingViewport, FIXED_SCALE} from "./model.js";
import {getPathGeometry, getExplosionGeometry} from "./geometry.js";
import {applyDiggingModifiers} from "./modifiers.js";

// Match the bright colors already used by the site's material/reaction plots.
export const COMPARISON_COLORS = ["#45b7d1", "#ff6b6b", "#ffa500", "#24c93a", "#a78bfa", "#f472b6"];

export function evaluateComparison(spells, material, options = {}) {
  if (!material) return [];
  return [...new Map(spells.map((spell) => [spell.id, spell])).values()].map((source, index) => {
    const spell = applyDiggingModifiers(source, options);
    return {spell, result: evaluateDigging(spell, material), color: COMPARISON_COLORS[index]
      ?? `hsl(${(index * 137.508) % 360} 70% 65%)`};
  });
}

export function getComparisonScale(entries, width, fit) {
  if (!fit) return FIXED_SCALE;
  return Math.min(FIXED_SCALE, ...entries.map(({result}, index) => {
    const plotWidth = Array.isArray(width) ? width[index] : width;
    const circular = result.circularEffect ?? result;
    return (getPathGeometry(result.footprint, plotWidth, true)
      ?? getExplosionGeometry(result.footprint, plotWidth, true)
      ?? getDiggingViewport(circular.radius, plotWidth, true)).scale;
  }));
}

export function getComparisonLayout(entries, width, fit = false) {
  width = Number.isFinite(width) && width > 0 ? width : 640;
  const columns = entries.length > 1 && width >= 720 ? 2 : 1;
  const plots = entries.map((entry, index) => {
    const fullWidth = columns === 1 || entries.length % columns !== 0 && index === entries.length - 1;
    return {...entry, fullWidth,
      width: Math.max(120, (fullWidth ? width : (width - 16) / 2) - 34)};
  });
  return {columns, plots, scale: getComparisonScale(entries, plots.map((plot) => plot.width), fit)};
}
