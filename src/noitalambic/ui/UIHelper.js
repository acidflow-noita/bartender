// ============================================================================
// UI HELPER - Utility functions for UI rendering
// ============================================================================

import { CONFIG } from "../config/config.js";

export class UIHelper {
  static imageUrlCache = new Map();

  static getMaterialImageUrl(id, dataRepo) {
    if (!id) return "";
    if (!this.imageUrlCache.has(id)) {
      if (dataRepo.isTag(id)) {
        const url = `${CONFIG.urls.imageBase}/images/icons/tag.svg`;
        this.imageUrlCache.set(id, url);
      } else {
        // Check if material has a custom imageId (e.g., for placeholder materials)
        const material = dataRepo.getMaterial(id);
        const imageId = material?.imageId || id;
        const url = `${CONFIG.urls.imageBase}/images/materials/Material_${imageId}.png`;
        this.imageUrlCache.set(id, url);
      }
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

  static showNotification(text) {
    const parentElement = document.getElementById("observablehq-main");
    const notifID = "share-notification";

    if (!parentElement || document.getElementById(notifID)) return;

    const notification = document.createElement("p");
    notification.id = notifID;
    notification.textContent = text;
    notification.classList.add("notification");
    parentElement.appendChild(notification);

    setTimeout(() => (notification.style.opacity = 1), 100);
    setTimeout(() => {
      notification.style.opacity = 0;
      setTimeout(() => parentElement.removeChild(notification), 500);
    }, CONFIG.ui.notificationDuration);
  }
}
