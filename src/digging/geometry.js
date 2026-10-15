import {FIXED_SCALE, getDiggingViewport} from "./model.js";

const validPoints = (points) => Array.isArray(points) && points.length > 0
  && points.every((point) => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite));

const explosionContours = new WeakMap();

// Cancel shared row boundaries before tracing contours, so a raster footprint
// has one outside outline rather than a white line around every rendered row.
export function contoursFromRows(rows, field) {
  const byY = new Map(rows.map((row) => [row.y, row[field]]));
  const edges = [], outgoing = new Map();
  const key = (x, y) => `${x},${y}`;
  const add = (x1, y1, x2, y2, direction) => {
    const edge = {start: [x1, y1], end: [x2, y2], direction, used: false};
    edges.push(edge);
    const from = key(x1, y1);
    if (!outgoing.has(from)) outgoing.set(from, []);
    outgoing.get(from).push(edge);
  };
  const exposed = (intervals, neighbors) => {
    const output = [];
    for (const [left, right] of intervals) {
      let x = left;
      for (const [a, b] of neighbors) {
        if (b < x) continue;
        if (a > right) break;
        if (a > x) output.push([x, Math.min(a - 1, right)]);
        x = Math.max(x, b + 1);
        if (x > right) break;
      }
      if (x <= right) output.push([x, right]);
    }
    return output;
  };
  for (const [y, intervals] of byY) {
    for (const [a, b] of intervals) {
      add(a, y + 1, a, y, 3);
      add(b + 1, y, b + 1, y + 1, 1);
    }
    for (const [a, b] of exposed(intervals, byY.get(y - 1) ?? [])) add(a, y, b + 1, y, 0);
    for (const [a, b] of exposed(intervals, byY.get(y + 1) ?? [])) add(b + 1, y + 1, a, y + 1, 2);
  }
  const polygons = [];
  const turnRank = [1, 0, 3, 2]; // Prefer a right turn at diagonally touching cells.
  for (const start of edges) {
    if (start.used) continue;
    const polygon = [start.start];
    let edge = start;
    while (edge && !edge.used) {
      edge.used = true;
      polygon.push(edge.end);
      if (key(...edge.end) === key(...start.start)) break;
      const candidates = (outgoing.get(key(...edge.end)) ?? []).filter((candidate) => !candidate.used);
      candidates.sort((a, b) => turnRank[(a.direction - edge.direction + 4) % 4]
        - turnRank[(b.direction - edge.direction + 4) % 4]);
      edge = candidates[0];
    }
    polygons.push(polygon.map(([x, y]) => [x - 0.5, y - 0.5]));
  }
  return polygons;
}

export function getExplosionGeometry(footprint, width, fit = false) {
  if (footprint?.kind !== "explosion" || !Array.isArray(footprint.rows)) return null;
  let contours = explosionContours.get(footprint);
  if (!contours) {
    contours = {guaranteed: contoursFromRows(footprint.rows, "guaranteed"),
      possible: contoursFromRows(footprint.rows, "possible")};
    explosionContours.set(footprint, contours);
  }
  let radius = 0;
  for (const polygon of contours.possible) for (const [x, y] of polygon) radius = Math.max(radius, Math.abs(x), Math.abs(y));
  const view = getDiggingViewport(radius, width, fit);
  const project = (polygons) => polygons.map((polygon) => polygon.map(([x, y], index) =>
    `${index ? "L" : "M"} ${view.centerX + x * view.scale} ${view.centerY + y * view.scale}`).join(" ") + " Z").join(" ");
  const guaranteedPath = project(contours.guaranteed), possiblePath = project(contours.possible);
  return {...view, guaranteedPath, possiblePath: possiblePath === guaranteedPath ? null : possiblePath};
}

export function getPathGeometry(footprint, width, fit = false) {
  if (footprint?.kind !== "path" || !validPoints(footprint.points)
    || !Number.isFinite(footprint.width) || footprint.width <= 0) return null;
  const view = getDiggingViewport(0, width, false);
  const maxPoints = validPoints(footprint.maxPoints) ? footprint.maxPoints : null;
  const halfWidth = footprint.width / 2;
  const points = [...footprint.points, ...(maxPoints ?? [])];
  let minX = Math.min(...points.map(([x]) => x)) - halfWidth;
  let maxX = Math.max(...points.map(([x]) => x)) + halfWidth;
  let minY = Math.min(...points.map(([, y]) => y)) - halfWidth;
  let maxY = Math.max(...points.map(([, y]) => y)) + halfWidth;
  const impactRadius = Number.isFinite(footprint.impactRadius) && footprint.impactRadius > 0
    ? footprint.impactRadius : 0;
  const endpoint = footprint.points.at(-1);
  if (impactRadius) {
    minX = Math.min(minX, endpoint[0] - impactRadius);
    maxX = Math.max(maxX, endpoint[0] + impactRadius);
    minY = Math.min(minY, endpoint[1] - impactRadius);
    maxY = Math.max(maxY, endpoint[1] + impactRadius);
  }
  const padding = 24;
  const availableWidth = Math.max(1, view.width - padding * 2);
  const availableHeight = Math.max(1, view.sceneHeight - padding * 2);
  const scale = fit ? Math.min(FIXED_SCALE, availableWidth / (maxX - minX), availableHeight / (maxY - minY))
    : FIXED_SCALE;
  const clippedX = (maxX - minX) * scale > availableWidth;
  const clippedY = (maxY - minY) * scale > availableHeight;
  // Keep the beginning of a long horizontal tunnel visible at fixed scale.
  // Fit centers the complete swept shape, including its possible extension.
  const x = clippedX && !fit ? padding - minX * scale : (view.width - (minX + maxX) * scale) / 2;
  const y = clippedY && !fit ? padding - minY * scale : (view.sceneHeight - (minY + maxY) * scale) / 2;
  const project = ([px, py]) => [x + px * scale, y + py * scale];
  const pathData = (path) => {
    const projected = path.map(project);
    if (projected.length === 1) projected.push(projected[0]);
    return projected.map(([px, py], index) => `${index ? "L" : "M"} ${px} ${py}`).join(" ");
  };
  const targetUnits = Math.min(120, view.width / 3) / scale;
  const magnitude = 10 ** Math.floor(Math.log10(targetUnits));
  const scaleUnits = [1, 2, 5, 10].filter((value) => value * magnitude <= targetUnits).at(-1) * magnitude;
  const [impactX, impactY] = project(endpoint);
  return {
    ...view, scale, scaleUnits, clipped: !fit && (clippedX || clippedY),
    mina: {
      width: 8 * scale, height: 18 * scale,
      x: Math.max(8, view.width - 32 - 8 * scale),
      y: Math.max(8, view.sceneHeight - 12 - 18 * scale),
    },
    path: pathData(footprint.points), maxPath: maxPoints ? pathData(maxPoints) : null,
    pathWidth: footprint.width * scale,
    impact: impactRadius ? {x: impactX, y: impactY, radius: impactRadius * scale} : null,
    bounds: {left: x + minX * scale, right: x + maxX * scale,
      top: y + minY * scale, bottom: y + maxY * scale},
  };
}
