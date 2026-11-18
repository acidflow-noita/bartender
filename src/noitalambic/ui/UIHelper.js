// ============================================================================
// UI HELPER - Utility functions for UI rendering
// ============================================================================

import { CONFIG } from "../config/config.js";
import { parseColor, composite, formatColor } from "./cssColor.js";

export class UIHelper {
  static imageUrlCache = new Map();

  static getMaterialImageUrl(id, dataRepo) {
    if (!id || dataRepo.isTag(id)) return "";
    if (!this.imageUrlCache.has(id)) {
      // Placeholder materials (see DataRepository._ensureMaterialsExist) carry a fallback imageId.
      const imageId = dataRepo.getMaterial(id)?.imageId || id;
      const url = `${CONFIG.urls.imageBase}/images/materials/Material_${imageId}.png`;
      this.imageUrlCache.set(id, url);
    }
    return this.imageUrlCache.get(id);
  }

  static getMaterialName(id, dataRepo) {
    if (dataRepo.isTag(id)) return `[${id.slice(1, -1)}]`;
    const material = dataRepo.getMaterial(id);
    return material?.name || id;
  }

  // "Water + Fire → Steam": material names (tags as [tag]), empty slots skipped.
  static reactionTitle(reaction, dataRepo) {
    const side = (ids) => ids.filter(Boolean).map((id) => this.getMaterialName(id, dataRepo)).join(" + ");
    return `${side([reaction?.reagent1, reaction?.reagent2, reaction?.reagent3])} → ${side([reaction?.product1, reaction?.product2, reaction?.product3])}`;
  }

  static truncateName(name, maxLength = CONFIG.graph.constraints.maxNameLength) {
    return name.length > maxLength ? name.substring(0, CONFIG.graph.constraints.truncatedNameLength) + "..." : name;
  }

  // Where floating UI (menus, toasts) must be attached to be visible: in fullscreen only the
  // fullscreen element's subtree is rendered, so anything under <body> outside it is hidden.
  // Color the element is actually drawn on, as plain sRGB: its own background and its ancestors'
  // ones composited until an opaque one is reached (white if none is).
  static backgroundColorOf(el) {
    const layers = [];
    for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
      const color = parseColor(window.getComputedStyle(node).backgroundColor);
      if (!color || color.a === 0) continue;
      layers.push(color);
      if (color.a >= 1) break;
    }
    let result = { r: 255, g: 255, b: 255, a: 1 };
    for (const layer of layers.reverse()) result = composite(layer, result);
    return formatColor(result);
  }

  static overlayHost() {
    return document.fullscreenElement ?? document.body;
  }

  static async showNotification(text, {success = false} = {}) {
    const element = document.getElementById("notification-toast");
    if (!element) return;
    const wrapper = element.closest(".toast-container") ?? element, host = this.overlayHost();
    if (!host.contains(wrapper)) host.append(wrapper);
    const {default: Toast} = await import("bootstrap/js/dist/toast.js");
    if (!element.isConnected) return;
    element.classList.toggle("theme-success", success);
    element.querySelector("[data-notification-message]").textContent = text;
    return Toast.getOrCreateInstance(element, {delay: CONFIG.ui.notificationDuration}).show();
  }
}
