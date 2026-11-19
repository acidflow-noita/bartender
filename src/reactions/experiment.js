import {WALL} from '../liquids/engine.mjs';
import {applyReactionEffects} from '../liquids/effects.mjs';
import {applyContactReaction, compileContactReactions} from '../liquids/reactions.mjs';

export const recipeCells = (rule, side) => [1, 2, 3].map(slot => rule[side + '_cell' + slot]).filter(Boolean);

export function prepareReactionTank(world, rule, seed = 1) {
  world.clear(seed);
  world.contactReactions = compileContactReactions(world.materials, [rule]);
  const [first, second, third] = recipeCells(rule, 'input').map(id => world.getMaterialId(id));
  const {width, height} = world;
  const left = 5, right = width - 5, bottom = height - 4, top = Math.floor(height / 3);
  world.fillRect(left - 1, 6, 1, bottom - 5, WALL);
  world.fillRect(right, 6, 1, bottom - 5, WALL);
  world.fillRect(left, bottom, right - left, 1, WALL);
  if (rule.direction === 'none') {
    // Pour the liquid onto solid terrain. The contact rule keeps its native input order.
    const solidBed = third === undefined && world.materials[first]?.type === 'Liquid' && world.materials[second]?.type === 'Solid';
    const bed = solidBed ? second : first, sample = solidBed ? first : second;
    const surface = Math.floor(height * .65);
    world.fillRect(left, surface, right - left, bottom - surface, bed);
    const center = Math.floor(width * .61);
    for (let y = 9; y < surface + 3; y++) {
      const spread = Math.max(3, y - surface + 11);
      const x = center + Math.floor((surface - y) / 4);
      world.fillRect(x - spread, y, spread * 2, 1, sample);
    }
    if (third !== undefined) {
      // Small pockets along the contact leave both neighbors within reach of slot one.
      for (let y = surface + 1; y < bottom - 1; y += 4) {
        for (let x = center - 18; x <= center + 18; x += 5) {
          world.fillRect(x - 1, y, 2, 2, second);
          world.fillRect(x + 2, y, 2, 2, third);
        }
      }
      world.paintCircle(center - 15, surface - 3, 6, third, {replace: true});
    }
    if (rule.req_lifetime > 0) {
      for (let i = 0; i < world.cells.length; i++) if (world.cells[i] === first) world.age[i] = rule.req_lifetime;
    }
    return;
  }
  const horizontal = rule.direction === 'bottom' || rule.direction === 'top';
  const reversed = rule.direction === 'top' || rule.direction === 'left';
  // Start the two samples in contact. For three ingredients, small pockets along
  // the interface give the first cell two distinct neighbors to react with.
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const along = horizontal ? x - left : y - top;
      const across = horizontal ? y - (top + bottom) / 2 : x - (left + right) / 2;
      let id = (across < 0) !== reversed ? first : second;
      if (third !== undefined && Math.abs(across) < 4 && along % 7 < 3) id = third;
      if (id) world.setCell(x, y, id);
    }
  }
}

// In the full world, burning sparks use the generic fire contact callback and
// stationary gas emitters can sleep. The recipe viewer explicitly tests their
// named table entry at a real adjacent cell before advancing the world.
export function usesDirectContact(material, rule) {
  return (material?.cell_type === 'fire' && !material.on_fire && material.id !== 'fire')
    || (material?.cell_type === 'gas' && material.liquid_static && rule.fast_reaction);
}

export function stepRecipeTank(world) {
  const rule = world.contactReactions.rules[0];
  if (rule && usesDirectContact(world.materials[rule.inputs[0]], rule)) {
    const {width, cells} = world;
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] !== rule.inputs[0]) continue;
      const side = world.random.next() & 3;
      if ((side === 0 && i % width === 0) || (side === 1 && i % width === width - 1)) continue;
      const neighbor = i + (side === 0 ? -1 : side === 1 ? 1 : side === 2 ? -width : width);
      if (cells[neighbor] !== rule.inputs[1]) continue;
      const result = applyContactReaction(world.contactReactions, world, i, neighbor, {fast: rule.fast_reaction});
      if (result) {world.reactionCount++; applyReactionEffects(world, result.effects);}
    }
  }
  world.step();
}
