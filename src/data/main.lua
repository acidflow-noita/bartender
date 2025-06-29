---@type nxml
local nxml = require("nxml")

-- Add src/data to the Lua module search path for local json.lua
package.path = package.path .. ";./src/data/?.lua"

---@alias state "COLD" | "WARM" | "HOT"

---@class (exact) material_info
---@field state state
---@field data table<string, string>

---@type table<string, material_info>
local ids_to_mats = {}

---@type table<string, boolean>
local all_properties = {}

---@param path string
local function read(path)
	local file = assert(io.open(path))
	local content = file:read("*a")
	file:close()
	return content
end

-- Special marker for null values (since Lua tables can't store nil values as keys)
local NULL = {}

-- Simple JSON encoder that ALWAYS includes all properties
local function encode_json(data)
	if type(data) == "table" then
		if data == NULL then
			return "null"
		elseif data[1] ~= nil then -- Array
			local parts = {}
			for i, v in ipairs(data) do
				parts[i] = encode_json(v)
			end
			return "[" .. table.concat(parts, ",") .. "]"
		else -- Object - use ALL keys, including NULL values
			local parts = {}
			local keys = {}
			-- Collect ALL keys that should exist
			for k in pairs(data) do
				table.insert(keys, k)
			end
			table.sort(keys)

			for _, k in ipairs(keys) do
				local v = data[k]
				local encoded_value
				if v == NULL then
					encoded_value = "null"
				else
					encoded_value = encode_json(v)
				end
				table.insert(parts, '"' .. k .. '":' .. encoded_value)
			end
			return "{" .. table.concat(parts, ",") .. "}"
		end
	elseif type(data) == "string" then
		return '"' ..
		data:gsub('\\', '\\\\'):gsub('"', '\\"'):gsub('\n', '\\n'):gsub('\r', '\\r'):gsub('\t', '\\t') .. '"'
	elseif type(data) == "number" then
		return tostring(data)
	elseif type(data) == "boolean" then
		return data and "true" or "false"
	else
		return "null"
	end
end

-- Collect all materials and properties
local material_count = 0
for node in nxml.parse_file("./src/data/materials.xml", read):each_child() do
	if node.name == "CellData" or node.name == "CellDataChild" then
		local id = assert(node:get("name"))
		if not ids_to_mats[id] then
			ids_to_mats[id] = { state = "COLD", data = node.attr }
			material_count = material_count + 1

			-- Collect all property names
			for prop_name, _ in pairs(node.attr) do
				all_properties[prop_name] = true
			end
		end
	end
end

-- Convert properties to sorted list
local property_names = {}
for prop in pairs(all_properties) do
	table.insert(property_names, prop)
end
table.sort(property_names)

-- Resolve inheritance
local function resolve_inheritance(mat)
	if mat.state == "HOT" then
		return
	end
	if mat.state == "WARM" then
		error("Cycle detected in material inheritance")
	end
	mat.state = "WARM"

	local parent_name = mat.data._parent or mat.data.parent
	if parent_name and parent_name ~= "" then
		local parent_mat = ids_to_mats[parent_name]
		if not parent_mat then
			error("Missing parent " .. parent_name)
		end

		-- Resolve parent first
		resolve_inheritance(parent_mat)

		-- Inherit properties from parent
		for k, v in pairs(parent_mat.data) do
			if mat.data[k] == nil then
				mat.data[k] = v
			end
		end
	end

	mat.state = "HOT"
end

-- Resolve all materials
for _, mat in pairs(ids_to_mats) do
	if mat.state == "COLD" then
		resolve_inheritance(mat)
	end
end

-- Ensure ALL materials have ALL properties (set missing ones to nil)
for _, mat in pairs(ids_to_mats) do
	for _, prop in ipairs(property_names) do
		if mat.data[prop] == nil then
			mat.data[prop] = nil
		end
	end
end

-- Generate output
local output = {}
for material_id, mat_info in pairs(ids_to_mats) do
	local material_data = {
		id = material_id,
		name = material_id
	}

	-- Add ALL properties from the complete property list
	for _, prop in ipairs(property_names) do
		if prop ~= "name" then -- Skip 'name' since we already set it
			local value = mat_info.data[prop]
			-- Always set the property, using NULL marker for missing values
			if value ~= nil then
				material_data[prop] = value
			else
				material_data[prop] = NULL -- This will be encoded as null in JSON
			end
		end
	end

	table.insert(output, material_data)
end

-- Sort by id
table.sort(output, function(a, b) return a.id < b.id end)

-- Write output
local file = assert(io.open("./src/data/nathan.json", "w"))
file:write(encode_json(output))
file:close()

-- Debug: check one material to see if it has all properties
local first_material = output[1]
local count = 0
local null_count = 0
for k, v in pairs(first_material) do
	count = count + 1
	if v == NULL then
		null_count = null_count + 1
	end
end
print("Processed " .. #output .. " materials with " .. #property_names .. " properties each")
print("First material actually has " .. count .. " properties (" .. null_count .. " are null)")

-- Show first 10 property names for verification
local first10 = {}
for i = 1, math.min(10, #property_names) do
	table.insert(first10, property_names[i])
end
print("First 10 properties: " .. table.concat(first10, ", "))
