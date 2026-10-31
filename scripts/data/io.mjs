import {mkdirSync, writeFileSync, renameSync, rmSync} from 'node:fs';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';

export function writeJsonAtomic(target, data) {
  target = target instanceof URL ? fileURLToPath(target) : target;
  const contents = JSON.stringify(data, null, 2) + '\n';
  const temporary = `${target}.${randomUUID()}.tmp`;
  mkdirSync(dirname(target), {recursive: true});
  try {writeFileSync(temporary, contents); renameSync(temporary, target);}
  finally {rmSync(temporary, {force: true});}
}
