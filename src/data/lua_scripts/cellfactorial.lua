function enhanceMaterialData(material_name)
    local material_id = CellFactory_GetType(material_name)
    local ui_name = CellFactory_GetUIName(material_id)
    local translated_name = GameTextGetTranslatedOrNot(ui_name)

    return {
        name = material_name,
        id = material_id,
        ui_name = ui_name,
        translated_name = translated_name
    }
end

function writeEnhancedMaterialsToFile(materials, filename)
    local f = io.open("mods/component-explorer/data/" .. filename, "w")
    if not f then
        print("Error: Could not open " .. filename .. " for writing")
        return
    end

    f:write("[\n")
    for i, material in ipairs(materials) do
        local enhanced = enhanceMaterialData(material)
        f:write("  {\n")
        f:write('    "name": "' .. enhanced.name .. '",\n')
        f:write('    "id": ' .. enhanced.id .. ',\n')
        f:write('    "ui_name": "' .. enhanced.ui_name .. '",\n')
        f:write('    "translated_name": "' .. enhanced.translated_name .. '"\n')
        f:write("  }" .. (i == #materials and "\n" or ",\n"))
    end
    f:write("]\n")
    f:close()
    print("Enhanced data written to " .. filename)
end

function getALLLLLLLL()
    -- Clear the original factorial.txt file
    local f = io.open("mods/component-explorer/data/factorial.txt", "w")
    if f then
        f:close()
    end

    local full_list = ""
    local material_types = {
        { materials = CellFactory_GetAllLiquids(true, true), filename = "enhanced_liquids.json" },
        { materials = CellFactory_GetAllSands(true, true),   filename = "enhanced_sands.json" },
        { materials = CellFactory_GetAllGases(true, true),   filename = "enhanced_gases.json" },
        { materials = CellFactory_GetAllFires(true, true),   filename = "enhanced_fires.json" },
        { materials = CellFactory_GetAllSolids(true, true),  filename = "enhanced_solids.json" },
    }

    -- Write enhanced data to separate files
    for _, type_data in ipairs(material_types) do
        writeEnhancedMaterialsToFile(type_data.materials, type_data.filename)
    end

    -- Create the original combined list for backward compatibility
    for i, type_data in ipairs(material_types) do
        for e, mtr in ipairs(type_data.materials) do
            full_list = full_list .. mtr .. ((i == #material_types and e == #type_data.materials) and "" or ",")
        end
    end

    local f = io.open("mods/component-explorer/data/factorial.txt", "a")
    if f then
        f:write(full_list)
        f:close()
        print("Original factorial.txt written")
    else
        print("Error: Could not open factorial.txt for writing")
    end
end

getALLLLLLLL()
