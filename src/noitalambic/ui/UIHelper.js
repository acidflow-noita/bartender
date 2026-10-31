// ============================================================================
// UI HELPER - Utility functions for UI rendering
// ============================================================================

import { CONFIG } from "../config/config.js";

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

  static truncateName(name, maxLength = CONFIG.graph.constraints.maxNameLength) {
    return name.length > maxLength ? name.substring(0, CONFIG.graph.constraints.truncatedNameLength) + "..." : name;
  }

  static async showNotification(text, {success = false} = {}) {
    const element = document.getElementById("notification-toast");
    if (!element) return;
    const {default: Toast} = await import("bootstrap/js/dist/toast.js");
    if (!element.isConnected) return;
    element.classList.toggle("theme-success", success);
    element.querySelector("[data-notification-message]").textContent = text;
    return Toast.getOrCreateInstance(element, {delay: CONFIG.ui.notificationDuration}).show();
  }
}
