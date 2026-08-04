// ============================================================================
// REACTION SET WORKSPACE - Facade composing ReactionSetManager + ReactionGroupTree
// ============================================================================
// A "workspace" is the full picture: which reaction sets exist (ReactionSetManager) and how
// they are grouped/combined (ReactionGroupTree). Every operation that must keep both in sync
// (creating/deleting/duplicating a set also creates/removes its corresponding leaf node) lives
// here, so the UI layer never has to manually coordinate the two.

import { CONFIG } from "../config/config.js";
import { ReactionSetManager, InMemoryStorage, createReactionSet } from "./ReactionSetManager.js";
import { ReactionGroupTree, GROUP_MODES } from "./ReactionGroupTree.js";

export class ReactionSetWorkspace {
  constructor(eventBus, storage = null) {
    this.eventBus = eventBus;
    this.storage = storage || (typeof window !== "undefined" && window.localStorage ? window.localStorage : new InMemoryStorage());
    this.manager = new ReactionSetManager(eventBus);
    this.tree = new ReactionGroupTree(eventBus);
  }

  // -------------------------------------------------------------------
  // Combined creation/deletion (keeps manager + tree in sync)
  // -------------------------------------------------------------------

  createSet(parentGroupId = this.tree.rootId, overrides = {}) {
    const set = this.manager.addSet(overrides);
    if (!set) return null; // hit CONFIG.reactionSets.maxSets
    this.tree.addLeaf(set.id, parentGroupId);
    return set;
  }

  deleteSet(setId) {
    this.manager.removeSet(setId);
    this.tree.removeLeafBySetId(setId);
  }

  duplicateSet(setId) {
    const copy = this.manager.duplicateSet(setId);
    if (!copy) return null;
    const parent = this.tree.findParentOfLeaf(setId);
    this.tree.addLeaf(copy.id, parent ? parent.id : this.tree.rootId);
    return copy;
  }

  createGroup(parentGroupId = this.tree.rootId, mode = "union", name = "Group") {
    return this.tree.addGroup(parentGroupId, mode, name);
  }

  // Deletes a group and every set nested inside it (in the manager too, not just the tree).
  deleteGroup(groupId) {
    const leafSetIds = this.tree.collectLeafSetIds(groupId);
    this.tree.removeNode(groupId);
    leafSetIds.forEach((id) => this.manager.removeSet(id));
  }

  ungroup(groupId) {
    this.tree.ungroup(groupId);
  }

  reset(withDefaultSet = true) {
    this.manager.sets = [];
    this.tree.reset();
    if (withDefaultSet) this.createSet(this.tree.rootId, { name: "Set 1" });
    this.eventBus.emit("reactionSetsChanged", this);
  }

  collapseAll() {
    this.manager.sets.forEach((s) => {
      s.collapsed = true;
    });
    this.tree.nodes.forEach((n) => {
      if (n.type === "group" && n.id !== this.tree.rootId) n.collapsed = true;
    });
    this.eventBus.emit("reactionSetsChanged", this);
  }

  expandAll() {
    this.manager.sets.forEach((s) => {
      s.collapsed = false;
    });
    this.tree.nodes.forEach((n) => {
      if (n.type === "group") n.collapsed = false;
    });
    this.eventBus.emit("reactionSetsChanged", this);
  }

  // -------------------------------------------------------------------
  // Serialization (sets + tree travel together)
  // -------------------------------------------------------------------

  serialize() {
    return {
      version: 2,
      sets: this.manager.sets.map((s) => JSON.parse(JSON.stringify(s))),
      tree: this.tree.serialize(),
    };
  }

  loadFromObject(data) {
    if (!data) return false;

    if (data.version === 2 && data.tree) {
      if (!Array.isArray(data.sets)) return false;
      this.manager.sets = data.sets.map((s) => createReactionSet({ ...s }));
      const ok = this.tree.loadFromObject(data.tree);
      if (!ok) return false;
      this.eventBus.emit("reactionSetsChanged", this);
      return true;
    }

    // Legacy v1 format migration: { version: 1, combineMode, sets: [...] } (flat, no grouping)
    // becomes a single root group of that mode containing every set as a direct leaf.
    if (Array.isArray(data.sets)) {
      this.manager.sets = data.sets.map((s) => createReactionSet({ ...s }));
      this.tree.reset();
      if (GROUP_MODES.includes(data.combineMode)) {
        this.tree.root.mode = data.combineMode;
      }
      this.manager.sets.forEach((s) => this.tree.addLeaf(s.id, this.tree.rootId));
      this.eventBus.emit("reactionSetsChanged", this);
      return true;
    }

    return false;
  }

  seedFromLegacyParams({ reagents = [], product = "", minSpeed = 0 } = {}) {
    if (this.manager.sets.length > 0) return;
    this.createSet(this.tree.rootId, { name: "Set 1", reagents, product, minSpeed });
  }

  // -------------------------------------------------------------------
  // Compact URL persistence
  // -------------------------------------------------------------------

  encodeToURLParam() {
    return this._base64Encode(JSON.stringify(this.serialize()));
  }

  loadFromURLParam(encoded) {
    try {
      return this.loadFromObject(JSON.parse(this._base64Decode(encoded)));
    } catch (error) {
      console.error("Failed to load the workspace from the URL parameter", error);
      return false;
    }
  }

  _base64Encode(text) {
    if (typeof btoa === "function") return btoa(unescape(encodeURIComponent(text)));
    return Buffer.from(text, "utf-8").toString("base64");
  }

  _base64Decode(encoded) {
    if (typeof atob === "function") return decodeURIComponent(escape(atob(encoded)));
    return Buffer.from(encoded, "base64").toString("utf-8");
  }

  // -------------------------------------------------------------------
  // Named configurations, saved in localStorage
  // -------------------------------------------------------------------

  saveNamedConfig(name) {
    if (!name || !name.trim()) return false;

    const all = this._readSavedIndex();
    all[name.trim()] = { savedAt: new Date().toISOString(), data: this.serialize() };
    this._writeSavedIndex(all);

    this.eventBus.emit("reactionSetConfigsChanged", this.listSavedConfigs());
    return true;
  }

  listSavedConfigs() {
    const all = this._readSavedIndex();
    return Object.entries(all)
      .map(([name, entry]) => ({ name, savedAt: entry.savedAt }))
      .sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
  }

  loadNamedConfig(name) {
    const all = this._readSavedIndex();
    const entry = all[name];
    if (!entry) return false;
    return this.loadFromObject(entry.data);
  }

  deleteNamedConfig(name) {
    const all = this._readSavedIndex();
    delete all[name];
    this._writeSavedIndex(all);
    this.eventBus.emit("reactionSetConfigsChanged", this.listSavedConfigs());
  }

  _readSavedIndex() {
    try {
      const raw = this.storage.getItem(CONFIG.reactionSets.storageKey);
      return raw ? JSON.parse(raw) : {};
    } catch (error) {
      console.error("Failed to read saved reaction set configurations", error);
      return {};
    }
  }

  _writeSavedIndex(all) {
    try {
      this.storage.setItem(CONFIG.reactionSets.storageKey, JSON.stringify(all));
    } catch (error) {
      console.error("Failed to write saved reaction set configurations", error);
    }
  }
}
