// ============================================================================
// NODE CONTEXT MENU - The right-click menu of materials, tags and reactions
// ============================================================================
// Lists the node's shortcut actions (with their shortcut, so it doubles as a cheat sheet) plus
// pin, selection, tag and exclusion entries.
// Part of GraphRenderer, which owns the SVG and the simulation: reached through this.r.

import { UIHelper } from "../ui/UIHelper.js";
import { formatCombo } from "../core/ShortcutManager.js";

export class NodeContextMenu {
  constructor(renderer) {
    this.r = renderer;
    this._active = null;
    this._outsideHandler = null;
  }

  // Menu entries for a node: every shortcut action of its scope (so the menu is a discoverable
  // alternative to the modifier+click shortcuts, with each shortcut shown next to its entry),
  // except the menu-opening action itself. Tags get explicit show/hide entries instead of the
  // toggle, whose effect depends on the current state. Entries that can't run here (no sets in
  // classic mode) are left out.
  entries(node, ctx) {
    const entries = [];
    if (ctx) entries.push({ label: "Highlight connections", run: () => this.r.highlighter.highlight(node, ctx.allNodes, ctx.linkArray) });
    // Pin a node where it is (on its grid cell, if any) so physics leaves it alone - it can still
    // be dragged - or let it go again.
    const selected = this.r.selection.ids.has(node.id) && this.r.selection.ids.size > 1 ? this.r.selection.nodes() : null;
    if (this.r._simulation && selected) {
      entries.push({ label: `Pin selected (${selected.length})`, run: () => selected.forEach((n) => this.r.pins.setPinned(n, true)) });
      if (selected.some((n) => n.pinned)) {
        entries.push({ label: `Unpin selected (${selected.length})`, run: () => selected.forEach((n) => n.pinned && this.r.pins.setPinned(n, false)) });
      }
      entries.push({ label: "Clear selection", run: () => this.r.selection.clear() });
    } else if (this.r._simulation) {
      if (node.pinned) {
        entries.push({ label: "Unpin position", run: () => this.r.pins.setPinned(node, false) });
      } else {
        entries.push({ label: "Pin position", run: () => this.r.pins.setPinned(node, true) });
      }
    }
    if (node.type === "reaction" && ctx) {
      // The reaction and every material/tag it links to, as the selection: handy to move a whole
      // reaction around at once.
      entries.splice(1, 0, {
        label: "Select with its materials",
        run: () => {
          const ids = new Set([node.id]);
          ctx.linkArray.forEach(({ source, target }) => {
            if (source.id === node.id) ids.add(target.id);
            if (target.id === node.id) ids.add(source.id);
          });
          this.r.selection.set(ids);
        },
      });
    }
    // Excluding needs reaction sets (advanced mode): see onExcludeReactions.
    if (node.type === "reaction" && this.r.onExcludeReactions) {
      const reactions = (selected ?? [node]).filter((n) => n.type === "reaction").map((n) => n.reaction);
      const label = selected && reactions.length > 1 ? `Exclude selected reactions (${reactions.length})` : "Exclude this reaction";
      entries.push({ label, run: () => this.r.onExcludeReactions(selected && reactions.length > 1 ? reactions : [node.reaction]) });
    }
    if (node.type === "tag") {
      entries.push({ label: "Show all materials", run: () => this.r.state.showTagMaterials(node.id) });
      entries.push({ label: "Hide all materials", run: () => this.r.state.hideTagMaterials(node.id) });
      return entries;
    }
    const menuActions = new Set(["openMaterialMenu", "openTagMenu", "openReactionMenu"]);
    const needsSets = new Set(["addReagentToNewSet", "addProductToNewSet"]);
    this.r.shortcutManager.getActions(node.type).forEach((action) => {
      if (menuActions.has(action.id) || (needsSets.has(action.id) && !this.r.onQuickAddSet)) return;
      const handler = this.r._actionHandler(action.id);
      if (!handler) return;
      const combo = this.r.shortcutManager.getBinding(action.id);
      entries.push({ label: action.label, hint: combo ? formatCombo(combo) : "", run: () => handler(node) });
    });
    return entries;
  }

  // A small floating menu listing the node's actions (see entries()).
  show(event, node, ctx = null) {
    this.close();

    const menu = document.createElement("div");
    menu.setAttribute("role", "menu");
    menu.style.cssText = [
      "position:fixed",
      `left:${event.clientX}px`,
      `top:${event.clientY}px`,
      "background:#1a1a1a",
      "border:1px solid #555",
      "border-radius:6px",
      "padding:4px",
      "z-index:10000",
      "box-shadow:0 4px 12px rgba(0,0,0,0.5)",
      "font-family:Arial, sans-serif",
      "font-size:12px",
      "min-width:180px",
    ].join(";");

    const title = document.createElement("div");
    title.textContent = node.type === "tag" ? `[${node.tag || node.id}]`
      : node.type === "reaction" ? UIHelper.reactionTitle(node.reaction, this.r.dataRepo) : node.name || node.id;
    title.style.cssText = "color:#999;padding:4px 8px;border-bottom:1px solid #444;margin-bottom:4px;";
    menu.appendChild(title);

    this.entries(node, ctx).forEach(({ label, hint, run }) => {
      const item = document.createElement("button");
      item.type = "button";
      item.setAttribute("role", "menuitem");
      item.textContent = label;
      item.style.cssText =
        "display:flex;justify-content:space-between;gap:16px;width:100%;text-align:left;background:none;border:none;color:#fff;padding:6px 8px;cursor:pointer;border-radius:4px;";
      if (hint) {
        const hintEl = document.createElement("span");
        hintEl.className = "context-menu-shortcut";
        hintEl.textContent = hint;
        hintEl.style.cssText = "color:#888;";
        item.appendChild(hintEl);
      }
      item.addEventListener("mouseenter", () => (item.style.background = "#333"));
      item.addEventListener("mouseleave", () => (item.style.background = "none"));
      item.addEventListener("click", () => {
        this.close();
        run();
      });
      menu.appendChild(item);
    });

    UIHelper.overlayHost().appendChild(menu);
    this._active = menu;

    // Close on a press outside the menu, or on Escape. Listening to "pointerdown" rather than
    // "click" matters: on Linux the contextmenu event fires on mouse *down*, and some browsers
    // then dispatch a "click" to the document on release, which used to close the menu the very
    // moment it opened. The press that opened the menu has already happened, so no deferral is
    // needed; capture phase so nodes stopping propagation (d3 drag) can't swallow it.
    this._outsideHandler = (e) => {
      const close = e.type === "keydown" ? e.key === "Escape" : e.type === "fullscreenchange" || !menu.contains(e.target);
      if (close) this.close();
    };
    document.addEventListener("pointerdown", this._outsideHandler, true);
    document.addEventListener("keydown", this._outsideHandler, true);
    // Entering/leaving fullscreen changes which subtree is rendered: the menu would be stranded.
    document.addEventListener("fullscreenchange", this._outsideHandler);
    menu.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  close() {
    if (this._active) {
      this._active.remove();
      this._active = null;
    }
    if (this._outsideHandler) {
      document.removeEventListener("pointerdown", this._outsideHandler, true);
      document.removeEventListener("keydown", this._outsideHandler, true);
      document.removeEventListener("fullscreenchange", this._outsideHandler);
      this._outsideHandler = null;
    }
  }
}
