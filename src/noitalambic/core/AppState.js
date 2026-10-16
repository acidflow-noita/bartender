// ============================================================================
// APP STATE - Manages global application state
// ============================================================================

import {readReactionReagents, reactionUrl} from "../../components/reactionUrl.js";

export class AppState {
  constructor(eventBus, dataRepo) {
    this.eventBus = eventBus;
    this.dataRepo = dataRepo;
    this.selectedReagents = [];
    this.selectedProduct = "";
    this.visibleTagMaterials = new Set();
    this.reagentChoices = null;
    this.productChoices = null;
    this.isResetting = false;
    this.minReactionSpeed = 0;
    this.excludeUnusedMaterials = true;
    this.reactionSource = "base";
    this._initializeFromURL();
  }

  _initializeFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    this.selectedReagents = readReactionReagents(window.location.href);
    this.selectedProduct = urlParams.get("product") || "";
    const speedParam = urlParams.get("minSpeed");
    this.minReactionSpeed = speedParam ? parseInt(speedParam) : 0;
    const sourceParam = urlParams.get("source");
    this.reactionSource = "base";
    this.excludeUnusedMaterials = urlParams.get("excludeUnused") !== "false";

    // Apply reaction source
    if (sourceParam && this.dataRepo.setReactionSource(sourceParam)) {
      this.reactionSource = sourceParam;
      console.log(`Loaded reaction source: ${sourceParam}`);
    }
    this.dataRepo.setExcludeUnusedMaterials(this.excludeUnusedMaterials);
    this._clearUnavailableSelections();
  }

  _clearUnavailableSelections() {
    this.selectedReagents = this.selectedReagents.filter((id) => this.dataRepo.isMaterialAvailable(id));
    if (!this.dataRepo.isMaterialAvailable(this.selectedProduct)) this.selectedProduct = "";
  }

  setExcludeUnusedMaterials(enabled) {
    this.excludeUnusedMaterials = !!enabled;
    this.dataRepo.setExcludeUnusedMaterials(this.excludeUnusedMaterials);
    this._clearUnavailableSelections();
    this.visibleTagMaterials.clear();
    this.eventBus.emit("stateChanged", this);
  }

  update(changes) {
    Object.assign(this, changes);
    this.eventBus.emit("stateChanged", this);
  }

  setReactionSource(sourceId) {
    if (this.dataRepo.setReactionSource(sourceId)) {
      this.reactionSource = sourceId;
      // Clear selections when changing source
      this.visibleTagMaterials.clear();
      this.selectedReagents = [];
      this.selectedProduct = "";

      if (this.reagentChoices?.initialised) this.reagentChoices.removeActiveItems();
      if (this.productChoices?.initialised) this.productChoices.removeActiveItems();

      this.eventBus.emit("reactionSourceChanged", this);
      return true;
    }
    return false;
  }

  toggleTagVisibility(tagId) {
    const materialIds = this.dataRepo.resolveTag(tagId);
    const allVisible = materialIds.every((id) => this.visibleTagMaterials.has(id));

    materialIds.forEach((id) => {
      allVisible ? this.visibleTagMaterials.delete(id) : this.visibleTagMaterials.add(id);
    });

    this.eventBus.emit("stateChanged", this);
  }

  selectReagent(reagentId) {
    if (this.dataRepo.getReactionsWithInput(reagentId).length === 0) return false;

    this.visibleTagMaterials.clear();
    this.update({
      selectedReagents: [reagentId],
      selectedProduct: "",
    });
    return true;
  }

  selectProduct(productId) {
    if (this.dataRepo.getReactionsWithOutput(productId).length === 0) return false;

    this.visibleTagMaterials.clear();
    this.update({
      selectedReagents: [],
      selectedProduct: productId,
    });
    return true;
  }

  setMinReactionSpeed(speed) {
    this.update({ minReactionSpeed: speed });
  }

  reset() {
    this.isResetting = true;
    this.visibleTagMaterials.clear();
    this.selectedReagents = [];
    this.selectedProduct = "";
    this.minReactionSpeed = 0;
    this.excludeUnusedMaterials = true;
    this.dataRepo.setExcludeUnusedMaterials(true);
    // Don't reset reaction source on reset

    if (this.reagentChoices?.initialised) this.reagentChoices.removeActiveItems();
    if (this.productChoices?.initialised) this.productChoices.removeActiveItems();

    const url = new URL(window.location.href);
    url.search = "";
    // Keep source in URL
    if (this.reactionSource !== "base") {
      url.searchParams.set("source", this.reactionSource);
    }
    window.history.replaceState({}, "", url.toString());

    this.isResetting = false;
    this.eventBus.emit("stateChanged", this);
  }

  updateURL() {
    if (this.isResetting) return;
    window.history.replaceState({}, "", reactionUrl(window.location.href, this));
  }
}
