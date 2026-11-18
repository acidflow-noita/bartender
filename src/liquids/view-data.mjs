export const BRUSH_TYPES = ['Liquid', 'Powder', 'Gas', 'Fire'];
export const WALL_MATERIALS = [
  {id: 'rock_static', name: 'Rock'}, {id: 'wood_static', name: 'Wood'},
  {id: 'steel_static', name: 'Steel'}, {id: 'boundary', name: 'Boundary'},
];

export function materialPropertyRows(material) {
  if (!material) return [['type', 'Type', 'Boundary']];
  const rows = [['type', 'Type', material.type]];
  const fields = material.type === 'Gas'
    ? [['gas_speed', 'Speed'], ['gas_upwards_speed', 'Upward speed'], ['gas_horizontal_speed', 'Sideways speed'], ['gas_downwards_speed', 'Downward speed']]
    : material.type === 'Fire' ? [['temperature_of_fire', 'Fire strength']]
    : material.type === 'Solid' ? [['density', 'Density'], ['hardness', 'Hardness']]
    : [['density', 'Density'], ['liquid_gravity', 'Gravity'], ...(material.liquid_sand || material.liquid_slime
      ? [['liquid_viscosity', 'Viscosity']] : [['liquid_damping', 'Damping'], ['liquid_flow_speed', 'Flow speed']]),
      ...(material.liquid_sand ? [['liquid_sticks_to_ceiling', 'Ceiling adhesion']] : [])];
  for (const [key, label] of fields) rows.push([key, label, material[key]]);
  rows.push(['burnable', 'Burnable', material.burnable ? 'Yes' : 'No']);
  if (material.burnable) rows.push(['fire_hp', 'Fire HP', material.fire_hp]);
  if (!['Solid', 'Fire'].includes(material.type)) rows.push(['lifetime', 'Lifetime limit', material.lifetime > 0 ? `${material.lifetime} ${material.type === 'Gas' ? 'moves' : 'ticks'}` : 'None']);
  return rows;
}

export function cellReadout(world, point) {
  if (!point) return '';
  const x = Math.max(0, Math.min(world.width - 1, Math.floor(point.x)));
  const y = Math.max(0, Math.min(world.height - 1, Math.floor(point.y)));
  const index = y * world.width + x;
  const id = world.cells[index];
  const material = world.materials[id];
  const fields = [material?.name ?? (id === 65535 ? 'Boundary' : 'Air')];
  if (world.processes !== false && world.burning?.[index]) fields.push(`burning, strength ${world.fireTemperature[index]}`);
  if (material?.type !== 'Fire' && material?.lifetime > 0) fields.push(`${Math.max(0, material.lifetime - world.age[index])} ${material.type === 'Gas' ? 'moves' : 'ticks'} left`);
  if (world.warmth?.[index]) fields.push(`warmth ${world.warmth[index]}`);
  if (world.cold?.[index]) fields.push(`cold ${world.cold[index]}`);
  return fields.join(', ');
}
