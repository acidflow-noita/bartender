-- parser.lua
-- Requires nxml.lua and json.lua in the same directory

-- Add the script's own directory to the package path
local script_path = debug.getinfo(1, "S").source:match("@?(.*/)")
if not script_path then
    -- Try Windows path separator
    script_path = debug.getinfo(1, "S").source:match("@?(.*\\)")
end

if script_path then
    -- Clean up the path (remove @ prefix if present)
    script_path = script_path:gsub("^@", "")
    package.path = package.path .. ';' .. script_path .. '?.lua'
    print("Debug: Added to package.path: " .. script_path .. "?.lua")
else
    print("Debug: Could not determine script path, using current directory")
end

-- Try to require the modules
local nxml_ok, nxml = pcall(require, "nxml")
if not nxml_ok then
    print("Error: Could not load nxml module: " .. tostring(nxml))
    print("Make sure nxml.lua is in the same directory as this script")
    return
end

local json_ok, json = pcall(require, "json")
if not json_ok then
    print("Error: Could not load json module: " .. tostring(json))
    print("Make sure json.lua is in the same directory as this script")
    return
end

-- Try to find and open materials.xml
local xml_file_path = "materials.xml"
local f = io.open(xml_file_path, "r")
if not f and script_path then
    xml_file_path = script_path .. "materials.xml"
    f = io.open(xml_file_path, "r")
end

if not f then
    print("Error: Could not open materials.xml")
    print("Tried locations:")
    print("  - ./materials.xml")
    if script_path then
        print("  - " .. script_path .. "materials.xml")
    end
    print("Make sure materials.xml exists in one of these locations.")
    return
end

print("Debug: Reading XML from: " .. xml_file_path)
local xml_data = f:read("*a")
f:close()

local root, errs = nxml.parse(xml_data)

if not root then
    print("Error parsing XML:")
    for _, err in ipairs(errs) do
        print(string.format("  - [Type: %s, Line: %d, Col: %d] %s", err.type, err.row, err.col, err.msg))
    end
    return
end

local materials = {}
local all_properties = {}
local seen_materials = {} -- Track duplicates

-- Find the <Materials> tag and iterate over its children
-- Note: Adjusted to handle the actual XML structure
local function process_element(element)
    if element.name == "CellData" or element.name == "CellDataChild" then
        local material = {}
        material.type = element.name

        -- Copy attributes
        for k, v in pairs(element.attr) do
            material[k] = v
            all_properties[k] = true
        end

        -- Handle nested tags (like Graphics, ParticleEffect, etc.)
        if element.children and #element.children > 0 then
            for _, child_element in ipairs(element.children) do
                local prefix = child_element.name:lower()
                for k, v in pairs(child_element.attr) do
                    local prop_name = prefix .. "_" .. k
                    material[prop_name] = v
                    all_properties[prop_name] = true
                end
            end
        end

        -- Handle duplicates
        if material.name then
            if seen_materials[material.name] then
                print("Warning: Duplicate material '" .. material.name .. "' found - skipping duplicate")
                return
            else
                seen_materials[material.name] = true
            end
        end

        table.insert(materials, material)
    end

    -- Recursively process children
    if element.children then
        for _, child in ipairs(element.children) do
            process_element(child)
        end
    end
end

-- Process the root element and all its children
process_element(root)

if #materials == 0 then
    print("Warning: No CellData or CellDataChild elements found in the XML")
    print("Root element name: " .. root.name)
    print("Root children count: " .. #root.children)
end

-- Determine output path
local output_path = "materials.json"
if script_path then
    output_path = script_path .. "materials.json"
end

-- Save to materials.json
local f_out = io.open(output_path, "w")
if not f_out then
    print("Error: Could not open " .. output_path .. " for writing")
    return
end

local json_str = json.encode(materials)
f_out:write(json_str)
f_out:close()

print("Successfully parsed materials.xml and created " .. output_path)
print("Found " .. #materials .. " materials")

-- Debug: Print all unique properties found
print("\n--- All Unique Properties Found ---")
local props_list = {}
for k, _ in pairs(all_properties) do
    table.insert(props_list, k)
end
table.sort(props_list)
for _, prop in ipairs(props_list) do
    print(prop)
end
