var DLPTranslator = require('../DLPTranslator'),
    util = require('util'),
    fs = require('fs'),
    tar = require('tar-stream'),
    Q = require('q'),
    zlib = require('zlib');


function round( x )
{
    if( x >= 0 )
    {
        return Math.floor( x + 0.5 );
    }
    else
    {
        return Math.floor( x - 0.5 );
    }
}


function endsWith( str, pattern )
{
    var index = str.search( pattern );
    var end = index + pattern.length;
    return index >= 0 && str.substring(index,end) == pattern;
}


// Ember doesn't like floating-point numbers, except when it really
// likes them.  Apparently, all the settings that represents exposure
// times in seconds need to have a decimal, and none of the other
// settings may have a decimal.

function handleDecimals( name, value )
{   
    var result;

    if( endsWith(name,"ExposureSec") )
    {
        result = value.toFixed( 3 );
    }
    else
    {
        result = round(value).toString();
    }
    
    return result;
}


function encodeSettings( settings )
{
    var str = "";
    str = str + "{\n";
    str = str + "    \"Settings\": {\n";
 
    var names = [];
    for( var key in settings)
    {
        names.push( key );
    }
    
    names.sort();
     
    for( var i = 0; i < names.length; ++i )
    {
        var name = names[i];
        var value = settings[name];
        var setting = "        \"" + name + "\": " + value;
        
        var postfix;
        if( i + 1 == names.length )
            postfix = "\n";
        else
            postfix = ",\n";

        str = str + setting + postfix;
    }
 
    str = str + "    }\n";
    str = str + "}\n";

    return str;
}


// cm to micron,
// seconds to miliseconds
// degrees to milidegrees
var conversions = {
    "l" : 10000,
    "t" : 1000,
    "a" : 1000
};


function getParam( profile, emberName, name, convCode )
{
    if( ! (name in profile) )
        throw "Parameter not found in profile " + profile.id + ": " + name;

    var value = profile[name];
 
    if( typeof value == "number" )
    {
        if( convCode )
        {
            if( convCode == "a" )
            {
                value = conversions[convCode] * 180/Math.PI * value;
            }
            else
            {
                value = conversions[convCode] * value;
            }
        }
        
        value = handleDecimals( emberName, value )
    }
 
    return value;
}


var mapping = [
    [ "LayerThicknessMicrons", "layer_height", "l" ],
    [ "BurnInExposureSec", "burn_in_exposure" ],
    [ "BurnInLayers", "burn_in_layers" ],
    [ "BurnInSeparationRPM", "burn_in_layer_separation_slide_velocity" ],
    [ "BurnInApproachRPM", "burn_in_layer_approach_slide_velocity" ],
    [ "BurnInZLiftMicrons", "burn_in_layer_z_axis_overlift", "l" ],
    [ "BurnInSeparationMicronsPerSec", "burn_in_layer_separation_z_axis_velocity", "l" ],
    [ "BurnInApproachMicronsPerSec", "burn_in_layer_approach_z_axis_velocity", "l" ],
    [ "BurnInRotationMilliDegrees", "burn_in_layer_angle_of_rotation", "a" ],
    [ "BurnInExposureWaitMS", "burn_in_layer_wait_after_exposure", "t" ],
    [ "BurnInSeparationWaitMS", "burn_in_layer_wait_after_separation", "t" ],
    [ "BurnInApproachWaitMS", "burn_in_layer_wait_after_approach", "t" ],
    [ "FirstExposureSec", "first_layer_exposure_time" ],
    [ "FirstSeparationRPM", "first_layer_separation_slide_velocity" ],
    [ "FirstApproachRPM", "first_layer_approach_slide_velocity" ],
    [ "FirstZLiftMicrons", "first_layer_z_axis_overlift", "l" ],
    [ "FirstSeparationMicronsPerSec", "first_layer_separation_z_axis_velocity", "l" ],
    [ "FirstApproachMicronsPerSec", "first_layer_approach_z_axis_velocity", "l" ],
    [ "FirstRotationMilliDegrees", "first_layer_angle_of_rotation", "a" ],
    [ "FirstExposureWaitMS", "first_layer_wait_after_exposure", "t" ],
    [ "FirstSeparationWaitMS", "first_layer_wait_after_separation", "t" ],
    [ "FirstApproachWaitMS", "first_layer_wait_after_approach", "t" ],
    [ "ModelExposureSec", "model_exposure_time" ],
    [ "ModelSeparationRPM", "model_layer_separation_slide_velocity" ],
    [ "ModelApproachRPM", "model_layer_approach_slide_velocity", ],
    [ "ModelZLiftMicrons", "model_layer_z_axis_overlift", "l" ],
    [ "ModelSeparationMicronsPerSec", "model_layer_separation_z_axis_velocity", "l" ],
    [ "ModelApproachMicronsPerSec", "model_layer_approach_z_axis_velocity", "l" ],
    [ "ModelRotationMilliDegrees", "model_layer_angle_of_rotation", "a" ],
    [ "ModelExposureWaitMS", "model_layer_wait_after_exposure", "t" ],
    [ "ModelSeparationWaitMS", "model_layer_wait_after_separation", "t" ],
    [ "ModelApproachWaitMS", "model_layer_wait_after_approach", "t" ]
];


