import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';

const source = 'https://noita-bartender-images.acidflow.stream/images/mina/mina_outline.png';
const expected = '0752f1291ba995fe7a97252717eb98cbbc4a01005d1bad90a0e0bdade067f55d';
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--source')) throw new Error('Usage: node scripts/prepare-liquid-reference.mjs [--source /path/to/mina_outline.png]');
let bytes;
if (args.length) bytes = readFileSync(args[1]);
else {
  const response = await fetch(source);
  if (!response.ok) throw new Error(`Could not load Minä (${response.status}).`);
  bytes = Buffer.from(await response.arrayBuffer());
}
if (createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error('Minä image does not match the outlined reference.');
mkdirSync(new URL('../public/liquids/', import.meta.url), {recursive: true});
writeFileSync(new URL('../public/liquids/mina_outline.png', import.meta.url), bytes);
console.log('Prepared the outlined Minä reference.');
