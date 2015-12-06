local function round( x )
    if x >= 0 then
        return math.floor( x + 0.5 )
    else
        return math.floor( x - 0.5 )
    end
end


local function endsWith( str, pattern )
    local index = string.find( str, pattern, 1, true )
    return index and string.sub(str,index) == pattern
end


-- Ember doesn't like floating-point numbers, except when it really
-- likes them.  Apparently, all the settings that represents exposure
-- times in seconds need to have a decimal, and none of the other
-- settings may have a decimal.
local function handleDecimals( name, value )
    
    if endsWith(name,"ExposureSec") then
        value = string.format( "%.3f", value )
    else
        value = tostring( round(value) )
    end

    return value
end


local function encodeSettings( settings )
    local str = ""
    str = str .. "{\n"
    str = str .. "    \"Settings\": {\n"

    local names = {}
    for n, _ in pairs(settings) do
        table.insert( names, n )
    end
    table.sort( names )
    
    for i = 1, #names do
        local name = names[i]
        local value = settings[name]
        local setting = string.format( "        \"%s\": %s", name, value )

        local postfix
        if i == #names then
            postfix = "\n"
        else
            postfix = ",\n"
        end
        
        str = str .. setting .. postfix
    end

    str = str .. "    }\n"
    str = str .. "}\n"

    return str
end


local packager = function( params )

    local writer = awZip.TarWriter.new()
    writer.openTarFile( params.outputFile, true )

    -- write printsettings
    -- cm to micron,
    -- seconds to miliseconds
    -- degrees to milidegrees
    local conversions = {
        l = 10000,
        t = 1000, 
        a = 1000, 
    }

    
    local getParam = function( emberName, name, convCode )
        local value = params.profile[name]
        assert( value ~= nil, "Property not found: " .. name )

        if type(value) == "number" then
            if convCode ~= nil then
                if convCode == "a" then
                    value = conversions[convCode] * math.deg(value)
                else
                    value = conversions[convCode] * value
                end
            end
                
            value = handleDecimals( emberName, value )
        end

        return value
    end


    local mapping = {
        { "LayerThicknessMicrons", "layer_height", "l" },
        { "BurnInExposureSec", "burn_in_exposure" },
        { "BurnInLayers", "burn_in_layers" },
        { "BurnInSeparationRPM", "burn_in_layer_separation_slide_velocity" },
        { "BurnInApproachRPM", "burn_in_layer_approach_slide_velocity" },
        { "BurnInZLiftMicrons", "burn_in_layer_z_axis_overlift", "l" },
        { "BurnInSeparationMicronsPerSec", "burn_in_layer_separation_z_axis_velocity", "l" },
        { "BurnInApproachMicronsPerSec", "burn_in_layer_approach_z_axis_velocity", "l" },
        { "BurnInRotationMilliDegrees", "burn_in_layer_angle_of_rotation", "a" },
        { "BurnInExposureWaitMS", "burn_in_layer_wait_after_exposure", "t" },
        { "BurnInSeparationWaitMS", "burn_in_layer_wait_after_separation", "t" },
        { "BurnInApproachWaitMS", "burn_in_layer_wait_after_approach", "t" },
        { "FirstExposureSec", "first_layer_exposure_time" },
        { "FirstSeparationRPM", "first_layer_separation_slide_velocity" },
        { "FirstApproachRPM", "first_layer_approach_slide_velocity" },
        { "FirstZLiftMicrons", "first_layer_z_axis_overlift", "l" },
        { "FirstSeparationMicronsPerSec", "first_layer_separation_z_axis_velocity", "l" },
        { "FirstApproachMicronsPerSec", "first_layer_approach_z_axis_velocity", "l" },
        { "FirstRotationMilliDegrees", "first_layer_angle_of_rotation", "a" },
        { "FirstExposureWaitMS", "first_layer_wait_after_exposure", "t" },
        { "FirstSeparationWaitMS", "first_layer_wait_after_separation", "t" },
        { "FirstApproachWaitMS", "first_layer_wait_after_approach", "t" },
        { "ModelExposureSec", "model_exposure_time" },
        { "ModelSeparationRPM", "model_layer_separation_slide_velocity" },
        { "ModelApproachRPM", "model_layer_approach_slide_velocity", },
        { "ModelZLiftMicrons", "model_layer_z_axis_overlift", "l" },
        { "ModelSeparationMicronsPerSec", "model_layer_separation_z_axis_velocity", "l" },
        { "ModelApproachMicronsPerSec", "model_layer_approach_z_axis_velocity", "l" },
        { "ModelRotationMilliDegrees", "model_layer_angle_of_rotation", "a" },
        { "ModelExposureWaitMS", "model_layer_wait_after_exposure", "t" },
        { "ModelSeparationWaitMS", "model_layer_wait_after_separation", "t" },
        { "ModelApproachWaitMS", "model_layer_wait_after_approach", "t" }
    }
    
    -- add the job name
    local settings = {
        JobName = string.format( "\"%s\"", params.jobTitle )
    }

    for _, item in ipairs(mapping) do
        settings[item[1]] = getParam( item[1], item[2], item[3] )
    end

    -- The "printsettings" file isn't a real JSON file.  Some of the
    -- settings need to be expressed as a floating point value, even
    -- when they are numerically just integers.
    local settingsStr = encodeSettings( settings )
    local settingsStream = writer.addStream( "printsettings", settingsStr:len() )
    settingsStream.write( settingsStr )
    writer.closeStream()

    -- write the slices
    local reader = awZip.Reader.new()
    reader.openZipFile( params.inputFiles[1] )
    local files = reader.getDirectory()

    for i = 1, #files do

        local stream = writer.addStream(files[i], reader.fileSize(files[i]) )
        reader.readFile(files[i], stream)
        writer.closeStream()

    end

    reader.closeZipFile()
    writer.close()

    return true

end

return packager