// 
// 
// local packager = function( params )
// 
//     local writer = awZip.TarWriter.new()
//     writer.openTarFile( params.outputFile, true )
// 
//     local settingsStream = writer.addStream( "printsettings", settingsStr:len() )
//     settingsStream.write( settingsStr )
//     writer.closeStream()
// 
//     -- write the slices
//     local reader = awZip.Reader.new()
//     reader.openZipFile( params.inputFiles[1] )
//     local files = reader.getDirectory()
// 
//     for i = 1, #files do
// 
//         local stream = writer.addStream(files[i], reader.fileSize(files[i]) )
//         reader.readFile(files[i], stream)
//         writer.closeStream()
// 
//     end
// 
//     reader.closeZipFile()
//     writer.close()
// 
//     return true
// 
// end


function EmberTranslator(printerType, printerProfile, material) {
    DLPTranslator.call(this, printerType, printerProfile, material);
    this.profile = printerProfile;
    this.sliceCount = 0;
    this.slice = 0;
    this.jobName = "Spark";
}

util.inherits(EmberTranslator, DLPTranslator);

EmberTranslator.canTranslate = function (printerType, profile, material) {
    return printerType.id == "7FAF097F-DB2E-45DC-9395-A30210E789AA";
};


EmberTranslator.prototype.startTranslation = function (inputPath, outputPath) {
    // create the tar -> gzip -> file stream
    this.fstream = fs.createWriteStream( outputPath );
    this.gzip = zlib.createGzip();
    this.pack = tar.pack();

    this.gzip.pipe( this.fstream );
    this.pack.pipe( this.gzip );
    
    // write the settings
    this.writeSettings();

    return DLPTranslator.prototype.startTranslation.apply( this, [inputPath, outputPath] );
};


EmberTranslator.prototype.onHeader = function (header) {
    this.sliceCount = header.num_slices;
};


EmberTranslator.prototype.onSlice = function (index, slice) {
    var progress = (index + 1) / this.sliceCount;
    this.setProgress(progress);

    var deferred = Q.defer();
    
    // write the slice
    this.slice = this.slice + 1;
    var data = slice.png_data.toBuffer();
    var name = "slice_" + this.slice.toString() + ".png";
    var entry = this.pack.entry( {"name": name, "size": data.length }, function(err) {
        deferred.resolve();
    } );

    entry.write( data );
    entry.end();
    
    return deferred.promise;
};


EmberTranslator.prototype.endTranslation = function (outputFile) {
    this.pack.finalize();
};


EmberTranslator.prototype.writeSettings = function() 
{
    // add the job name
    var settings = {
        "JobName": '"' + this.jobName + '"'
    };
    
    for( var key in mapping )
    {
        var item = mapping[key];
        settings[item[0]] = getParam( this.profile, item[0], item[1], item[2] );
    }
    
    // The "printsettings" file isn't a real JSON file.  Some of the
    // settings need to be expressed as a floating point value, even
    // when they are numerically just integers.
    var settingsStr = encodeSettings( settings );
    var self = this;
    this.pack.entry( { name:"printsettings" }, settingsStr );
};


module.exports = EmberTranslator;
