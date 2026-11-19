import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {copyFileSync, linkSync, mkdirSync, readFileSync, writeFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {recipeCard, withRecipeMetadata} from '../src/reactions/social.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const cache = join(root, 'build/recipe-cards/site/recipe-media');
const dist = join(root, 'dist'), target = join(dist, 'recipe-media'), pages = join(dist, 'reactions');
const catalog = JSON.parse(readFileSync(join(root, 'src/generated/recipe-social.json')));
const template = readFileSync(join(dist, 'reactions.html'), 'utf8');
mkdirSync(pages, {recursive: true}); mkdirSync(target, {recursive: true});
for (const [id, record] of Object.entries(catalog)) {
  const card = recipeCard(id, catalog);
  writeFileSync(join(pages, id + '.html'), withRecipeMetadata(template, card));
  const digest = createHash('sha256');
  for (const [ext, limit] of [['webp', 9_900_000], ['png', 4_999_999]]) {
    const name = id + '-' + record.version + '.' + ext, src = join(cache, name), dst = join(target, name);
    const bytes = readFileSync(src), size = bytes.length;
    digest.update(bytes);
    if (ext === 'webp') {
      const image = await sharp(bytes, {animated: true}).metadata();
      if (image.format !== 'webp' || image.width !== 960 || image.pageHeight !== 480 || !(image.pages >= 2) || image.loop !== 0)
        throw new Error('Invalid animated recipe card: ' + name);
    } else if (bytes.toString('hex', 0, 8) !== '89504e470d0a1a0a' || bytes.readUInt32BE(16) !== 960 || bytes.readUInt32BE(20) !== 480)
      throw new Error('Invalid recipe poster: ' + name);
    if (size === 0 || size > limit) throw new Error('Invalid card file size: ' + name);
    try {linkSync(src, dst);} catch (error) {
      if (error.code === 'EXDEV' || error.code === 'EPERM') copyFileSync(src, dst);
      else if (error.code !== 'EEXIST') throw error;
    }
  }
  if (digest.digest('hex').slice(0, 20) !== record.version) throw new Error('Recipe media digest mismatch: ' + id);
}
const files = readdirSync(dist, {recursive: true, withFileTypes: true}).filter(e => e.isFile()).length;
if (files > 20_000) throw new Error('Build exceeds the free Workers Static Assets limit: ' + files + ' files.');
console.log('Built ' + Object.keys(catalog).length + ' static recipe pages with WebP loops and posters. Total site assets: ' + files);
