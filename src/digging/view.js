import {html, svg} from "htl";
import {getBaseRadius, getDiggingViewport} from "./model.js";

const imageBase = "https://noita-bartender-images.acidflow.stream/images";
const statusTitles = {digs: "Digs", blocked: "Doesn't dig", path: "Digs", partial: "No immediate hole", unsupported: "Not yet modeled"};
const methodTitles = {acid: "Acid corrosion", cell: "Cell eating", path: "Projectile penetration", laser: "Beam", explosion: "Explosion"};
let nextPlotId = 0;
export const formatNumber = (value) => Number.isFinite(value)
  ? value.toLocaleString("en-US", {maximumFractionDigits: 2}) : "—";

export function materialImage(material) {
  return `${imageBase}/materials/${encodeURIComponent(material.image_local || "no_image_available.png")}`;
}

export function itemImage(item, kind) {
  return kind === "spells"
    ? `${imageBase}/spells/${encodeURIComponent(item.image_local || "no_image_available.png")}`
    : materialImage(item);
}

export function renderDiggingResult(spell, material, result) {
  return html`<div>${renderEffectResult(spell, material, result)}
    ${(result.effects ?? []).filter((effect) => effect.method !== result.method).map((effect) => html`<p class="digging-other-effect">
      <strong>${methodTitles[effect.method]}:</strong> ${effect.radius > 0
        ? `${formatNumber(effect.radius)} px estimated radius. The circle shows this effect only.` : effect.reason}
    </p>`)}
  </div>`;
}

function renderEffectResult(spell, material, result) {
  if (result.status === "empty") return html`<p class="digging-empty" role="status">${result.reason}</p>`;
  if (!result.method) return html`<p class="digging-empty" role="status">${result.reason}</p>`;
  const stat = (label, value, unit = "") => html`<div><dt>${label}</dt><dd>${typeof value === "string" ? value : formatNumber(value)}${Number.isFinite(value) ? unit : ""}</dd></div>`;
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
        ${stat("Depth per cast", result.status === "path" ? "Not quantified" : result.radius, " px")}
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
  return html`<section class="digging-result" aria-live="polite">
    <p>${result.reason}</p>
    <dl class="digging-stats">
      ${stat(result.method === "cell" ? "Cell-eating radius" : "Estimated hole radius", result.radius, " px")}
      ${stat("Maximum radius", getBaseRadius(spell), " px")}
      ${stat("Ray energy", result.method === "explosion" ? spell.rayEnergy : null)}
      ${stat("Material hardness", material.hardness)}
      ${stat("Material durability", material.durability)}
      ${stat("Spell durability limit", result.method === "cell" ? null : spell.maxDuraToDestroy)}
    </dl>
  </section>`;
}

export function renderDiggingPlot(spell, material, result, width, fit) {
  if (!spell || !material) {
    return html`<div class="digging-empty">${result.reason}</div>`;
  }
  const circular = result.circularEffect ?? result;
  const radius = circular.radius;
  const view = getDiggingViewport(radius, width, fit);
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
  const geometryCaption = clipped ? "Radius continues beyond this square. Fit whole radius shows the complete circle."
    : fit ? "Full circle. Minä uses the same zoom." : "Fixed scale: 1 game pixel = 6 screen pixels.";
  const caption = partialCellEating
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
      <title id="${id}-title">${spell.name} in ${material.name}${radius === null ? "" : `: ${formatNumber(radius)} game pixels of ${circular.method === "explosion" ? "estimated explosion" : "digging"} radius`}</title>
      <desc id="${id}-desc">A square of ${material.name}. ${radius > 0 && !partialCellEating ? "The estimated digging area is cut out of the terrain." : radius === 0 ? "No terrain is removed." : "No fixed circular hole is drawn for this effect."} Minä is in the bottom-right corner with a vertical scale bar to the right. ${caption}</desc>
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
          ${screenRadius > 0 && !partialCellEating ? svg`<circle cx="${centerX}" cy="${centerY}" r="${screenRadius}" fill="#000" />` : null}
        </mask>
      </defs>
      <g clip-path="url(#${id}-clip)">
        <g class="digging-terrain" mask="url(#${id}-terrain-mask)">
          <rect width="${view.width}" height="${sceneHeight}" fill="url(#${id}-material)" />
          ${scale >= 3 ? svg`<rect width="${view.width}" height="${sceneHeight}" fill="url(#${id}-pixels)" />` : null}
        </g>
        ${screenRadius > 0 ? svg`<circle cx="${centerX}" cy="${centerY}" r="${screenRadius}"
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
    <span class="digging-status digging-status-${result.status}" role="status">${statusTitles[result.status]}</span>
    </div>
    <figcaption>${caption}</figcaption>
  </figure>`;
}
