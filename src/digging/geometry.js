import {FIXED_SCALE, getDiggingViewport} from "./model.js";

const validPoints = (points) => Array.isArray(points) && points.length > 0
  && points.every((point) => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite));

export function getExplosionGeometry(footprint, width, fit = false, sharedScale) {
  if (footprint?.kind !== "explosion" || !Number.isFinite(footprint.radius) || footprint.radius < 0) return null;
  return getDiggingViewport(footprint.radius, width, fit, sharedScale);
}

export function getPathGeometry(footprint, width, fit = false, sharedScale) {
  if (footprint?.kind !== "path" || !validPoints(footprint.points)
    || !Number.isFinite(footprint.width) || footprint.width <= 0) return null;
  const view = getDiggingViewport(0, width, false);
  // Draw one representative cast; speed/lifetime bounds belong in the stats.
  const points = validPoints(footprint.previewPoints) ? footprint.previewPoints : footprint.points;
  const halfWidth = footprint.width / 2;
  let minX = Math.min(...points.map(([x]) => x)) - halfWidth;
  let maxX = Math.max(...points.map(([x]) => x)) + halfWidth;
  let minY = Math.min(...points.map(([, y]) => y)) - halfWidth;
  let maxY = Math.max(...points.map(([, y]) => y)) + halfWidth;
  const impactRadius = Number.isFinite(footprint.impactRadius) && footprint.impactRadius > 0
    ? footprint.impactRadius : 0;
  const endpoint = points.at(-1);
  if (impactRadius) {
    minX = Math.min(minX, endpoint[0] - impactRadius);
    maxX = Math.max(maxX, endpoint[0] + impactRadius);
    minY = Math.min(minY, endpoint[1] - impactRadius);
    maxY = Math.max(maxY, endpoint[1] + impactRadius);
  }
  const padding = 24, gap = 16, minaX = view.mina.x;
  const leftExtent = -Math.min(0, minX);
  const availableWidth = Math.max(1, view.width - padding - minaX - gap);
  const availableHalfHeight = Math.max(1, view.sceneHeight / 2 - padding);
  const scale = Number.isFinite(sharedScale) && sharedScale > 0 ? Math.min(FIXED_SCALE, sharedScale)
    : fit ? Math.min(FIXED_SCALE, availableWidth / (8 + leftExtent + maxX),
    availableHalfHeight / Math.max(Math.abs(minY), Math.abs(maxY))) : FIXED_SCALE;
  // Keep Minä and the cast origin on the same horizontal line. Reserve room
  // for the sprite instead of centering the tunnel independently of it.
  const x = minaX + gap + (8 + leftExtent) * scale;
  const y = view.sceneHeight / 2;
  const project = ([px, py]) => [x + px * scale, y + py * scale];
  const projected = points.map(project);
  if (projected.length === 1) projected.push(projected[0]);
  const path = projected.map(([px, py], index) => (index ? "L " : "M ") + px + " " + py).join(" ");
  const targetUnits = Math.min(120, view.width / 3) / scale;
  const magnitude = 10 ** Math.floor(Math.log10(targetUnits));
  const scaleUnits = [1, 2, 5, 10].filter((value) => value * magnitude <= targetUnits).at(-1) * magnitude;
  const [impactX, impactY] = project(endpoint);
  const bounds = {left: x + minX * scale, right: x + maxX * scale,
    top: y + minY * scale, bottom: y + maxY * scale};
  return {...view, scale, scaleUnits,
    clipped: !fit && (bounds.right > view.width - padding || bounds.top < padding || bounds.bottom > view.sceneHeight - padding),
    mina: {width: 8 * scale, height: 18 * scale, x: minaX, y: (view.sceneHeight - 18 * scale) / 2},
    path, pathWidth: footprint.width * scale,
    impact: impactRadius ? {x: impactX, y: impactY, radius: impactRadius * scale} : null,
    bounds};
}

