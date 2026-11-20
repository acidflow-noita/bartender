import {createCanvas, loadImage} from '@napi-rs/canvas';
import {fileURLToPath} from 'node:url';
import {LiquidWorld} from '../../src/liquids/engine.mjs';
import {createLiquidRenderer} from '../../src/liquids/renderer.mjs';
import {RECIPE_TANK, prepareReactionTank, recipeCells, stepRecipeTank} from '../../src/reactions/experiment.js';
import {CLIP_TICKS} from './timing.mjs';

export async function recorder(materials) {
  const world = new LiquidWorld({...RECIPE_TANK, materials});
  const canvas = createCanvas(world.width, world.height);
  const matte = createCanvas(world.width, world.height).getContext('2d');
  matte.fillStyle = '#000';
  const images = {
    canvas: () => createCanvas(1, 1),
    load: url => loadImage(fileURLToPath(new URL('../../public' + url, import.meta.url))),
  };
  const renderer = createLiquidRenderer(canvas, world, images);
  await renderer.preloadAll();
  if (renderer.failed.length || renderer.referenceFailed) throw new Error('Missing simulation artwork: ' + renderer.failed.join(', '));
  const capture = () => {
    renderer.draw();
    matte.fillRect(0, 0, world.width, world.height);
    matte.drawImage(canvas, 0, 0);
    return matte.getImageData(0, 0, world.width, world.height).data;
  };
  return (rule, seed = 1) => {
    prepareReactionTank(world, rule, seed);
    const frames = [], scores = [];
    const inputs = new Set(recipeCells(rule, 'input'));
    const products = [...new Set(recipeCells(rule, 'output'))].filter(id => id !== 'air' && !inputs.has(id)).map(id => world.getMaterialId(id));
    let firstMatch = -1, openingFrames, openingScores;
    // One image per native tick. Keep enough history to include a late first contact.
    for (let tick = 0;; tick++) {
      if (tick) {stepRecipeTank(world); renderer.advance();}
      if (world.reactionCount && firstMatch < 0) firstMatch = tick;
      frames.push(capture());
      const counts = world.countMaterials();
      const productCounts = products.map(id => counts.get(id) ?? 0);
      const visible = productCounts.filter(Boolean);
      const score = visible.length * 10000 + visible.reduce((sum, n) => sum + n, 0);
      scores.push(score || (counts.size ? Math.min(world.reactionCount, 1000) * .001 : -1));
      if (tick === CLIP_TICKS && firstMatch < 0) {openingFrames = frames.slice(); openingScores = scores.slice();}
      if (frames.length > CLIP_TICKS + 1) {frames.shift(); scores.shift();}
      if (tick >= CLIP_TICKS && (firstMatch >= 0 && tick >= firstMatch + 72 || tick >= 600 || counts.size === 0)) break;
    }
    const clip = firstMatch < 0 ? openingFrames : frames;
    const ranked = firstMatch < 0 ? openingScores : scores;
    let posterIndex = Math.floor(clip.length * .6);
    for (let i = 0; i < ranked.length; i++) if (ranked[i] > ranked[posterIndex]) posterIndex = i;
    return {frames: clip, posterIndex, matches: world.reactionCount, firstMatch, ticks: world.tick};
  };
}
