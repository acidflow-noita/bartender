const EMPTY = 0;
const WALL = 65535;

export function createMaterialMutationQueue() {
  return {creations: [], blobs: [], explosions: []};
}

export function resetMutations(world) {
  world.materialMutations = createMaterialMutationQueue();
  return world.materialMutations;
}

function commit(world, apply) {
  const previous = world._committing;
  world._committing = true;
  try { return apply(); }
  finally { world._committing = previous; }
}

// GridWorldThreaded::0x0072b170 records coordinates, material and replace.
// It leaves both the source object and the grid unchanged until commit.
export function queueMaterialCreation(world, index, material, {replace = true, formationColor = 0} = {}) {
  if (!Number.isInteger(index) || index < 0 || index >= world.cells.length) return false;
  const queue = world.materialMutations ??= createMaterialMutationQueue();
  queue.creations.push({x: index % world.width, y: Math.floor(index / world.width), material,
    replace: Boolean(replace), ...(formationColor ? {formationColor} : {})});
  return true;
}

// 0x0072abf0 commits this FIFO before blob/explosion commands. Its caller
// returns before GridWorld::0x0071fde0 reinserts detached cell objects.
export function flushMaterialCreations(world) {
  const queue = world.materialMutations;
  if (!queue?.creations.length) return 0;
  const pending = queue.creations.splice(0);
  let created = 0;
  return commit(world, () => {
    for (const command of pending) {
      const index = world._index(command.x, command.y);
      if (index < 0 || world.cells[index] === WALL) continue;
      // Base-world spawn 0x0071b140 checks occupancy at commit time.
      if (!command.replace && world.cells[index] !== EMPTY) continue;
      const options = {fresh: true, immediate: true};
      if (command.formationColor) options.formationColor = command.formationColor;
      world._replaceMaterial(index, command.material, options);
      created++;
    }
    return created;
  });
}

export function queueBlobMutation(world, center, input, output, radius, restricted = true) {
  if (!Number.isInteger(center) || center < 0 || center >= world.cells.length) return false;
  const queue = world.materialMutations ??= createMaterialMutationQueue();
  queue.blobs.push({x: center % world.width, y: Math.floor(center / world.width),
    input, output, radius, restricted: Boolean(restricted)});
  return true;
}

export function flushBlobMutations(world, apply) {
  const queue = world.materialMutations;
  if (!queue?.blobs.length) return 0;
  const pending = queue.blobs.splice(0);
  return commit(world, () => {
    let changed = 0;
    for (const command of pending) changed += apply(world, command) ?? 0;
    return changed;
  });
}

export function queueExplosion(world, effect) {
  const queue = world.materialMutations ??= createMaterialMutationQueue();
  queue.explosions.push({...effect, config: structuredClone(effect.config)});
}

export function flushExplosions(world, apply) {
  const queue = world.materialMutations;
  if (!queue?.explosions.length) return 0;
  const pending = queue.explosions.splice(0);
  return commit(world, () => apply(world, pending));
}
