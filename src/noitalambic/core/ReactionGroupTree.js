// ============================================================================
// REACTION GROUP TREE - Recursive tree of groups and leaves
// ============================================================================
// This structure decides HOW reaction sets combine, independently of what each set contains.
// Every node is either:
//   - a "leaf": a reference to one reaction set (managed by ReactionSetManager), or
//   - a "group": a combine mode (union/intersection/difference/symmetricDifference) applied to
//     an ordered list of children, which can themselves be leaves or other groups.
// Because groups nest arbitrarily, any boolean combination of sets can be expressed: e.g.
// (A union B) intersect (C difference D) is a group of mode "intersection" whose two children
// are themselves groups. There is always exactly one root group, which cannot be removed.
//
// Nodes live in a flat registry (Map<id, node>) with parent/children id references rather than
// nested objects, so operations like "move a node to a different group" or "find a node's
// parent" are O(1)/O(depth) instead of requiring a full tree walk.

let idCounter = 0;
function generateId(prefix) {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter}`;
}

export const GROUP_MODES = ["union", "intersection", "difference", "symmetricDifference"];

export class ReactionGroupTree {
  constructor(eventBus) {
    this.eventBus = eventBus;
    this.nodes = new Map();
    this.rootId = null;
    this.reset();
  }

  reset() {
    this.nodes.clear();
    const root = {
      id: "root",
      type: "group",
      mode: "union",
      name: "All reactions",
      enabled: true,
      collapsed: false,
      parentId: null,
      children: [],
    };
    this.nodes.set(root.id, root);
    this.rootId = root.id;
    this._emitChanged();
  }

  get root() {
    return this.nodes.get(this.rootId);
  }

  getNode(id) {
    return this.nodes.get(id) || null;
  }

  // -------------------------------------------------------------------
  // Structure mutation
  // -------------------------------------------------------------------

  // Adds a leaf node referencing an existing reaction set (by id) into a group.
  addLeaf(setId, parentGroupId = this.rootId) {
    const parent = this.getNode(parentGroupId);
    if (!parent || parent.type !== "group") return null;
    if (this.nodes.has(setId)) return null; // a node with this id already exists (1:1 invariant)

    const leaf = { id: setId, type: "leaf", setId, parentId: parent.id, collapsed: false };
    this.nodes.set(leaf.id, leaf);
    parent.children.push(leaf.id);
    this._emitChanged();
    return leaf;
  }

  addGroup(parentGroupId = this.rootId, mode = "union", name = "Group") {
    const parent = this.getNode(parentGroupId);
    if (!parent || parent.type !== "group") return null;

    const group = {
      id: generateId("group"),
      type: "group",
      mode: GROUP_MODES.includes(mode) ? mode : "union",
      name,
      enabled: true,
      collapsed: false,
      parentId: parent.id,
      children: [],
    };
    this.nodes.set(group.id, group);
    parent.children.push(group.id);
    this._emitChanged();
    return group;
  }

  // Removes a node (and, for a group, everything nested inside it) from the tree. The root group
  // itself can never be removed.
  removeNode(id) {
    if (id === this.rootId) return;
    const node = this.getNode(id);
    if (!node) return;

    if (node.type === "group") {
      [...node.children].forEach((childId) => this.removeNode(childId));
    }

    const parent = this.getNode(node.parentId);
    if (parent) parent.children = parent.children.filter((cid) => cid !== id);
    this.nodes.delete(id);
    this._emitChanged();
  }

  removeLeafBySetId(setId) {
    this.removeNode(setId); // a leaf's id is always its set's id
  }

  // Promotes a group's children up to its own parent, then discards the now-empty group wrapper.
  // Unlike removeNode(), this keeps the group's contents (it only removes the grouping itself).
  ungroup(groupId) {
    if (groupId === this.rootId) return;
    const group = this.getNode(groupId);
    if (!group || group.type !== "group") return;

    const parent = this.getNode(group.parentId);
    if (!parent) return;

    const indexInParent = parent.children.indexOf(groupId);
    const childIds = [...group.children];
    childIds.forEach((childId) => {
      const child = this.getNode(childId);
      if (child) child.parentId = parent.id;
    });

    parent.children.splice(indexInParent, 1, ...childIds);
    this.nodes.delete(groupId);
    this._emitChanged();
  }

  // Moves a node to a new parent group, at a given index (defaults to the end). Refuses to move
  // the root, or to move a group into one of its own descendants (which would create a cycle).
  moveNode(id, newParentGroupId, index = Infinity) {
    if (id === this.rootId) return;
    const node = this.getNode(id);
    const newParent = this.getNode(newParentGroupId);
    if (!node || !newParent || newParent.type !== "group") return;
    if (this._isSameOrDescendant(newParentGroupId, id)) return;

    const oldParent = this.getNode(node.parentId);
    if (oldParent) oldParent.children = oldParent.children.filter((cid) => cid !== id);

    const clampedIndex = Math.max(0, Math.min(index, newParent.children.length));
    newParent.children.splice(clampedIndex, 0, id);
    node.parentId = newParent.id;
    this._emitChanged();
  }

  // Reorders a node among its current siblings (-1 = move up/earlier, +1 = move down/later).
  // Sibling order matters for "difference" (the first child is the one subtracted from).
  moveWithinParent(id, direction) {
    const node = this.getNode(id);
    if (!node) return;
    const parent = this.getNode(node.parentId);
    if (!parent) return;

    const index = parent.children.indexOf(id);
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= parent.children.length) return;

    [parent.children[index], parent.children[newIndex]] = [parent.children[newIndex], parent.children[index]];
    this._emitChanged();
  }

  // -------------------------------------------------------------------
  // Node property setters
  // -------------------------------------------------------------------

  setGroupMode(groupId, mode) {
    const group = this.getNode(groupId);
    if (!group || group.type !== "group" || !GROUP_MODES.includes(mode)) return;
    group.mode = mode;
    this._emitChanged();
  }

  renameGroup(groupId, name) {
    const group = this.getNode(groupId);
    if (!group || group.type !== "group") return;
    group.name = name;
    this._emitChanged();
  }

  toggleEnabled(id) {
    const node = this.getNode(id);
    if (!node || id === this.rootId) return;
    // Undefined/true (enabled) flips to false; false flips back to true.
    node.enabled = node.enabled === false;
    this._emitChanged();
  }

  toggleCollapsed(id) {
    const node = this.getNode(id);
    if (!node) return;
    node.collapsed = !node.collapsed;
    this._emitChanged();
  }

  setCollapsed(id, collapsed) {
    const node = this.getNode(id);
    if (!node) return;
    node.collapsed = collapsed;
    this._emitChanged();
  }

  // -------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------

  findParentOfLeaf(setId) {
    const leaf = this.getNode(setId);
    if (!leaf || leaf.type !== "leaf") return null;
    return this.getNode(leaf.parentId);
  }

  // Every reaction-set id referenced anywhere under a given node (itself included if it's a leaf).
  collectLeafSetIds(nodeId) {
    const node = this.getNode(nodeId);
    if (!node) return [];
    if (node.type === "leaf") return [node.setId];
    return node.children.flatMap((childId) => this.collectLeafSetIds(childId));
  }

  _isSameOrDescendant(candidateId, ancestorId) {
    let current = this.getNode(candidateId);
    while (current) {
      if (current.id === ancestorId) return true;
      current = current.parentId ? this.getNode(current.parentId) : null;
    }
    return false;
  }

  // -------------------------------------------------------------------
  // Serialization
  // -------------------------------------------------------------------

  serialize() {
    return {
      rootId: this.rootId,
      nodes: [...this.nodes.values()].map((n) => JSON.parse(JSON.stringify(n))),
    };
  }

  loadFromObject(data) {
    if (!data || !Array.isArray(data.nodes) || !data.rootId) return false;

    const nodes = new Map(data.nodes.map((n) => [n.id, { ...n }]));
    if (!nodes.has(data.rootId)) return false;

    this.nodes = nodes;
    this.rootId = data.rootId;
    this._emitChanged();
    return true;
  }

  _emitChanged() {
    this.eventBus?.emit("reactionGroupTreeChanged", this);
  }
}
