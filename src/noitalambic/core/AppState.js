// ============================================================================
// APP STATE - Manages global application state
// ============================================================================

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
    this.reactionSource = "base";
    this._initializeFromURL();
  }

  _initializeFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    this.selectedReagents = urlParams.get("reagents")?.split(",").filter(Boolean) || [];
    this.selectedProduct = urlParams.get("product") || "";
    const speedParam = urlParams.get("minSpeed");
    this.minReactionSpeed = speedParam ? parseInt(speedParam) : 0;
    const sourceParam = urlParams.get("source");
    this.reactionSource = sourceParam || "base";

    // Apply reaction source
    if (sourceParam && this.dataRepo.setReactionSource(sourceParam)) {
      console.log(`Loaded reaction source: ${sourceParam}`);
    }
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
    if (allVisible) {
      this.hideTagMaterials(tagId);
    } else {
      this.showTagMaterials(tagId);
    }
  }

  showTagMaterials(tagId) {
    this.dataRepo.resolveTag(tagId).forEach((id) => this.visibleTagMaterials.add(id));
    this.eventBus.emit("stateChanged", this);
  }

  hideTagMaterials(tagId) {
    this.dataRepo.resolveTag(tagId).forEach((id) => this.visibleTagMaterials.delete(id));
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

    const url = new URL(window.location.href);
    url.search = "";

    if (this.selectedReagents.length > 0) {
      url.searchParams.set("reagents", this.selectedReagents.join(","));
    }
    if (this.selectedProduct) {
      url.searchParams.set("product", this.selectedProduct);
    }
    if (this.minReactionSpeed > 0) {
      url.searchParams.set("minSpeed", this.minReactionSpeed.toString());
    }
    if (this.reactionSource !== "base") {
      url.searchParams.set("source", this.reactionSource);
    }

    window.history.replaceState({}, "", url.toString());
  }
}
