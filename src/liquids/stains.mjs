const f = Math.fround;

// Palette reads can be pending when the brush first introduces a texture. Keep
// the paint operation on this cell until its original texel becomes available.
export function pendingColor(ready) {
  const color = {value: undefined, ready: null};
  color.ready = ready.then(value => (color.value = value));
  return color;
}

export function resolvedColor(color) {
  return typeof color === 'number' ? color : color?.value;
}

function blend(source, destination, weight) {
  if (source === destination) return destination;
  const inverse = f(1 - weight);
  const byte = shift => Math.trunc(f(((source >>> shift) & 255) * weight)) + Math.trunc(f(((destination >>> shift) & 255) * inverse));
  return ((destination & 0xff000000) | (byte(16) << 16) | (byte(8) << 8) | byte(0)) >>> 0;
}

export function stainColor(mode, original, current, pigment) {
  const base = resolvedColor(original), before = resolvedColor(current), tint = resolvedColor(pigment);
  if (base === undefined || before === undefined || tint === undefined) {
    return pendingColor(Promise.all([original, current, pigment].map(color => color?.ready ?? color))
      .then(([a,b,c]) => stainColor(mode, a, b, c)));
  }
  let result = before;
  if (mode & 1) {
    const darken = shift => Math.trunc(f(f(f(((base >>> shift) & 255) / 255) * f(.7)) * 255));
    const wet = ((base & 0xff000000) | (darken(16) << 16) | (darken(8) << 8) | darken(0)) >>> 0;
    result = blend(wet, result, f(.1));
  }
  if (mode & 2) result = blend(tint, result, f(.2));
  if (mode & 4) result = blend(blend(tint, base, f(.5)), result, f(.2));
  return result;
}

// CLiquidCell 0x70ce40 checks one neighbor before moving. These RNG draws
// affect where the liquid flows even when the two materials cannot stain.
export function stainContact(world, index, source) {
  if ((world.random.next() & 127) < 95) return;
  const direction = world.random.integer(2), x = index % world.width, y = Math.floor(index / world.width);
  const target = world._index(x + (direction === 0 ? -1 : direction === 1 ? 1 : 0), y + Number(direction === 2));
  const targetId = world.cells[target], material = world.materials[targetId];
  if (!material?.stainable || world.kind[targetId] === 2 || world.kind[targetId] === 4) return;
  if (world.kind[targetId] === 1 && !material.liquid_sand && !(source.liquid_stains_self && targetId === world.cells[index])) return;
  const original = world.formationColor[target] || world.sampleColor(world.colorMaterial[target], world.colorOrigin[target]);
  const current = world.stain[target] ?? original;
  const pigment = world.customPigments[world.cells[index]] ?? world.stain[index]
    ?? ((source.liquid_stains & 6) ? world.sampleColor(world.colorMaterial[index], world.colorOrigin[index]) : 0);
  world.stain[target] = stainColor(source.liquid_stains, original, current, pigment);
}
