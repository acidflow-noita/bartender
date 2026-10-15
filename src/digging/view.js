import {html, svg} from "htl";
import {getBaseRadius, getDiggingViewport} from "./model.js";
import {getPathGeometry, getExplosionGeometry} from "./geometry.js";

const imageBase = "https://noita-bartender-images.acidflow.stream/images";
const statusTitles = {digs: "Digs", blocked: "Doesn't dig", path: "Digs", partial: "No immediate hole", unsupported: "Not yet modeled", converts: "Converts material", conditional: "Conditional effect"};
const methodTitles = {acid: "Acid corrosion", cell: "Cell eating", path: "Projectile penetration", laser: "Beam", explosion: "Explosion", conversion: "Material conversion", indirect: "Secondary effect"};
let nextPlotId = 0;
export const formatNumber = (value) => Number.isFinite(value)
  ? value.toLocaleString("en-US", {maximumFractionDigits: 2}) : "—";
const explosionRadiusLabel = (footprint) => `${formatNumber(footprint.radiusMin)}${footprint.radiusMin === footprint.radiusMax ? "" : `–${formatNumber(footprint.radiusMax)}`} px`;

export function materialImage(material) {
  return `${imageBase}/materials/${encodeURIComponent(material.image_local || "no_image_available.png")}`;
}

export function itemImage(item, kind) {
  return kind === "spells"
    ? `${imageBase}/spells/${encodeURIComponent(item.image_local || "no_image_available.png")}`
    : materialImage(item);
}

export function renderDiggingResult(spell, material, result) {
  const footprint = result.footprint?.kind === "path" ? result.footprint : null;
  const explosion = result.footprint?.kind === "explosion" ? result.footprint : null;
  const length = footprint && Number.isFinite(footprint.lengthMin) && Number.isFinite(footprint.lengthMax)
    ? `${formatNumber(footprint.lengthMin)}${footprint.lengthMax === footprint.lengthMin ? "" : `–${formatNumber(footprint.lengthMax)}`} px` : "—";
  return html`<div>${renderEffectResult(spell, material, result)}
    ${footprint ? html`<dl class="digging-stats digging-path-stats">
      <div><dt>Estimated path length</dt><dd>${length}</dd></div>
      <div><dt>Path width</dt><dd>${formatNumber(footprint.width)} px</dd></div>
    </dl>` : null}
    ${explosion && result.method !== "explosion" ? html`<dl class="digging-stats">
      <div><dt>Explosion radius estimate</dt><dd>${formatNumber(explosion.radius)} px</dd></div>
    </dl>` : null}
    ${(result.effects ?? []).filter((effect) => effect.method !== result.method).map((effect) => html`<p class="digging-other-effect">
      <strong>${methodTitles[effect.method]}:</strong> ${effect.radius > 0
        ? `${effect.radiusRange ? explosionRadiusLabel({radiusMin: effect.radiusRange[0], radiusMax: effect.radiusRange[1]}) : `${formatNumber(effect.radius)} px`} ${effect.reachOnly ? "effect reach" : "estimated radius"}. ${effect.reason}` : effect.reason}
    </p>`)}
  </div>`;
}

