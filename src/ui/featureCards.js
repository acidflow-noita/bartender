import { html } from "htl";

const cards = [
  {
    href: "/reactions",
    title: "Reactions Finder",
    description: "Choose ingredients or a product",
    images: [
      new URL("../data/images/materials/Materialpotion_water.png", import.meta.url),
      new URL("../data/images/materials/Materialpotion_magic_liquid_protection_all.png", import.meta.url),
      new URL("../data/images/materials/Materialpotion_blood.png", import.meta.url),
    ],
  },
  {
    href: "/materials",
    title: "Material Properties",
    description: "Every property of every material",
    images: [
      new URL("../data/images/materials/Material_water.png", import.meta.url),
      new URL("../data/images/materials/Material_gold.png", import.meta.url),
      new URL("../data/images/materials/Material_lava.png", import.meta.url),
    ],
  },
  {
    href: "/digging",
    title: "Digging",
    description: "How well spells dig",
    images: [
      new URL("../data/images/spells/Spell_digger.png", import.meta.url),
      new URL("../data/images/spells/Spell_black_hole.png", import.meta.url),
      new URL("../data/images/spells/Spell_luminous_drill.png", import.meta.url),
    ],
  },
  // Ignore transparent padding when spacing the visible artwork. These ratios
  // come from the original PNG alpha bounds and scale with the image size.
  {
    href: "/fungal_shifting",
    title: "Fungal Shift Planner",
    description: "Advanced shifting calculator",
    bottomPadding: [0, 5 / 60, 2 / 16],
    sidePadding: [
      [0, 0],
      [5 / 60, 5 / 60],
      [3 / 16, 3 / 16],
    ],
    images: [
      new URL("../data/images/materials/Material_fungi.png", import.meta.url),
      new URL("../data/images/status_effects/Effect_trip.png", import.meta.url),
      new URL("../data/images/materials/Materialpotion_fungi.png", import.meta.url),
    ],
  },
];

export function featureCards() {
  return html`<div class="row g-3 lg:g-5 mb-3">
    ${cards.map(
      ({ href, title, description, images, bottomPadding = [], sidePadding = [] }) =>
        html`<div class="col-6">
          <article class="card feature-card h-100">
            <div
              class="card-img-top feature-art"
              aria-hidden="true"
            >
              ${images.map(
                (src, i) =>
                  html`<img
                    src=${src.href}
                    alt=""
                    width="48"
                    height="48"
                    style=${{
                      transform: `translateY(${100 * (bottomPadding[i] ?? 0)}%)`,
                      marginInlineStart: sidePadding[i]
                        ? `calc(-${sidePadding[i][0]} * var(--feature-image-size))`
                        : null,
                      marginInlineEnd: sidePadding[i]
                        ? `calc(-${sidePadding[i][1]} * var(--feature-image-size))`
                        : null,
                    }}
                  />`,
              )}
            </div>
            <div class="card-body">
              <h2 class="card-title">
                <a
                  href=${href}
                  class="stretched-link"
                  >${title}</a
                >
              </h2>
              <p class="card-text fg-3 small">${description}</p>
            </div>
          </article>
        </div>`,
    )}
  </div>`;
}
