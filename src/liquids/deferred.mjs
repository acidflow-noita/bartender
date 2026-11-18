const EMPTY = 0;
const WALL = 65535;

export function resetDeferred(world) {
  world._deferredState = {pending: [], retry: [], budget: 200, dropped: 0};
}

function queues(world) {
  if (!world._deferredState) resetDeferred(world);
  return world._deferredState;
}

function capture(world, index) {
  return {id: world.cells[index], x: index % world.width, y: Math.floor(index / world.width),
    values: world._cellState.map(array => array[index]), tick: world.tick};
}

function ageEntry(world, entry) {
  const elapsed = world.tick - entry.tick;
  if (world.processes && elapsed > 0 && world.kind[entry.id] !== 2) {
    const ageIndex = world._cellState.indexOf(world.age);
    if (ageIndex >= 0) entry.values[ageIndex] = (entry.values[ageIndex] + elapsed) | 0;
  }
  entry.tick = world.tick;
}

export function defer(world, index) {
  if (index < 0 || !world.cells[index] || world.cells[index] === WALL) return false;
  queues(world).pending.push(capture(world, index));
  world._markActive?.(index);
  for (const array of world._cellState) array[index] = 0;
  if (world._movingCell === index) world._movingCell = -1;
  return true;
}

// Original reinsertion helper 0x0071fba0. The queue owns displaced cells until
// their next insertion attempt; none of their movement state is recreated.
export function reinsert(world, entry, displaced) {
  ageEntry(world, entry);
  let x = entry.x;
  const startY = entry.y;
  const density = Math.fround(world.materials[entry.id].density);
  const random = world.effectRandom ?? world.random;
  for (let y = startY; y >= startY - 128; y--) {
    const index = world._index(x, y);
    if (index < 0) continue;
    const target = world.cells[index];
    if (target === WALL) return false;
    const targetMaterial = world.materials[target];
    if (target === EMPTY || (world.kind[target] !== 3 && targetMaterial
      && density > Math.fround(targetMaterial.density))) {
      if (target !== EMPTY) displaced.push(capture(world, index));
      world._cellState.forEach((array, field) => { array[index] = entry.values[field]; });
      world.cells[index] = entry.id;
      world._markActive?.(index);
      if (world.kind[entry.id] === 1) world._idle[index] = Math.min(world._idle[index], 45);
      entry.x = x; entry.y = y;
      return true;
    }
    if (world.kind[target] === 3) return false;
    if (y < startY - 5 && random.integer(100) < 20) {
      x += random.integer(100) < 50 ? 1 : -1;
    }
  }
  return false;
}

// Queue processing order and retry budgets follow 0x0071fde0.
export function flush(world) {
  const state = queues(world);
  let restored = 0;
  const random = world.effectRandom ?? world.random;
  if (state.retry.length) {
    let index = random.integer(state.retry.length - 1);
    if (state.pending.length && state.budget > 300) state.budget = 300;
    state.budget = Math.min(state.budget, state.retry.length);
    let successful = false;
    for (let attempt = 0; attempt < state.budget && state.retry.length; attempt++) {
      if (index >= state.retry.length) index = 0;
      if (reinsert(world, state.retry[index], state.retry)) {
        state.retry[index] = state.retry[state.retry.length - 1];
        state.retry.pop();
        restored++;
        successful = true;
      } else {
        index++;
      }
    }
    if (successful) state.budget = 500;
    else if (state.budget > 20) state.budget = Math.trunc(Math.fround(state.budget * .5));
    // This loop retains the native changing-size termination condition.
    if (state.retry.length > 100000) {
      let removed = 0;
      do { state.retry.pop(); removed++; } while (removed < state.retry.length - 100000);
      state.dropped += removed;
    }
  }
  if (state.pending.length) {
    const displaced = [];
    for (const entry of state.pending) {
      if (reinsert(world, entry, displaced)) restored++;
      else { state.retry.push(entry); state.budget = 500; }
    }
    state.pending = displaced;
  }
  return {restored, pending: state.pending.length, retry: state.retry.length, dropped: state.dropped};
}

export function countDeferred(world) {
  const counts = new Map();
  const state = world._deferredState;
  if (!state) return counts;
  for (const list of [state.pending, state.retry]) {
    for (const entry of list) counts.set(entry.id, (counts.get(entry.id) ?? 0) + 1);
  }
  return counts;
}
