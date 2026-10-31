import {readFileSync, mkdirSync, renameSync, rmSync, existsSync, copyFileSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash, randomUUID} from 'node:crypto';
import {parseArgs} from 'node:util';
import {fetchCargo, wikiEndpoint} from './data/wiki.mjs';
import {writeJsonAtomic} from './data/io.mjs';
import {digest} from './data/sources.mjs';

export const queries = {
  materials: {tables: 'Materials', fields: 'Materials.name,Materials.id,Materials.type,Materials.image,Materials.icon,Materials.pouchIcon,Materials._pageName=wikipage', group_by: 'Materials.id', order_by: 'Materials.id'},
  spells: {tables: 'Spells', fields: '_pageName=wikipage,image=image,sortKey=sortKey,tags__full=tags,name=name,id=id,description=description,type=type,manaDrain=manaDrain,uses=uses,draw=draw,damageProjectile=damageProjectile,damageMelee=damageMelee,damageElectric=damageElectric,damageFire=damageFire,damageExplosion=damageExplosion,damageIce=damageIce,damageSlice=damageSlice,damageDrill=damageDrill,damageHealing=damageHealing,damageHoly=damageHoly,radius=radius,maxDuraToDestroy=maxDuraToDestroy,rayEnergy=rayEnergy,dmgEveryXFrames=dmgEveryXFrames,spread=spread,pattern=pattern,speed=speed,speedMin=speedMin,speedMax=speedMax,speedDie=speedDie,gravity=gravity,airFriction=airFriction,mass=mass,lifetime=lifetime,lifetimeRandom=lifetimeRandom,altLifetimeMin=altLifetimeMin,altLifetimeMax=altLifetimeMax,timerLifetime=timerLifetime,hitShooterFrames=hitShooterFrames,castDelay=castDelay,rechargeDelay=rechargeDelay,spreadMod=spreadMod,speedMod=speedMod,lifetimeMod=lifetimeMod,recoil=recoil,bounces=bounces,criticalChance=criticalChance,effect=effect,spellTier__full=spellTier,spawnProbability__full=spawnProbability,unlockCondition=unlockCondition,price=price', group_by: 'Spells.id', order_by: 'Spells.id'},
  reactions: {tables: 'Reactions', fields: 'Reactions.reactionRate,Reactions.reagent1,Reactions.reagent2,Reactions.reagent3,Reactions.product1,Reactions.product2,Reactions.product3,Reactions.notes', order_by: 'Reactions._ID'},
};

export async function refreshData({output, gameData, executable, wiki = true, fetcher} = {}) {
  const snapshots = {};
  if (wiki) for (const [name, query] of Object.entries(queries)) {
    const rows = await fetchCargo(query, {fetcher});
    if (!rows.length) throw new Error(`Empty wiki ${name} snapshot`);
    if (name !== 'reactions' && new Set(rows.map(row => row.id)).size !== rows.length) throw new Error(`Duplicate wiki ${name} IDs`);
    snapshots[name] = rows;
  }
  const gameFiles = gameData ? ['materials.xml', 'scripts/gun/gun_actions.lua', 'scripts/status_effects/status_list.lua'].map(file => {
    const source = join(resolve(gameData), file), bytes = readFileSync(source);
    return {file, source, sha256: createHash('sha256').update(bytes.toString('utf8').replace(/\r\n/g, '\n')).digest('hex')};
  }) : [];
  const executableSha256 = executable ? createHash('sha256').update(readFileSync(resolve(executable))).digest('hex') : null;
  if (!wiki && !gameFiles.length) throw new Error('Provide --game-data or enable wiki refresh');
  const identity = digest({snapshots, gameFiles: gameFiles.map(({file, sha256}) => ({file, sha256})), executableSha256});
  const directory = resolve(output ?? fileURLToPath(new URL(`../build/refresh-${identity.slice(0, 16)}`, import.meta.url)));
  if (existsSync(directory)) throw new Error(`Snapshot already exists: ${directory}`);
  const temporary = `${directory}.${randomUUID()}.tmp`;
  try {
    mkdirSync(temporary, {recursive: true});
    for (const [name, rows] of Object.entries(snapshots)) writeJsonAtomic(join(temporary, `${name}-wiki.json`), rows);
    for (const {file, source} of gameFiles) {
      const target = join(temporary, 'game', file);
      mkdirSync(resolve(target, '..'), {recursive: true}); copyFileSync(source, target);
    }
    writeJsonAtomic(join(temporary, 'manifest.json'), {schemaVersion: 1, fetchedAt: new Date().toISOString(), identity,
      wiki: Object.fromEntries(Object.entries(snapshots).map(([name, rows]) => [name, {endpoint: wikiEndpoint, query: queries[name], count: rows.length, sha256: digest(rows)}])),
      game: {directory: gameData ? resolve(gameData) : null, executableSha256, textNormalization: 'CRLF to LF', files: gameFiles.map(({file, sha256}) => ({file, sha256}))}});
    renameSync(temporary, directory);
  } finally {rmSync(temporary, {recursive: true, force: true});}
  return directory;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const {values} = parseArgs({options: {output: {type: 'string'}, 'game-data': {type: 'string'}, executable: {type: 'string'}, 'no-wiki': {type: 'boolean'}}});
  console.log(await refreshData({output: values.output, gameData: values['game-data'], executable: values.executable, wiki: !values['no-wiki']}));
}