function renderEffectResult(spell, material, result) {
  if (result.status === "empty") return html`<p class="digging-empty" role="status">${result.reason}</p>`;
  if (!result.method) return html`<p class="digging-empty" role="status">${result.reason}</p>`;
  const stat = (label, value, unit = "") => html`<div><dt>${label}</dt><dd>${typeof value === "string" ? value : formatNumber(value)}${Number.isFinite(value) ? unit : ""}</dd></div>`;
  if (result.method === "conversion") {
    const conversion = result.conversion ?? {};
    return html`<section class="digging-result" aria-live="polite">
      <p>${result.reason}</p>
      <dl class="digging-stats">
        ${stat("Digging method", "Material conversion")}
        ${stat("Converts to", conversion.toMaterial || "Not specified")}
        ${stat(conversion.shape === "square" ? "Square half-width" : "Configured conversion radius", result.radius, " px")}
        ${Number.isFinite(conversion.minRadius) ? stat("Initial conversion radius", conversion.minRadius, " px") : null}
        ${Number.isFinite(conversion.stepsPerFrame) ? stat("Conversion steps per frame", conversion.stepsPerFrame) : null}
      </dl>
    </section>`;
  }
  if (result.method === "indirect") {
    return html`<section class="digging-result" aria-live="polite">
      <p>${result.reason}</p>
      ${result.indirect?.context ? html`<p>${result.indirect.context}</p>` : null}
      <ul class="digging-secondary-effects">${(result.indirect?.children ?? []).map((child) => {
        const count = Number.isFinite(child.countMin) && Number.isFinite(child.countMax)
          ? `${formatNumber(child.countMin)}${child.countMin === child.countMax ? "" : `–${formatNumber(child.countMax)}`} spawned. ` : "";
        const timing = [child.trigger, Number.isFinite(child.afterFrames) ? `After ${formatNumber(child.afterFrames)} frames` : null,
          Number.isFinite(child.updateEveryFrames) ? `Every ${formatNumber(child.updateEveryFrames)} frames` : null].filter(Boolean).join("; ");
        return html`<li><strong>${child.name || "Secondary effect"}</strong>${timing ? ` (${timing})` : ""}: ${count}${child.result?.reason || "Effect not yet modeled."}</li>`;
      })}</ul>
    </section>`;
  }
  if (result.method === "acid") {
    return html`<section class="digging-result" aria-live="polite">
      <p>${result.reason}</p>
      <dl class="digging-stats">
        ${stat("Digging method", "Acid corrosion")}
        ${stat("Digging radius", result.status === "digs" ? "Varies with flow" : result.radius, " px")}
        ${stat("Acid reaction", material.tags?.includes("[corrodible]") ? "Dissolves" : Array.isArray(material.tags) ? "Resists acid" : "Unknown")}
      </dl>
    </section>`;
  }
  if (result.method === "path") {
    const penetration = result.penetration;
    const range = (key, unit = "") => {
      const values = penetration.contacts.map((contact) => contact[key]);
      const finite = values.filter(Number.isFinite);
      if (!finite.length) return "No damage at this speed";
      const min = Math.min(...finite), max = Math.max(...finite);
      return `${formatNumber(min)}${finite.length < values.length ? "–∞" : min === max ? "" : `–${formatNumber(max)}`}${unit}`;
    };
    return html`<section class="digging-result" aria-live="polite">
      <p>${result.reason}</p>
      <dl class="digging-stats">
        ${stat("Digging method", "Projectile penetration")}
        ${result.footprint ? null : stat("Depth per cast", result.status === "path" ? "Not quantified" : result.radius, " px")}
        ${penetration ? html`${stat("Launch-speed range", range("speed", " px/s"))}
          ${stat("Damage to first cell", range("damage", " HP"))}
          ${stat("Identical impacts per cell", range("impacts"))}` : null}
        ${stat("Material hardness", material.hardness)}
        ${stat("Material durability", material.durability)}
        ${stat("Penetration durability limit", Number.isFinite(spell.groundPenetrationMaxDura) && spell.groundPenetrationMaxDura <= 0 ? "No cap" : spell.groundPenetrationMaxDura)}
        ${stat("Penetration coefficient", spell.groundPenetrationCoeff)}
        ${stat("Projectile mass", spell.mass)}
      </dl>
    </section>`;
  }
  if (result.method === "laser") {
    return html`<section class="digging-result" aria-live="polite">
      <p>${result.reason}</p>
      <dl class="digging-stats">
        ${stat("Digging method", "Beam")}
        ${stat("Configured beam radius", spell.laserBeamRadius, " px")}
        ${stat("Maximum beam length", spell.laserMaxLength, " px")}
        ${stat("Cell damage setting", spell.laserCellDamage)}
        ${result.laser ? html`${stat("Damage to first cell", result.laser.damage, " HP")}
          ${stat("Contacts per fresh cell", result.laser.contacts)}` : null}
        ${stat("Beam durability limit", spell.laserMaxDuraToDestroy)}
        ${stat("Material durability", material.durability)}
      </dl>
    </section>`;
  }
  const radiusRange = result.radiusRange;
  return html`<section class="digging-result" aria-live="polite">
    <p>${result.reason}</p>
    <dl class="digging-stats">
      ${stat(radiusRange ? "Hole radius range" : result.method === "cell" ? "Cell-eating radius" : "Estimated hole radius", radiusRange
        ? explosionRadiusLabel({radiusMin: radiusRange[0], radiusMax: radiusRange[1]}) : result.radius, " px")}
      ${stat("Maximum radius", getBaseRadius(spell), " px")}
      ${stat("Ray energy", result.method === "explosion" ? result.explosion?.rayEnergy ?? spell.rayEnergy : null)}
      ${stat("Material hardness", material.hardness)}
      ${stat("Material durability", material.durability)}
      ${stat("Spell durability limit", result.method === "cell" ? null : result.explosion?.maxDurability ?? spell.maxDuraToDestroy)}
    </dl>
  </section>`;
}

