// Original noita-fungal regression cases (CC0); see src/fungal/NOTICE.txt.
import { getFungalShift } from "../src/fungal/shifts.js";

import { strict as assert } from 'node:assert';

export function weird_retries() {
  // Weird retries, verified.
  assert.deepEqual(
    getFungalShift(600, 0),
    {
      NOTHING: {
        convertTries: 1,
        fromMaterials: [ 'water', 'water_static', 'water_salt', 'water_ice' ],
        greedChange: null,
        toMaterial: 'lava',
        useHeld: 'from'
      },
      OTHER: {
        convertTries: 0,
        fromMaterials: [ 'lava' ],
        greedChange: null,
        toMaterial: 'lava',
        useHeld: 'from'
      },
      lava: {
        convertTries: 2,
        fromMaterials: [ 'blood_cold', 'blood_worm' ],
        greedChange: null,
        toMaterial: 'water_swamp',
        useHeld: 'from'
      }
    },
  )

  assert.deepEqual(
    getFungalShift(941961, 0),
    {
      NOTHING: {
        convertTries: 1,
        fromMaterials: [ 'acid' ],
        greedChange: null,
        toMaterial: 'silver',
        useHeld: 'to'
      },
      OTHER: {
        convertTries: 0,
        fromMaterials: [ 'acid' ],
        greedChange: null,
        toMaterial: 'acid',
        useHeld: 'from'
      },
      acid: {
        convertTries: 2,
        fromMaterials: [ 'blood_fungi', 'fungi', 'fungisoil' ],
        greedChange: null,
        toMaterial: 'water',
        useHeld: null
      }
    },
  );
}

export function greedy_change() {
  // Greedy change test
  assert.deepEqual(
    getFungalShift(1, 0),
    {
      NOTHING: {
        convertTries: 0,
        fromMaterials: [ 'sand' ],
        greedChange: null,
        toMaterial: 'alcohol',
        useHeld: 'to'
      },
      OTHER: {
        convertTries: 0,
        fromMaterials: [ 'sand' ],
        greedChange: null,
        toMaterial: 'alcohol',
        useHeld: 'to'
      },
      gold: {
        convertTries: 0,
        fromMaterials: [ 'sand' ],
        greedChange: true,
        toMaterial: 'pea_soup',
        useHeld: null
      },
      grass_holy: {
        convertTries: 0,
        fromMaterials: [ 'sand' ],
        greedChange: true,
        toMaterial: 'grass',
        useHeld: null
      },
      sand: {
        convertTries: 1,
        fromMaterials: [ 'magic_liquid_polymorph', 'magic_liquid_unstable_polymorph' ],
        greedChange: null,
        toMaterial: 'oil',
        useHeld: 'to'
      }
    }
  );
}

export function greedy_success() {
  // Greedy success shifts.
  // * Should not have "gold" or "grass_holy" as materials (these are never retry-eligible source materials, so).
  // * Should have OTHER as greedChange === false.
  assert.deepEqual(
    getFungalShift(3073, 0),
    {
      NOTHING: {
        convertTries: 0,
        fromMaterials: [ 'silver', 'brass', 'copper' ],
        greedChange: false,
        toMaterial: 'sand',
        useHeld: 'to'
      },
      OTHER: {
        convertTries: 0,
        fromMaterials: [ 'silver', 'brass', 'copper' ],
        greedChange: false,
        toMaterial: 'sand',
        useHeld: 'to'
      }
    }
  );
  assert.deepEqual(
    getFungalShift(5459, 0),
    {
      NOTHING: {
        convertTries: 0,
        fromMaterials: [ 'blood' ],
        greedChange: false,
        toMaterial: 'alcohol',
        useHeld: 'to'
      },
      OTHER: {
        convertTries: 0,
        fromMaterials: [ 'blood' ],
        greedChange: false,
        toMaterial: 'alcohol',
        useHeld: 'to'
      },
      blood: {
        convertTries: 1,
        fromMaterials: [ 'lava' ],
        greedChange: null,
        toMaterial: 'material_confusion',
        useHeld: 'from'
      }
    }
  );
}

export function greed_change_retry() {
  // Bestiary: It's a greed change which retries on nothing.
  // Noitool can't see this one.
  assert.deepEqual(
    getFungalShift(405591, 0),
    {
      NOTHING: {
        convertTries: 1,
        fromMaterials: [ 'silver', 'brass', 'copper' ],
        greedChange: null,
        toMaterial: 'vomit',
        useHeld: 'to'
      },
      OTHER: {
        convertTries: 0,
        fromMaterials: [ 'lava' ],
        greedChange: false,
        toMaterial: 'lava',
        useHeld: 'to'
      },
      lava: {
        convertTries: 1,
        fromMaterials: [ 'silver', 'brass', 'copper' ],
        greedChange: null,
        toMaterial: 'vomit',
        useHeld: 'to'
      }
    }
  );
}
