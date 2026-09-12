// Unmodified noita-fungal dd54fd7 logic; only import paths adapted. See NOTICE.txt.
// From Lymm's Telescope, https://github.com/Lymm37/noita-telescope/blob/main/js/fungal_shifts.js
import { NollaPrng } from './nolla-prng.js';

import { materialsFrom, materialsTo, greedOutputs, maxShifts, baseSeedY, convertMaxTries, convertFailIncrementsShiftCounter, extraUnions } from './materials.js';

// Helper Functions
function pickRandomFromTableWeighted(ws, items, rndState) {
  let table = [];
  let weightSum = 0.0;

  for (const item of items) {
    let newWeightMax = weightSum + item.probability;
    table.push({ item: item, min: weightSum, max: newWeightMax });
    weightSum = newWeightMax;
  }

  let val = randomNextFloat(ws, 0.0, weightSum, rndState);
  for (const it of table) {
    if (val >= it.min && val <= it.max) {
      return it.item;
    }
  }
  return items[0].item;
}

function randomNextFloat(seed, a, b, rndState) {
  let rng = new NollaPrng(0);
  rng.SetRandomSeed(seed, rndState.x, rndState.y);
  let result = a + ((b - a) * rng.Next());
  rndState.y += 1;
  return result;
}

function randomNext(seed, a, b, rndState) {
  let rng = new NollaPrng(0);
  rng.SetRandomSeed(seed, rndState.x, rndState.y);
  let result = rng.Random(Math.round(a), Math.round(b));
  rndState.y += 1;
  return result;
}

// mods = object : string -> version
export function getFungalShiftRetries(ws, shift_number, held, mode = "vanilla") {
  let convertTries = 0;
  let interesting_materials = [];

  while (1) {
    let seed2 = baseSeedY[mode] + shift_number + (1000 * convertTries);
    let rndState = { x: 9123, y: seed2};

    let fromItem = pickRandomFromTableWeighted(ws, materialsFrom[mode], rndState);
    let toItem = pickRandomFromTableWeighted(ws, materialsTo[mode], rndState);
    let useHeld = null;
    let greedChange = null;

    if (randomNext(ws, 1, 100, rndState) <= 75) {
      if (randomNext(ws, 1, 100, rndState) <= 50) {
        useHeld = "from";
      } else {
        const greedyMaterials = greedOutputs[mode];
        const rareRoll = greedyMaterials !== null ? randomNext(ws, 1, 1000, rndState) : 1;
        if (rareRoll === 1) {
          // Only one of gold/grass happens depending on what you are holding, so they share an RNG state.
          useHeld = "to";
          greedChange = false;
        } else if (held == "gold") {
          const prng = new NollaPrng(0);
          prng.SetRandomSeed(ws, 89346, seed2);
          const greedyIndex = Math.floor(prng.Next() * greedyMaterials.length);
          toItem = {material: greedyMaterials[greedyIndex]};
          greedChange = true;
        } else if (held == "grass_holy") {
          toItem = {material: "grass"};
          greedChange = true;
        } else {
          interesting_materials.push("gold", "grass_holy");
          useHeld = "to";
        }
      }
    }

    let fromMaterials = fromItem.materials;
    let toMaterial = toItem.material;

    // If we're called to deal with a held material, replace the correct material.
    if (useHeld == "from" && held) {
      fromMaterials = extraUnions[mode][held] || [held];
    }
    if (useHeld == "to" && held) {
      toMaterial = held;
    }

    // State = toxic -> oil, lava -> toxic (oil), hold toxic ==> shift lava -> toxic (which does nothing at all).
    // State = toxic -> oil, lava -> oil, hold toxic ==> shift lava -> toxic (which does nothing as toxic is already oil).
    // State = toxic -> oil, lava -> oil, hold oil ==> shift lava -> oil (which does nothing at all)
    // Seed: 1263167642, hold oil then have two lava to held
    // So this check is not "does the shift do anything to the world?" but "does the shift, considered alone, do anything?".
    // TL;DR we don't need to care about the world state.

    let convertedAny = false;
    if (fromMaterials.length > 1) {
      // By definition if there are multiple, at least one differs.
      convertedAny = true;
    } else {
      convertedAny = fromMaterials[0] != toMaterial;
    }

    // There are three cases:
    // * Holding something does nothing.
    // * Holding something can force one or more retries.
    // * Holding something can prevent one or more retries.
    if (!useHeld) {
      // Certainly nothing interesting here with held materials.
    } else if (held && held != "FAKE_MATERIAL") {
      // Nothing useful to do here.
    } else {
      // If we did convert something, perhaps we can prevent that.
      // If we did not convert something, perhaps we can make that happen.
      if (useHeld == "to" && fromMaterials.length == 1) {
        interesting_materials.push(fromMaterials[0]);
      } else {
        interesting_materials.push(toMaterial);
      }
    }
    if (convertTries >= convertMaxTries[mode] - 1 && convertFailIncrementsShiftCounter[mode]) {
      // Bungal shifts will generate a real shift even if nothing converts.
      convertedAny = true;
    }
    if (convertedAny) {
      return {
        shift: {
          convertTries: convertTries,
          fromMaterials: fromItem.materials,
          greedChange: greedChange,
          toMaterial: toItem.material,
          useHeld: useHeld,
        },
        interesting_materials: interesting_materials,
      };
    } else if (convertTries >= convertMaxTries[mode] - 1) {
      // TODO don't crash when we do this.
      // It's probably actually impossible though.
      console.log("Too many retries!!!", convertTries);
      console.log(convertedAny);
      console.log(fromItem);
      console.log(toItem);
      console.log(fromMaterials);
      console.log(toMaterial);
      return null;
    }
    convertTries += 1;
  }
}

export function getFungalShift(ws, shift_number, mode = "vanilla") {
  let data = getFungalShiftRetries(ws, shift_number, null, mode);
  let ret = {
    "NOTHING": data.shift,
  };
  let interesting_materials = new Set(data.interesting_materials.values());
  let data_other = getFungalShiftRetries(ws, shift_number, "FAKE_MATERIAL", mode);
  if (data_other.shift.convertTries != data.shift.convertTries || data_other.shift.useHeld) {
    ret["OTHER"] = data_other.shift;
  }
  for(let material of data_other.interesting_materials.values()) {
    interesting_materials.add(material);
  }
  for(let material of interesting_materials.values()) {
    let data2 = getFungalShiftRetries(ws, shift_number, material, mode);
    if (data2.shift.convertTries != data_other.shift.convertTries || data2.shift.greedChange) {
      // I'm relatively sure only one specific material can ever do anything, excepting greed.
      ret[material] = data2.shift;
    }
  }
  return ret;
}
let maxLength = 1;

export function getFungalShifts(seed, ngPlusCount = 0, mode = "vanilla") {
  let shifts = [];
  for(let i=0; i<maxShifts[mode]; i++) {
    shifts.push(getFungalShift(seed + ngPlusCount, i, mode));
  }
  return shifts;
}
