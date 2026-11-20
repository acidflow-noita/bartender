import {appendFileSync} from 'node:fs';
import {publicationPlan} from './data/recipe-card-inputs.mjs';

const plan = publicationPlan();
const needed = plan.changed + plan.removed + plan.retimed > 0;
console.log(needed ? 'Preview check found ' + plan.changed + ' to render, ' + plan.retimed + ' to retime, '
    + plan.reused + ' to reuse and ' + plan.removed + ' to retire.'
  : 'Published preview inputs match for all recipes (' + plan.reused + '). Skipping the cook.');
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, 'changed=' + needed + '\nparts=' + JSON.stringify(plan.parts) + '\n');
}
if (process.argv.includes('--expect-current') && needed) process.exitCode = 3;
