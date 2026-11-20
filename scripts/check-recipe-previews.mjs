import {appendFileSync, readFileSync} from 'node:fs';
import {planRecipeInputs, publishedInputKeys, compareRecipeInputs} from './data/recipe-card-inputs.mjs';

const json = name => JSON.parse(readFileSync(new URL('../src/data/' + name, import.meta.url)));
const keys = planRecipeInputs();
const previous = publishedInputKeys(), media = json('recipe-card-media.json');
const {changed, removed, reused} = compareRecipeInputs(keys, previous, media);
const needed = changed.length + removed.length > 0;
console.log(needed ? 'Preview check found ' + changed.length + ' to render, ' + reused + ' to reuse and ' + removed.length + ' to retire.'
  : 'Published preview inputs match for all recipes (' + reused + '). Skipping the cook.');
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, 'changed=' + needed + '\nrestore=' + (needed && reused > 0) + '\n');
}
if (process.argv.includes('--expect-current') && needed) process.exitCode = 3;
