import * as fs from "fs";
import {pathToFileURL} from "node:url";
import {fetchCargo} from "../../scripts/data/wiki.mjs";
import {queries} from "../../scripts/refresh-data.mjs";
import {writeJsonAtomic} from "../../scripts/data/io.mjs";
import {optionalNumber} from "./spell-data.js";

// Fetch data from the API
export async function fetchSpells() {
  return (await fetchCargo(queries.spells)).map(parseSpell);
}

// Extract and process the data
export function parseSpell(spell) {
  // Process specific fields according to their expected types
  return {
    wikipage: spell.wikipage || "",
    image: spell.image || "",
    sortKey: spell.sortKey || "",
    tags: spell.tags ? spell.tags.split(",").map((tag) => tag.trim()) : [],
    name: spell.name || "",
    id: spell.id || "",
    description: spell.description || "",
    type: spell.type || "",
    manaDrain: parseFloat(spell.manaDrain) || 0,
    uses: parseInt(spell.uses) || 0,
    draw: parseInt(spell.draw) || 0,
    damageProjectile: parseFloat(spell.damageProjectile) || 0,
    damageMelee: parseFloat(spell.damageMelee) || 0,
    damageElectric: parseFloat(spell.damageElectric) || 0,
    damageFire: parseFloat(spell.damageFire) || 0,
    damageExplosion: parseFloat(spell.damageExplosion) || 0,
    damageIce: parseFloat(spell.damageIce) || 0,
    damageSlice: parseFloat(spell.damageSlice) || 0,
    damageDrill: parseFloat(spell.damageDrill) || 0,
    damageHealing: parseFloat(spell.damageHealing) || 0,
    damageHoly: parseFloat(spell.damageHoly) || 0,
    radius: optionalNumber(spell.radius),
    maxDuraToDestroy: optionalNumber(spell.maxDuraToDestroy),
    rayEnergy: optionalNumber(spell.rayEnergy),
    dmgEveryXFrames: parseInt(spell.dmgEveryXFrames) || 0,
    spread: parseFloat(spell.spread) || 0,
    pattern: parseFloat(spell.pattern) || 0,
    speed: spell.speed || "",
    speedMin: optionalNumber(spell.speedMin),
    speedMax: optionalNumber(spell.speedMax),
    speedDie: optionalNumber(spell.speedDie),
    gravity: optionalNumber(spell.gravity),
    airFriction: optionalNumber(spell.airFriction),
    mass: optionalNumber(spell.mass),
    lifetime: parseInt(spell.lifetime) || 0,
    lifetimeRandom: parseInt(spell.lifetimeRandom) || 0,
    altLifetimeMin: parseInt(spell.altLifetimeMin) || 0,
    altLifetimeMax: parseInt(spell.altLifetimeMax) || 0,
    timerLifetime: parseInt(spell.timerLifetime) || 0,
    hitShooterFrames: parseInt(spell.hitShooterFrames) || 0,
    castDelay: spell.castDelay || "",
    rechargeDelay: spell.rechargeDelay || "",
    spreadMod: spell.spreadMod || "",
    speedMod: spell.speedMod || "",
    lifetimeMod: spell.lifetimeMod || "",
    recoil: spell.recoil || "",
    bounces: spell.bounces || "",
    criticalChance: spell.criticalChance || "",
    effect: spell.effect || "",
    spellTier: spell.spellTier ? spell.spellTier.split(",").map((tier) => tier.trim()) : [],
    spawnProbability: spell.spawnProbability ? spell.spawnProbability.split(",").map((prob) => prob.trim()) : [],
    unlockCondition: spell.unlockCondition || "",
    price: parseInt(spell.price) || 0,
  };
}

// Save to file as an array of objects
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const data = await fetchSpells();
  writeJsonAtomic(new URL("./spells.json", import.meta.url), data);
  console.log(`Successfully saved ${data.length} spells to spells.json`);
}
