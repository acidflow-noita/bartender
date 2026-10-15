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