export function renderDiggingPlot(spell, material, result, width, fit) {
  if (!spell || !material) {
    return html`<div class="digging-empty">${result.reason}</div>`;
  }
  const circular = result.circularEffect ?? result;
  const radius = circular.radius;
  const reachOnly = result.reachOnly || circular.reachOnly || result.method === "conversion";
  const square = result.method === "conversion" && result.conversion?.shape === "square";
  const path = getPathGeometry(result.footprint, width, fit);
  const explosion = getExplosionGeometry(result.footprint, width, fit);
  const footprint = path ? result.footprint : null;
  const displayStatus = path && (footprint.previewLength ?? footprint.lengthMax) === 0 && result.status === "path" && !result.circularEffect
    ? "partial" : result.status;
  const view = path ?? explosion ?? getDiggingViewport(radius, width, fit);
  const {height, sceneHeight, scale, screenRadius, centerX, centerY, clipped, scaleUnits, mina} = view;
  const scaleX = mina.x - 16;
  const scaleTop = sceneHeight / 2 - scaleUnits * scale / 2;
  const scaleBottom = sceneHeight / 2 + scaleUnits * scale / 2;
  const id = `digging-${++nextPlotId}`;
  // Wiki swatches include transparent piles; take an interior patch for a
  // continuous square of terrain. The dropdown keeps the complete swatch.
  const tileSize = 14 * scale;
  const partialCellEating = circular.method === "cell" && Number.isFinite(spell.cellEaterEatProbability)
    && spell.cellEaterEatProbability < 100;
  const partialRemoval = path && footprint.probabilistic && footprint.removalProbability > 0 && !footprint.partial;
  const removesPath = path && (!footprint.outlineOnly && !footprint.probabilistic || partialRemoval)
    && !reachOnly && ["digs", "path"].includes(result.status);
  // A fixed dither illustrates partial cell eating without pretending to
  // reproduce the game's random seed or clearing the entire probabilistic path.
  const removedPatternCells = partialRemoval ? Array.from({length: 64}, (_, index) => {
    const x = index % 8, y = Math.floor(index / 8);
    let rank = 0;
    for (let bit = 0; bit < 3; bit++) rank += ((((x >> bit) ^ (y >> bit)) & 1) * 2 + ((y >> bit) & 1)) * 4 ** (2 - bit);
    return rank < Math.round(footprint.removalProbability * 64) ? [x, y] : null;
  }).filter(Boolean) : [];
  const geometryCaption = clipped ? "Cropped. Use Fit whole effect to see it all."
    : fit ? "Minä is shown at the same scale." : "1 game pixel = 6 screen pixels.";
  const caption = path
    ? `${footprint.caption || "Example dug path for one cast."}${partialRemoval ? " Speckling illustrates partial cell removal." : ""} ${geometryCaption}`
    : explosion && result.footprint.radius > 0 ? `Circular estimate of the explosion's size in ${material.name}. ${geometryCaption}`
    : result.method === "conversion" ? `${square ? "Square" : "Circular"} conversion area: ${material.name} becomes ${result.conversion?.toMaterial || "another material"}. ${geometryCaption}`
    : reachOnly ? `The outline shows how far the effect reaches. ${geometryCaption}`
    : partialCellEating
    ? `Removal is probabilistic. The outline shows the affected area. ${geometryCaption}`
    : radius > 0 && circular.method !== result.method
    ? `The circle shows the ${formatNumber(radius)} px ${circular.method === "cell" ? "cell-eating footprint" : "estimated explosion radius"} only. ${result.method === "acid" ? "Acid can continue corroding beyond it." : "Penetration depth is not quantified."} ${geometryCaption}`
    : result.radius === null && result.method === "acid" && result.status === "digs"
    ? "Acid corrodes this material over time. There is no fixed circular radius."
    : result.method === "laser" && result.status === "digs" ? "The beam digs along its path. No circular hole or tunnel depth is implied by its width."
    : result.status === "path" ? "Digs along the projectile's path. Depth per cast is not quantified."
    : result.radius === null ? "No circular estimate for this effect. Minä remains visible for scale."
    : result.status === "partial" ? "Terrain is damaged without an immediate hole. Repeated impacts can change the result."
    : result.radius === 0 ? "No digging in this material."
    : circular.method === "explosion" ? `Estimated hole per impact in undamaged, uniform terrain. ${geometryCaption}` : geometryCaption;
  return html`<figure class="digging-figure">
    <div class="digging-scene">
    ${svg`<svg class="digging-svg" viewBox="0 0 ${view.width} ${height}" width="${view.width}" height="${height}"
      role="img" aria-labelledby="${id}-title ${id}-desc">
      <title id="${id}-title">${spell.name} in ${material.name}${path ? `: ${formatNumber(footprint.width)} game pixels of path width` : explosion ? `: ${formatNumber(result.footprint.radius)} game pixels of estimated explosion radius` : radius === null ? "" : `: ${formatNumber(radius)} game pixels of ${square ? "square half-width" : reachOnly ? "effect reach" : "digging radius"}`}</title>
      <desc id="${id}-desc">A block of ${material.name}. ${path ? removesPath ? partialRemoval ? "The speckled cutout illustrates partial terrain removal." : "The dug path is cut out of the terrain." : "The outline shows the path's reach." : reachOnly ? "The outline shows reach and leaves the terrain visible." : radius > 0 && !partialCellEating ? "The estimated digging area is cut out of the terrain." : radius === 0 ? "No terrain is removed." : "No fixed circular hole is drawn for this effect."} Minä faces right at mid-height near the left edge, with the scale bar to her left. ${caption}</desc>
      <defs>
        <pattern id="${id}-material" width="${tileSize}" height="${tileSize}" patternUnits="userSpaceOnUse" viewBox="84 168 84 84">
          <rect width="252" height="252" fill="#34484b" />
          <image href="${materialImage(material)}" width="252" height="252" preserveAspectRatio="none" />
        </pattern>
        <pattern id="${id}-pixels" width="${scale}" height="${scale}" patternUnits="userSpaceOnUse">
          <path d="M ${scale} 0 H 0 V ${scale}" fill="none" stroke="#ffffff" stroke-opacity="0.1" stroke-width="0.5" />
        </pattern>
        ${partialRemoval ? svg`<pattern id="${id}-removal" width="${8 * scale}" height="${8 * scale}" patternUnits="userSpaceOnUse">
          <rect width="${8 * scale}" height="${8 * scale}" fill="#fff" />
          ${removedPatternCells.map(([x, y]) => svg`<rect x="${x * scale}" y="${y * scale}" width="${scale}" height="${scale}" fill="#000" />`)}
        </pattern>` : null}
        <clipPath id="${id}-clip"><rect width="${view.width}" height="${sceneHeight}" /></clipPath>
        <mask id="${id}-terrain-mask" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" x="0" y="0" width="${view.width}" height="${sceneHeight}" style="mask-type: luminance">
          <rect width="${view.width}" height="${sceneHeight}" fill="#fff" />
          ${path ? svg`${removesPath ? svg`<path class="digging-path-cutout" d="${path.path}" fill="none" stroke="${partialRemoval ? `url(#${id}-removal)` : "#000"}" stroke-width="${path.pathWidth}" stroke-linecap="round" stroke-linejoin="round" />` : null}
            ${path.impact && !footprint.outlineOnly && !reachOnly ? svg`<circle class="digging-impact-cutout" cx="${path.impact.x}" cy="${path.impact.y}" r="${path.impact.radius}" fill="#000" />` : null}`
            : screenRadius > 0 && !partialCellEating && !reachOnly ? svg`<circle cx="${centerX}" cy="${centerY}" r="${screenRadius}" fill="#000" />` : null}
        </mask>
        ${path ? svg`<mask id="${id}-path-outline" maskUnits="userSpaceOnUse" x="0" y="0" width="${view.width}" height="${sceneHeight}" mask-type="luminance">
          <rect width="${view.width}" height="${sceneHeight}" fill="#fff" />
          <path d="${path.path}" fill="none" stroke="#000" stroke-width="${path.pathWidth}" stroke-linecap="round" stroke-linejoin="round" />
          ${path.impact ? svg`<circle cx="${path.impact.x}" cy="${path.impact.y}" r="${path.impact.radius}" fill="#000" />` : null}
        </mask>` : null}
      </defs>
      <g clip-path="url(#${id}-clip)">
        <g class="digging-terrain" mask="url(#${id}-terrain-mask)">
          <rect width="${view.width}" height="${sceneHeight}" fill="url(#${id}-material)" />
          ${scale >= 3 ? svg`<rect width="${view.width}" height="${sceneHeight}" fill="url(#${id}-pixels)" />` : null}
        </g>
        ${path ? svg`<g mask="url(#${id}-path-outline)">
          <path class="digging-path-outline" d="${path.path}" fill="none" stroke="#fff"
            stroke-width="${path.pathWidth + 5}" stroke-linecap="round" stroke-linejoin="round" />
          ${path.impact ? svg`<circle class="digging-impact-outline" cx="${path.impact.x}" cy="${path.impact.y}" r="${path.impact.radius}" fill="none" stroke="#fff" stroke-width="5" />` : null}
        </g>` : square && screenRadius > 0 ? svg`<rect class="digging-conversion-outline" x="${centerX - screenRadius}" y="${centerY - screenRadius}"
          width="${screenRadius * 2}" height="${screenRadius * 2}" fill="none" stroke="#fff" stroke-width="2.5" />`
          : screenRadius > 0 ? svg`<circle cx="${centerX}" cy="${centerY}" r="${screenRadius}"
          fill="none" stroke="#fff" stroke-width="2.5" />` : null}
        <image class="digging-mina" href="${imageBase}/mina/mina.png" x="${mina.x}"
          y="${mina.y}" width="${mina.width}" height="${mina.height}" transform="translate(${2 * mina.x + mina.width} 0) scale(-1 1)" />
        <g class="digging-scale" fill="#fff" font-size="12" font-family="system-ui, sans-serif">
          <path d="M ${scaleX - 4} ${scaleTop} h 8 M ${scaleX} ${scaleTop} V ${scaleBottom} M ${scaleX - 4} ${scaleBottom} h 8"
            stroke="#fff" stroke-width="2" fill="none" />
          <text x="8" y="${Math.min(scaleTop, mina.y) - 10}" text-anchor="start">${formatNumber(scaleUnits)} game px</text>
        </g>
        <rect x="0.5" y="0.5" width="${view.width - 1}" height="${sceneHeight - 1}" fill="none" stroke="#91a8ad" />
      </g>
    </svg>`}
    <span class="digging-status digging-status-${displayStatus}" role="status">${statusTitles[displayStatus]}</span>
    </div>
    <figcaption>${caption}</figcaption>
  </figure>`;
}
