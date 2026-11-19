import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';

const source = 'https://noita-bartender-images.acidflow.stream/images/mina/mina.png';
const expected = 'f0f0c99fa5f41f7db79c8b6a2fdd3c20d38842bf022213e2bf0199fd808f4e6e';
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--source')) throw new Error('Usage: node scripts/prepare-liquid-reference.mjs [--source /path/to/mina.png]');
let bytes;
if (args.length) bytes = readFileSync(args[1]);
else {
  const response = await fetch(source);
  if (!response.ok) throw new Error(`Could not load Minä (${response.status}).`);
  bytes = Buffer.from(await response.arrayBuffer());
}
if (createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error('Minä image does not match the unoutlined reference.');
mkdirSync(new URL('../public/liquids/', import.meta.url), {recursive: true});
writeFileSync(new URL('../public/liquids/mina.png', import.meta.url), bytes);
console.log('Prepared the unoutlined Minä reference.');
