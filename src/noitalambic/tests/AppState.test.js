import test from "node:test";
import assert from "node:assert/strict";

import { EventBus } from "../core/EventBus.js";
import { DataRepository } from "../core/DataRepository.js";
import { AppState } from "../core/AppState.js";
import { materials, reactionSources, materialAssociations } from "./fixtures.js";

// AppState reads window.location.search in its constructor; a minimal stub is enough here since
// nothing else in this file needs a real DOM.
global.window = { location: { search: "" } };

function buildState() {
  const eventBus = new EventBus();
  const dataRepo = new DataRepository(materials, reactionSources, materialAssociations);
  const state = new AppState(eventBus, dataRepo);
  return { eventBus, state };
}

test("showTagMaterials adds every material of the tag and emits stateChanged", () => {
  const { eventBus, state } = buildState();
  let emitted = 0;
  eventBus.on("stateChanged", () => emitted++);

  state.showTagMaterials("[liquids]");

  assert.ok(state.visibleTagMaterials.has("water"));
  assert.ok(state.visibleTagMaterials.has("oil"));
  assert.equal(emitted, 1);
});

test("hideTagMaterials removes every material of the tag and emits stateChanged, and can always close what was opened", () => {
  const { state } = buildState();

  state.showTagMaterials("[liquids]");
  assert.ok(state.visibleTagMaterials.has("water"));

  state.hideTagMaterials("[liquids]");
  assert.equal(state.visibleTagMaterials.has("water"), false);
  assert.equal(state.visibleTagMaterials.has("oil"), false);

  // And it can be hidden again safely even though it is already hidden (no toggle ambiguity).
  state.hideTagMaterials("[liquids]");
  assert.equal(state.visibleTagMaterials.has("water"), false);
});

test("toggleTagVisibility flips between fully shown and fully hidden", () => {
  const { state } = buildState();

  state.toggleTagVisibility("[liquids]");
  assert.ok(state.visibleTagMaterials.has("water"));

  state.toggleTagVisibility("[liquids]");
  assert.equal(state.visibleTagMaterials.has("water"), false);
});
