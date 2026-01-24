// ============================================================================
// STYLES - Injects notification styles into the document
// ============================================================================

export function injectNotificationStyles() {
  const notificationStyle = document.createElement("style");
  notificationStyle.textContent = `
    .notification {
      position: fixed; z-index: 9999; inset: 5% 0 0 50%; translate: -50% 0;
      width: max-content; height: max-content;
      background-color: oklch(39.3% 0.095 152.535); border-radius: 1rem; padding: 1rem;
      font-weight: bold; font-size: large; color: oklch(92.5% 0.084 155.995);
      font-family: -apple-system, BlinkMacSystemFont, "avenir next", avenir, helvetica, "helvetica neue", ubuntu, roboto, noto, "segoe ui", arial, sans-serif;
      transition: opacity 500ms; opacity: 0; animation: slideInDown 500ms ease-out; user-select: none;
    }
    @keyframes slideInDown {
      0% { transform: translateY(-100%); opacity: 0; }
      100% { transform: translateY(0); opacity: 1; }
    }
  `;
  document.head.appendChild(notificationStyle);
}
