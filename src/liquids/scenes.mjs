import {WALL} from './engine.mjs';

export const LIQUID_SCENES = [
  {id: 'density', name: 'Density layers', processes: false},
  {id: 'channels', name: 'Flow channels', description: 'The selected material flows through gaps in the shelves. Change material and reset to compare.'},
  {id: 'acid', name: 'Acid container'},
  {id: 'ambrosia', name: 'Honey + diamond'},
  {id: 'poison-exposure', name: 'Poison: sealed and open'},
  {id: 'oil-fire', name: 'Oil fire'},
  {id: 'phase', name: 'Warm and cold'},
  {id: 'empty', name: 'Empty tank', description: 'Pour a liquid, draw obstacles, or erase cells to make your own experiment.'},
];

export const defaultSceneProcesses = scene => LIQUID_SCENES.find(item => item.id === scene)?.processes ?? true;

export function populateScene(world, scene, material = 'water', wall = 'rock_static') {
  world.clear();
  const {width: w, height: h} = world;
  const wallId = wall === 'boundary' ? WALL : world.getMaterialId(wall) || WALL;
  world.fillRect(0, 0, 2, h, WALL);
  world.fillRect(w - 2, 0, 2, h, WALL);
  world.fillRect(0, h - 2, w, 2, WALL);
  if (scene === 'density') {
    const liquids = world.materials.filter(material => material?.type === 'Liquid')
      .sort((a, b) => b.density - a.density || a.id.localeCompare(b.id));
    const width = Math.max(0, w - 4), fillHeight = Math.round(Math.max(0, h - 2) * .9);
    const top = h - 2 - fillHeight, capacity = width * fillHeight;
    for (const [index, material] of liquids.entries()) {
      const start = Math.floor(index * capacity / liquids.length);
      const end = Math.floor((index + 1) * capacity / liquids.length);
      const id = world.getMaterialId(material.id);
      for (let cell = start; cell < end; cell++) {
        world.setCell(2 + cell % width, top + Math.floor(cell / width), id);
      }
    }
  } else if (scene === 'channels') {
    const upper = Math.floor(h * .34), lower = Math.floor(h * .66);
    world.fillRect(2, upper, Math.floor(w * .38), 2, wallId);
    world.fillRect(Math.floor(w * .48), upper, w, 2, wallId);
    world.fillRect(2, lower, Math.floor(w * .72), 2, wallId);
    world.fillRect(Math.floor(w * .82), lower, w, 2, wallId);
    world.fillRect(Math.floor(w * .08), 8, Math.floor(w * .24), Math.max(1, upper - 10), world.getMaterialId(material));
  } else if (scene === 'acid') {
    const halfWidth = Math.round(w * .3), middle = Math.floor(w / 2);
    const left = middle - halfWidth, right = middle + halfWidth;
    const top = Math.floor(h * .45), floor = top + Math.floor(h * .35) - 4;
    const glass = world.getMaterialId('glass') || WALL;
    world.fillRect(left, top, 4, floor - top, wallId);
    world.fillRect(right - 4, top, 4, floor - top, glass);
    world.fillRect(left, floor, halfWidth, 4, wallId);
    world.fillRect(middle, floor, halfWidth, 4, glass);
    world.fillRect(left + 4, top + 8, right - left - 8, floor - top - 8, world.getMaterialId('acid'));
  } else if (scene === 'ambrosia') {
    const left = Math.floor(w * .2), width = Math.floor(w * .6);
    const height = Math.max(3, Math.floor(h * .16));
    world.fillRect(left, h - 2 - height, width, height, world.getMaterialId('diamond'));
    world.fillRect(left, h - 2 - height * 2, width, height, world.getMaterialId('honey'));
  } else if (scene === 'poison-exposure') {
    const margin = Math.max(3, Math.floor(w * .1));
    const width = Math.max(8, Math.floor(w * .32));
    const height = Math.max(8, Math.floor(h * .48));
    const top = Math.floor(h * .35), poison = world.getMaterialId('poison');
    for (const left of [margin, w - margin - width]) {
      world.fillRect(left, top, width, height, WALL);
      world.fillRect(left + 2, top + 2, width - 4, height - 4, poison);
    }
    world.fillRect(w - margin - width + 2, top, width - 4, 2, 0);
  } else if (scene === 'oil-fire') {
    const x = Math.floor(w * .2), y = Math.floor(h * .7), width = Math.floor(w * .6);
    world.fillRect(x, y, width, 8, world.getMaterialId('wood_static'));
    world.fillRect(x, y - 12, width, 12, world.getMaterialId('oil'));
    world.applyEnvironmentCircle(Math.floor(w / 2), y - 12, 4, 'ignite');
  } else if (scene === 'phase') {
    const split = Math.floor(w / 2), top = Math.floor(h * .65);
    world.fillRect(split - 1, 0, 2, h, WALL);
    world.fillRect(2, top, split - 3, h - top - 2, world.getMaterialId('water'));
    world.fillRect(split + 1, top, w - split - 3, h - top - 2, world.getMaterialId('water'));
    for (let y = Math.floor(h * .5); y < h - 2; y++) {
      for (let x = 2; x < split - 1; x++) world.warmth[y * w + x] = 50;
      for (let x = split + 1; x < w - 2; x++) world.cold[y * w + x] = 50;
    }
  }
}