// One scene, one scale and one reference sprite. Each spell gets a band of
// the same terrain so its cutout cannot cover another spell's result.
export function getComparisonLayout(entries, width, fit = false) {
  const view = getDiggingViewport(0, width);
  const left = Math.min(100, view.width * 0.42);
  const availableWidth = Math.max(1, view.width - left - 12);
  const rowHeight = (view.height - 24) / Math.max(1, entries.length);
  const fullLabels = rowHeight >= 48;
  const labelHeight = fullLabels ? 20 : 0;
  const gap = Math.min(4, rowHeight / 4);
  const availableHeight = Math.max(Number.EPSILON, rowHeight - labelHeight - 2 * gap);
  const shapes = entries.map((entry) => {
    const {result} = entry;
    const footprint = result.footprint;
    const circular = result.circularEffect ?? result;
    const reachOnly = !!(result.reachOnly || circular.reachOnly || result.method === "conversion");
    if (footprint?.kind === "path" && validPoints(footprint.points) && footprint.width > 0) {
      const points = validPoints(footprint.previewPoints) ? footprint.previewPoints : footprint.points;
      const half = footprint.width / 2;
      let minX = Math.min(...points.map(([x]) => x)) - half;
      let maxX = Math.max(...points.map(([x]) => x)) + half;
      let minY = Math.min(...points.map(([, y]) => y)) - half;
      let maxY = Math.max(...points.map(([, y]) => y)) + half;
      const impactRadius = Number.isFinite(footprint.impactRadius) && footprint.impactRadius > 0 ? footprint.impactRadius : 0;
      const endpoint = points.at(-1);
      if (impactRadius) {
        minX = Math.min(minX, endpoint[0] - impactRadius);
        maxX = Math.max(maxX, endpoint[0] + impactRadius);
        minY = Math.min(minY, endpoint[1] - impactRadius);
        maxY = Math.max(maxY, endpoint[1] + impactRadius);
      }
      // Keep a rightward cast's origin on the row's centerline while leaving
      // equal space above/below for gravity and any endpoint explosion.
      const verticalExtent = Math.max(Math.abs(minY), Math.abs(maxY));
      minY = -verticalExtent;
      maxY = verticalExtent;
      const partialRemoval = footprint.probabilistic && footprint.removalProbability > 0 && !footprint.partial;
      return {...entry, kind: "path", points, minX, maxX, minY, maxY, impactRadius, reachOnly,
        partialRemoval, removes: !reachOnly && ["digs", "path"].includes(result.status)
          && (!footprint.outlineOnly && !footprint.probabilistic || partialRemoval)};
    }
    const radius = Number.isFinite(circular.radius) && circular.radius > 0 ? circular.radius : 0;
    return {...entry, kind: result.method === "conversion" && result.conversion?.shape === "square" ? "square" : "circle",
      radius, minX: -radius, maxX: radius, minY: -radius, maxY: radius, reachOnly,
      removes: !reachOnly && radius > 0 && circular.status === "digs"
        && !(circular.method === "cell" && entry.spell.cellEaterEatProbability < 100)};
  });
  const scale = fit ? Math.min(FIXED_SCALE, ...shapes.map((shape) => Math.min(
    availableWidth / Math.max(1, shape.maxX - shape.minX),
    availableHeight / Math.max(1, shape.maxY - shape.minY)))) : FIXED_SCALE;
  const lanes = shapes.map((shape, index) => {
    const top = 12 + index * rowHeight - labelHeight / 2;
    const clip = {x: left, y: top + labelHeight + gap, width: availableWidth, height: availableHeight};
    const centerY = clip.y + clip.height / 2;
    const shapeWidth = (shape.maxX - shape.minX) * scale;
    const shapeHeight = (shape.maxY - shape.minY) * scale;
    const clipped = shapeWidth > availableWidth + 1e-8 || shapeHeight > availableHeight + 1e-8;
    const x = shape.kind !== "path" && clipped
      ? left + availableWidth * 0.65 - shape.radius * scale : left - shape.minX * scale;
    const y = centerY - (shape.minY + shape.maxY) * scale / 2;
    const projected = shape.points?.map(([px, py]) => [x + px * scale, y + py * scale]);
    if (projected?.length === 1) projected.push(projected[0]);
    const path = projected?.map(([px, py], i) => `${i ? "L" : "M"} ${px} ${py}`).join(" ");
    const endpoint = projected?.at(-1);
    return {...shape, index, clip, clipped, centerX: x, centerY: y,
      screenRadius: (shape.radius ?? 0) * scale, path, pathWidth: (shape.result.footprint?.width ?? 0) * scale,
      impact: shape.impactRadius ? {x: endpoint[0], y: endpoint[1], radius: shape.impactRadius * scale} : null,
      labelX: fullLabels ? left : left - 8,
      labelY: fullLabels ? top + 14 : centerY + 4,
      bounds: {left: x + shape.minX * scale, right: x + shape.maxX * scale,
        top: y + shape.minY * scale, bottom: y + shape.maxY * scale}};
  });
  const targetUnits = Math.min(100, view.height / 2) / scale;
  const magnitude = 10 ** Math.floor(Math.log10(targetUnits));
  const scaleUnits = [1, 2, 5, 10].filter((n) => n * magnitude <= targetUnits).at(-1) * magnitude;
  return {...view, scale, scaleUnits, fullLabels, lanes, clipped: lanes.some((lane) => lane.clipped),
    mina: {...view.mina, width: 8 * scale, height: 18 * scale, y: (view.height - 18 * scale) / 2}};
}
