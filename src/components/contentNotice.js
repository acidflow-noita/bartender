/**
 * Content limitation notice component for restricted pages
 */

import { html } from "htl";

export function createContentNotice(authState, counts) {
  // If user is authenticated and a follower, don't show the notice
  if (authState.authenticated && authState.isFollower) {
    return html``;
  }

  const containerStyle = "text-align: center; margin: 1rem 0;";
  const baseStyle =
    "background: oklch(27.9% 0.041 260.031); border: 1px solid oklch(70.5% 0.213 47.604); border-radius: 6px; padding: 0.75rem 1.5rem; font-size: 0.9em; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: inline-block; max-width: 90vw;";
  const linkStyle = "color: #9146ff; text-decoration: none;";
  const paragraphStyle =
    "margin: 0; color: #dcdcee; text-align: center; white-space: nowrap; line-height: 1.4; display: flex; align-items: center; justify-content: center; gap: 0.25rem;";

  // Build the count text based on what's provided
  if (counts.spells && counts.materials) {
    return html`<div style="${containerStyle}">
      <div style="${baseStyle}">
        <p style="${paragraphStyle}">
          <span>⚠️</span>
          <span
            >Limited preview: showing <span class="bigger-number-better">${counts.spells}</span> spells and
            <span class="bigger-number-better">${counts.materials}</span> materials of
            <span class="bigger-number-better">${counts.totalSpells}</span> spells and
            <span class="bigger-number-better">${counts.totalMaterials}</span> materials total.
            <a
              href="https://www.twitch.tv/wuote"
              target="_blank"
              style="${linkStyle}"
              >Follow @WUOTE</a
            >
            and
            <a
              href="#"
              onclick="window.authLogin && window.authLogin(); return false;"
              style="${linkStyle}"
              >sign in</a
            >
            for full access.</span
          >
          <span>⚠️</span>
        </p>
      </div>
    </div>`;
  } else if (counts.materials && counts.spells) {
    return html`<div style="${containerStyle}">
      <div style="${baseStyle}">
        <p style="${paragraphStyle}">
          <span>⚠️</span>
          <span
            >Limited preview: showing <span class="bigger-number-better">${counts.materials}</span> materials and
            <span class="bigger-number-better">${counts.spells}</span> spells of
            <span class="bigger-number-better">${counts.totalMaterials}</span> materials and
            <span class="bigger-number-better">${counts.totalSpells}</span> spells total.
            <a
              href="https://www.twitch.tv/wuote"
              target="_blank"
              style="${linkStyle}"
              >Follow @WUOTE</a
            >
            and
            <a
              href="#"
              onclick="window.authLogin && window.authLogin(); return false;"
              style="${linkStyle}"
              >sign in</a
            >
            for full access</span
          >
          <span>⚠️</span>
        </p>
      </div>
    </div>`;
  } else if (counts.materials) {
    return html`<div style="${containerStyle}">
      <div style="${baseStyle}">
        <p style="${paragraphStyle}">
          <span>⚠️</span>
          <span
            >Limited preview: showing <span class="bigger-number-better">${counts.materials}</span> of
            <span class="bigger-number-better">${counts.totalMaterials}</span> materials.
            <a
              href="https://www.twitch.tv/wuote"
              target="_blank"
              style="${linkStyle}"
              >Follow @WUOTE</a
            >
            and
            <a
              href="#"
              onclick="window.authLogin && window.authLogin(); return false;"
              style="${linkStyle}"
              >sign in</a
            >
            for full access</span
          >
          <span>⚠️</span>
        </p>
      </div>
    </div>`;
  }

  return html``;
}
