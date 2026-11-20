import {drawSidebar} from './sidebar.mjs';
import {encodeCard} from './encode.mjs';
import {recorder} from './record.mjs';
import {simulationMaterialRecords} from '../../src/liquids/materials.mjs';

export async function createCardRecorder(materials, byId) {
  const capture = await recorder(simulationMaterialRecords(materials));
  return async rule => {
    const sidebar = await drawSidebar(rule, byId);
    let seed = 1, clip = capture(rule, seed);
    while (!clip.matches && seed < 24) clip = capture(rule, ++seed);
    if (!clip.matches) throw new Error('No recorded contact for this recipe.');
    const {frames, posterIndex, matches, firstMatch, ticks} = clip;
    const {animation, poster} = await encodeCard(sidebar, frames, posterIndex);
    return {animation, poster, seed, matches, firstMatch, ticks, frames: frames.length};
  };
}
