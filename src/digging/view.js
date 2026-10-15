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
      <div><dt>Hole radius range</dt><dd>${explosionRadiusLabel(explosion)}</dd></div>
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
  const radiusRange = result.radiusRange ?? (result.footprint?.kind === "explosion"
    ? [result.footprint.radiusMin, result.footprint.radiusMax] : null);
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
  const displayStatus = path && footprint.lengthMax === 0 && result.status === "path" && !result.circularEffect
    ? "partial" : result.status;
  const view = path ?? explosion ?? getDiggingViewport(radius, width, fit);
  const {height, sceneHeight, scale, screenRadius, centerX, centerY, clipped, scaleUnits, mina} = view;
  const scaleX = mina.x + mina.width + 12;
  const scaleBottom = mina.y + mina.height;
  const scaleTop = scaleBottom - scaleUnits * scale;
  const id = `digging-${++nextPlotId}`;
  // Wiki swatches include transparent piles; take an interior patch for a
  // continuous square of terrain. The dropdown keeps the complete swatch.
  const tileSize = 14 * scale;
  const partialCellEating = circular.method === "cell" && Number.isFinite(spell.cellEaterEatProbability)
    && spell.cellEaterEatProbability < 100;
  const removesPath = path && !footprint.probabilistic && !footprint.outlineOnly && !reachOnly && ["digs", "path"].includes(result.status);
  const geometryCaption = clipped ? `The effect continues beyond this view. Fit whole effect shows the complete ${square ? "square" : "circle"}.`
    : fit ? `Full ${square ? "square" : "circle"}. Minä uses the same zoom.` : "Fixed scale: 1 game pixel = 6 screen pixels.";
  const caption = path
    ? `${footprint.caption || "Modeled digging path."}${footprint.probabilistic ? " The outline shows reach; removal is probabilistic." : ""}${path.maxPath ? " The dashed outline shows the longer possible path." : ""} ${clipped ? "The path continues beyond this view. Fit whole effect shows its full extent." : fit ? "Full path. Minä uses the same zoom." : "Fixed scale: 1 game pixel = 6 screen pixels."}`
    : explosion ? explosion.guaranteedPath || explosion.possiblePath
      ? `One centered explosion in fresh uniform terrain. ${reachOnly ? "Outlines show effect reach." : "The solid outline marks the inner bound of this model."}${explosion.possiblePath ? " The dashed outline marks the possible outer bound." : ""} ${clipped ? "The outline continues beyond this view. Fit whole effect shows its full extent." : fit ? "Full footprint. Minä uses the same zoom." : "Fixed scale: 1 game pixel = 6 screen pixels."}`
      : result.reason || "No fresh terrain is removed by this impact."
    : result.method === "conversion" ? `Outlined ${square ? "square" : "circular"} conversion area. Material changes to ${result.conversion?.toMaterial || "another material"}; the outline shows scan reach. ${geometryCaption}`
    : reachOnly ? `The outline shows effect reach, not a completely excavated hole. ${result.reason || ""} ${geometryCaption}`
    : partialCellEating
    ? `Cell-eating footprint. Removal is probabilistic, so this is not a completely excavated hole. ${geometryCaption}`
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
      <title id="${id}-title">${spell.name} in ${material.name}${path ? `: ${formatNumber(footprint.width)} game pixels of path width` : explosion ? `: ${explosionRadiusLabel(result.footprint)} modeled explosion radius range` : radius === null ? "" : `: ${formatNumber(radius)} game pixels of ${square ? "square half-width" : reachOnly ? "effect reach" : `${circular.method === "explosion" ? "estimated explosion" : "digging"} radius`}`}</title>
      <desc id="${id}-desc">A block of ${material.name}. ${path ? removesPath ? "The modeled swept path is cut out of the terrain." : "The outline shows the path's reach without promising complete excavation." : reachOnly ? "The outline shows reach and leaves the terrain visible." : explosion ? "The model's inner raster bound is cut out of the terrain." : radius > 0 && !partialCellEating ? "The estimated digging area is cut out of the terrain." : radius === 0 ? "No terrain is removed." : "No fixed circular hole is drawn for this effect."} Minä is in the bottom-right corner with a vertical scale bar to the right. ${caption}</desc>
      <defs>
        <pattern id="${id}-material" width="${tileSize}" height="${tileSize}" patternUnits="userSpaceOnUse" viewBox="84 168 84 84">
          <rect width="252" height="252" fill="#34484b" />
          <image href="${materialImage(material)}" width="252" height="252" preserveAspectRatio="none" />
        </pattern>
        <pattern id="${id}-pixels" width="${scale}" height="${scale}" patternUnits="userSpaceOnUse">
          <path d="M ${scale} 0 H 0 V ${scale}" fill="none" stroke="#ffffff" stroke-opacity="0.1" stroke-width="0.5" />
        </pattern>
        <clipPath id="${id}-clip"><rect width="${view.width}" height="${sceneHeight}" /></clipPath>
        <mask id="${id}-terrain-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="${view.width}" height="${sceneHeight}" mask-type="luminance">
          <rect width="${view.width}" height="${sceneHeight}" fill="#fff" />
          ${path ? svg`${removesPath ? svg`<path class="digging-path-cutout" d="${path.path}" fill="none" stroke="#000" stroke-width="${path.pathWidth}" stroke-linecap="round" stroke-linejoin="round" />` : null}
            ${path.impact && !footprint.outlineOnly && !reachOnly ? svg`<circle class="digging-impact-cutout" cx="${path.impact.x}" cy="${path.impact.y}" r="${path.impact.radius}" fill="#000" />` : null}`
            : explosion ? explosion.guaranteedPath && !reachOnly ? svg`<path class="digging-explosion-cutout" d="${explosion.guaranteedPath}" fill="#000" fill-rule="evenodd" />` : null
            : screenRadius > 0 && !partialCellEating && !reachOnly ? svg`<circle cx="${centerX}" cy="${centerY}" r="${screenRadius}" fill="#000" />` : null}
        </mask>
        ${path ? svg`<mask id="${id}-path-outline" maskUnits="userSpaceOnUse" x="0" y="0" width="${view.width}" height="${sceneHeight}" mask-type="luminance">
          <rect width="${view.width}" height="${sceneHeight}" fill="#fff" />
          <path d="${path.path}" fill="none" stroke="#000" stroke-width="${path.pathWidth}" stroke-linecap="round" stroke-linejoin="round" />
          ${path.impact ? svg`<circle cx="${path.impact.x}" cy="${path.impact.y}" r="${path.impact.radius}" fill="#000" />` : null}
        </mask>` : null}
        ${path?.maxPath ? svg`<mask id="${id}-max-outline" maskUnits="userSpaceOnUse" x="0" y="0" width="${view.width}" height="${sceneHeight}" mask-type="luminance">
          <rect width="${view.width}" height="${sceneHeight}" fill="#fff" />
          <path d="${path.maxPath}" fill="none" stroke="#000" stroke-width="${path.pathWidth}" stroke-linecap="round" stroke-linejoin="round" />
          ${path.impact ? svg`<circle cx="${path.impact.x}" cy="${path.impact.y}" r="${path.impact.radius}" fill="#000" />` : null}
        </mask>` : null}
      </defs>
      <g clip-path="url(#${id}-clip)">
        <g class="digging-terrain" mask="url(#${id}-terrain-mask)">
          <rect width="${view.width}" height="${sceneHeight}" fill="url(#${id}-material)" />
          ${scale >= 3 ? svg`<rect width="${view.width}" height="${sceneHeight}" fill="url(#${id}-pixels)" />` : null}
        </g>
        ${path?.maxPath ? svg`<path class="digging-path-extent" d="${path.maxPath}" fill="none" stroke="#fff"
          stroke-width="${path.pathWidth + 5}" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="8 6" mask="url(#${id}-max-outline)" />` : null}
        ${path ? svg`<g mask="url(#${id}-path-outline)">
          <path class="digging-path-outline" d="${path.path}" fill="none" stroke="#fff"
            stroke-width="${path.pathWidth + 5}" stroke-linecap="round" stroke-linejoin="round" />
          ${path.impact ? svg`<circle class="digging-impact-outline" cx="${path.impact.x}" cy="${path.impact.y}" r="${path.impact.radius}" fill="none" stroke="#fff" stroke-width="5" />` : null}
        </g>` : explosion ? svg`${explosion.possiblePath ? svg`<path class="digging-explosion-extent" d="${explosion.possiblePath}" fill="none" stroke="#fff" stroke-width="2.5" stroke-dasharray="8 6" />` : null}
          ${explosion.guaranteedPath ? svg`<path class="digging-explosion-outline" d="${explosion.guaranteedPath}" fill="none" stroke="#fff" stroke-width="2.5" />` : null}`
          : square && screenRadius > 0 ? svg`<rect class="digging-conversion-outline" x="${centerX - screenRadius}" y="${centerY - screenRadius}"
          width="${screenRadius * 2}" height="${screenRadius * 2}" fill="none" stroke="#fff" stroke-width="2.5" />`
          : screenRadius > 0 ? svg`<circle cx="${centerX}" cy="${centerY}" r="${screenRadius}"
          fill="none" stroke="#fff" stroke-width="2.5" />` : null}
        <image class="digging-mina" href="${imageBase}/mina/mina.png" x="${mina.x}"
          y="${mina.y}" width="${mina.width}" height="${mina.height}" />
        <g class="digging-scale" fill="#fff" font-size="12" font-family="system-ui, sans-serif">
          <path d="M ${scaleX - 4} ${scaleTop} h 8 M ${scaleX} ${scaleTop} V ${scaleBottom} M ${scaleX - 4} ${scaleBottom} h 8"
            stroke="#fff" stroke-width="2" fill="none" />
          <text x="${scaleX + 4}" y="${Math.min(scaleTop, mina.y) - 8}" text-anchor="end">${formatNumber(scaleUnits)} game px</text>
        </g>
        <rect x="0.5" y="0.5" width="${view.width - 1}" height="${sceneHeight - 1}" fill="none" stroke="#91a8ad" />
      </g>
    </svg>`}
    <span class="digging-status digging-status-${displayStatus}" role="status">${statusTitles[displayStatus]}</span>
    </div>
    <figcaption>${caption}</figcaption>
  </figure>`;
}
