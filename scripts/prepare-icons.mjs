import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';

const names = ['arrow-counterclockwise', 'arrow-down', 'arrow-up', 'box-arrow-up-right', 'copy', 'download',
  'eye', 'eye-slash', 'fullscreen', 'fullscreen-exit', 'github', 'list', 'plus-lg', 'sliders', 'tag', 'x-lg'];
const paths = Object.fromEntries(names.map(name => {
  const svg = readFileSync(new URL(`../node_modules/bootstrap-icons/icons/${name}.svg`, import.meta.url), 'utf8');
  const body = svg.match(/<svg\b[^>]*>([\s\S]*?)<\/svg>/)?.[1];
  if (!body) throw new Error(`Invalid Bootstrap icon: ${name}`);
  return [name, body.trim()];
}));
const output = new URL('../src/generated/bootstrap-icons.js', import.meta.url);
const license = readFileSync(new URL('../node_modules/bootstrap-icons/LICENSE', import.meta.url), 'utf8');
const content = `/*! Bootstrap Icons\n${license}*/\nexport const iconPaths = ${JSON.stringify(paths)};\n`;
mkdirSync(new URL('../src/generated/', import.meta.url), {recursive: true});
let previous;
try { previous = readFileSync(output, 'utf8'); } catch {}
if (previous !== content) writeFileSync(output, content);
