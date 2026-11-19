import {createCanvas, loadImage} from '@napi-rs/canvas';
import {fileURLToPath} from 'node:url';
import {LiquidWorld} from '../../src/liquids/engine.mjs';
import {createLiquidRenderer} from '../../src/liquids/renderer.mjs';
import {prepareReactionTank, recipeCells, stepRecipeTank} from '../../src/reactions/experiment.js';

export async function recorder(materials) {
  const world = new LiquidWorld({width: 96, height: 56, materials});
  const canvas = createCanvas(world.width, world.height), ctx = canvas.getContext('2d');
  const images = {
    canvas: () => createCanvas(1, 1),
    load: url => loadImage(fileURLToPath(new URL('../../public' + url, import.meta.url))),
  };
  const renderer = createLiquidRenderer(canvas, world, images);
  await renderer.preloadAll();
  if (renderer.failed.length || renderer.referenceFailed) throw new Error('Missing simulation artwork: ' + renderer.failed.join(', '));
  const capture = () => {
    renderer.draw();
    const pixels = ctx.getImageData(0, 0, world.width, world.height).data;
    for (let i = 0; i < pixels.length; i += 4) {
      const a = pixels[i + 3] / 255;
      for (let c = 0; c < 3; c++) pixels[i + c] *= a;
      pixels[i + 3] = 255;
    }
    return pixels;
  };
  return (rule, seed = 1) => {
    prepareReactionTank(world, rule, seed);
    const frames = [], scores = [];
    const inputs = new Set(recipeCells(rule, 'input'));
    const products = [...new Set(recipeCells(rule, 'output'))].filter(id => id !== 'air' && !inputs.has(id)).map(id => world.getMaterialId(id));
    let firstMatch = -1, openingFrames, openingScores;
    // Sample real 60 Hz ticks at 10 fps. For a slow reaction keep the contact and its aftermath in the recorded window.
    for (let tick = 0;; tick += 6) {
      if (tick) for (let n = 0; n < 6; n++) {stepRecipeTank(world); renderer.advance();}
      if (world.reactionCount && firstMatch < 0) firstMatch = tick;
      frames.push(capture());
      const counts = world.countMaterials();
      const productCounts = products.map(id => counts.get(id) ?? 0);
      const visible = productCounts.filter(Boolean);
      const score = visible.length * 10000 + visible.reduce((sum, n) => sum + n, 0);
      scores.push(score || (counts.size ? Math.min(world.reactionCount, 1000) * .001 : -1));
      if (tick === 144) {openingFrames = frames.slice(); openingScores = scores.slice();}
      if (frames.length > 25) {frames.shift(); scores.shift();}
      if (tick >= 144 && (firstMatch >= 0 && tick >= firstMatch + 72 || tick >= 600 || counts.size === 0)) break;
    }
    const clip = firstMatch < 0 ? openingFrames : frames;
    const ranked = firstMatch < 0 ? openingScores : scores;
    let posterIndex = Math.floor(clip.length * .6);
    for (let i = 0; i < ranked.length; i++) if (ranked[i] > ranked[posterIndex]) posterIndex = i;
    return {frames: clip, posterIndex, matches: world.reactionCount, firstMatch, ticks: world.tick};
  };
}
