-- Diagnostic observations only: no entity, material, RNG or world mutations.
local recorded = false
local function quote(value)
  return '"' .. string.gsub(tostring(value), '[%z\1-\31\\"]', function(character)
    if character == '"' then return '\\"' end
    if character == '\\' then return '\\\\' end
    return string.format('\\u%04x', string.byte(character))
  end) .. '"'
end
local function strings(values)
  local out = {}
  for _, value in ipairs(values) do out[#out + 1] = quote(value) end
  return '[' .. table.concat(out, ',') .. ']'
end
local function emit(value)
  print('BARTENDER_MATERIAL_PROBE_V1 ' .. value)
end
function OnWorldInitialized()
  if recorded then return end
  recorded = true
  emit('{"kind":"begin","activeMods":' .. strings(ModGetActiveModIDs()) .. '}')
  local registry = {}
  local enumerators = {
    { 'liquids', CellFactory_GetAllLiquids },
    { 'sands', CellFactory_GetAllSands },
    { 'gases', CellFactory_GetAllGases },
    { 'fires', CellFactory_GetAllFires },
    { 'solids', CellFactory_GetAllSolids },
  }
  for _, entry in ipairs(enumerators) do
    local names = entry[2](true, true)
    table.sort(names)
    emit('{"kind":"pool","name":' .. quote(entry[1] .. '_all') .. ',"materials":' .. strings(names) .. '}')
    for _, name in ipairs(names) do registry[name] = true end
  end
  for _, entry in ipairs({ enumerators[1], enumerators[2] }) do
    -- Exactly the one-argument calls made by potion_random_material.lua.
    local names = entry[2](false)
    table.sort(names)
    emit('{"kind":"pool","name":' .. quote(entry[1] .. '_flask') .. ',"materials":' .. strings(names) .. '}')
  end
  local air = CellFactory_GetName(0)
  registry[air] = true
  local names = {}
  for name in pairs(registry) do names[#names + 1] = name end
  table.sort(names)
  for _, name in ipairs(names) do
    local id = CellFactory_GetType(name)
    local tags = CellFactory_GetTags(id)
    table.sort(tags)
    emit('{"kind":"material","name":' .. quote(name) .. ',"id":' .. tostring(id)
      .. ',"roundTripName":' .. quote(CellFactory_GetName(id)) .. ',"tags":' .. strings(tags) .. '}')
  end
  emit('{"kind":"end","materialCount":' .. tostring(#names) .. '}')
end
