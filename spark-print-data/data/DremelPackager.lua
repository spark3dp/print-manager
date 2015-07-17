--  This version just copies the input file to the output file
local packager = function( params )
    -- print("DREMEL in: " .. params.inputFiles[1]);
    -- print("DREMEL out: " .. params.outputFile);
    local out = io.open( params.outputFile, "wb" )
    if out == nil then
        return false
    end

    -- copy the gcode
    local gcode = io.open( params.inputFiles[1], "r" )
    local count = 0
    while true do
        local data = gcode:read( 4096 )
        if data == nil then
            break
        end
        count = count + #data
        out:write( data )
    end
    gcode:close()

    out:close()
    -- print("DREMEL: write " .. tostring(count))
end

--[[  This version may be used in the future 
--
function fsize (file)
    local current = file:seek()      -- get current position
    local size = file:seek("end")    -- get file size
    file:seek("set", current)        -- restore position
    return size
end

local packager = function( params )
    local out = io.open( params.outputFile, "wb" )
    if out == nil then
        return false
    end

    -- load the icon data
    local icon = io.open( params.printerType.printable.packager_data.icon_file_id, "rb" )
    local iconData = icon:read( "*a" )
    
    -- magic string
    out:write( "g3drem 1.0      " )

    -- image start offset?
    out:write( ak.writeUInt32(58) )

    -- unused
    out:write( ak.writeUInt32(0) )

    -- gcode start offset?
    out:write( ak.writeUInt32(58 + fsize(icon) ) )

    -- estimated build time (seconds)
    out:write( ak.writeUInt32(6403) )

    -- right/left extruder material used (mm)
    out:write( ak.writeUInt32(9401) )
    out:write( ak.writeUInt32(0) )

    -- flags?
    out:write( ak.writeUInt16(1) )

    -- layer height (micrometers)
    out:write( ak.writeUInt16(200) )

    -- infill thickness percentage
    out:write( ak.writeUInt16(25) )

    -- shell count
    out:write( ak.writeUInt16(3) )

    -- build speed?
    out:write( ak.writeUInt16(100) )

    -- platform temperature?
    out:write( ak.writeUInt16(0) )

    -- right/left extruder temperature
    out:write( ak.writeUInt16(220) )
    out:write( ak.writeUInt16(0) )

    -- right/left material types
    out:write( ak.writeUInt8(1) )
    out:write( ak.writeUInt8(255) )

    -- copy the icon
    out:write( iconData )
    icon:close()

    -- copy the gcode
    local gcode = io.open( params.inputFiles[1], "r" )
    while true do
        local data = gcode:read( 4096 )
        if data == nil then
            break
        end
        out:write( data )
    end
    gcode:close()

    out:close()

    return true
end
--]]

return packager
