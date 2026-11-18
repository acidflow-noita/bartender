// Project the resolved runtime values without converting units or replacing zero.
// The engine consumes these same snake_case property names.
export const LIQUID_MATERIAL_FIELDS = [
  'id', 'name', 'type', 'cell_type', 'image_local', 'wikipage', 'density',
  'liquid_gravity', 'liquid_viscosity', 'liquid_damping', 'liquid_flow_speed',
  'liquid_slime', 'liquid_static', 'liquid_sand', 'liquid_sticks_to_ceiling',
  'graphics', 'gfx_glow', 'gfx_glow_color',
];

export const WORLD_RENDER_IMAGES = {
  burning: 'data/materials_gfx/colors_lava.bmp',
  fire: 'data/materials_gfx/colors_fire.png',
  fireGlow: 'data/materials_gfx/colors_fire_glow.png',
  particleGlow: 'data/particles/particle_glow.png',
};

// The tank shows newly frozen water with the dominant ice.png swatch.
// Placed ice and other frozen materials keep their authored texels.
export function formationColor(previous, next) {
  if (next?.id !== 'ice_static') return 0;
  const water = previous?.id === 'water' || previous?.id === 'water_static' || previous?.tags?.includes('[water]');
  return water ? 0x544d91b2 : 0;
}

export function liquidMaterialRecords(materials) {
  return materials.filter(material => material.type === 'Liquid').map(material =>
    Object.fromEntries(LIQUID_MATERIAL_FIELDS.filter(key => Object.hasOwn(material, key))
      .map(key => [key, material[key]])));
}

export const SIMULATION_MATERIAL_FIELDS = [...new Set([...LIQUID_MATERIAL_FIELDS,
  'initial_id', 'liquid_sand_never_box2d', 'platform_type', 'solid_static_type',
  'burnable', 'on_fire', 'fire_hp', 'autoignition_temperature', 'hundred_minus_autoignition_temp',
  'temperature_of_fire', 'generates_smoke', 'generates_flames', 'requires_oxygen',
  'on_fire_convert_to_material', 'on_fire_flame_material', 'on_fire_smoke_material',
  'cold_freezes_to_material_name', 'cold_freezes_chance_rev',
  'cold_freezes_to_dont_do_reverse_reaction', 'warmth_melts_to_material', 'warmth_melts_chance_rev',
  'lifetime', 'gas_speed', 'gas_upwards_speed', 'gas_horizontal_speed', 'gas_downwards_speed',
  'max_reaction_probability', 'max_fast_reaction_probability',
  'durability', 'hardness', 'explosion_config', 'tags', 'particle_effect',
  'stainable', 'liquid_stains', 'liquid_stains_self', 'liquid_stains_custom_color',
])];

export function simulationMaterialRecords(materials) {
  return materials.filter(material => material.id !== 'air').map(material =>
    Object.fromEntries(SIMULATION_MATERIAL_FIELDS.filter(key => Object.hasOwn(material, key))
      .map(key => [key, material[key]])));
}

function randomTextureCoordinate(seed, shift) {
  const value = (Math.imul((seed >> 13) ^ seed, 214013) + 2531011) | 0;
  const sample = ((value >> ((shift & 15) + 1)) ^ value) & 0x7fff;
  return Math.trunc((sample - 16383) / 64);
}

// CellFactory 0x7044a0 samples on creation or conversion. Randomized
// textures use a coordinate hash, independent of the simulation RNG.
export function textureOffset(x, y, width, height, randomized = false) {
  if (randomized) {
    x = randomTextureCoordinate((Math.imul(y, 91) + x + 0x37e40772) | 0, x + 13);
    y = randomTextureCoordinate((Math.imul(x, 91) + y - 0x6113652a) | 0, y + 5);
  }
  const u = ((x % width) + width) % width, v = ((y % height) + height) % height;
  return (v * width + u) * 4;
}

export function materialRGBA(material) {
  const argb = packedMaterialColor(material?.graphics?.color, 0xffc0c0c0);
  return [(argb >>> 16) & 255, (argb >>> 8) & 255, argb & 255, argb >>> 24];
}

export function packedMaterialColor(value, fallback = 0) {
  if (Number.isFinite(value)) return value >>> 0;
  const match = typeof value === 'string' && /^(?:#|0x)?([\da-f]{8})$/i.exec(value);
  return match ? Number.parseInt(match[1], 16) >>> 0 : fallback;
}

export function liquidTextureUrl(material) {
  const path = material?.graphics?.texture_file;
  if (!path || material.graphics.normal_mapped) return null;
  if (!/^data\/materials_gfx\/[\w-]+\.png$/.test(path)) return null;
  return `/liquids/textures/${path.slice(path.lastIndexOf('/') + 1)}`;
}
