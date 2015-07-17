var express = require( 'express'),
    path = require('path'),
    resources = require( './resource'),
    util = require( 'util'),
    _ = require('underscore'),
    url = require('url'),
    logger = require('./logging/PrintManagerLogger'),
    config = require('./config').config,
    LocalFileUploader = require('./LocalFileUploader');

var router = null;
var materials = {};

function sendError( res, code, msg )
{
    logger.error( msg );
    res.status( code );
    res.send( msg );
}

function Material( data )
{
    // call the base class
    resources.Resource.call( this );

    _.extend(this, data);
    materials[this.getID()] = this;

    this.is_user = false; // We currently have no concept of a 'user' so just set this to false.
}

util.inherits( Material, resources.Resource );


function initialize() {
    var dir = config.printer_data_files,
        data = require(path.join(dir, 'materials.json'));

    data.materials.forEach(function (material) {
        LocalFileUploader.uploadFiles(dir, material);
        var result = addMaterial(material);
        if (!result.success) {
            logger.error(result.msg);
        }
    });
}


function getfilteredMaterials(filter) { //?technology=FDM&temp_max_extrude=250
    var materials_temp = materials;
    var keysToParseAsFloat = ['version', 'opacity', 'rating', 'pct_shrink',
        'filament_diameter', 'filament_extrusion_to_flow_multiplier', 'temp_min_extrude',
        'temp_max_extrude', 'temp_bed', 'min_nozzle_diameter', 'extruder_fan_speed',
        'FirstExposureSec', 'BurnInLayers', 'BurnInExposureSec', 'ModelExposureSec', 'density'
    ];

    for (var key in filter) {
        if (!filter.hasOwnProperty(key)) {
            continue;
        }

        if (keysToParseAsFloat.indexOf(key) !== -1) {
            if (!isNaN(parseFloat(filter[key]))) {    //if can be parsed into a float value
                filter[key] = parseFloat(filter[key]);
            }
        } else if (key === "is_user") {
            filter[key] = JSON.parse(filter[key].toLowerCase());    //makes sure boolean is result
        } else if (key === "cost") { //returns only cost < param
            (function() {
                var cost_threshold = parseFloat(filter[key]);
                var valid_cost_value = parseFloat(filter[key]);

                //removes anything exceeding user param cost from list of materials_temp copied from materials
                materials_temp = materials_temp.filter(function(material_item) {
                    return valid_cost_value && (material_item["cost"] <= cost_threshold);
                });
            })();

            delete filter[key];  //delete the filter and key associated so that _.where functionality is not rendered useless
        } else if (key === "temp_extrude_default") { //returns only temp_extrude_default < param
            (function() {
                var temp_threshold = parseFloat(filter[key]);
                var valid_temp_value = parseFloat(filter[key]);

                //removes anthing exceeding user param cost from list of materials_temp copied from materials
                materials_temp = materials_temp.filter(function(material_item) {
                    return valid_temp_value && (material_item["temp_extrude_default"] <= temp_threshold);
                });
            })();

            delete filter[key];  //delete the filter and key associated so that _.where functionality is not rendered useless
        } else if (key === "color") { //returns only colors within tolerance
            (function() {
                var rgb_object = hexToRgb(filter[key]),
                    red_val = rgb_object.r,
                    green_val = rgb_object.g,
                    blue_val = rgb_object.b,
                    color_tol = 30;       //tweak as necessary

                //removes anthing out of allowable color range from list of materials_temp copied from materials
                materials_temp = materials_temp.filter(function(material_item) {
                    var color = hexToRgb(material_item["color"]);

                    return (Math.abs(red_val - color.r) <= color_tol) &&
                        (Math.abs(green_val - color.g) <= color_tol) &&
                        (Math.abs(blue_val - color.b) <= color_tol);
                });
            })();

            delete filter[key];  //delete the filter and key associated so that _.where functionality is not rendered useless
        }
    }
    return _.where(materials_temp, filter);
}


function getMaterials( req, res )
{
    var query = url.parse(req.url,true).query;  
    var mm = getfilteredMaterials(query);
    res.status(200);
    res.send({ materials : _.map(mm,function (m) {
        return m.asJSON();
    })});
}


function addMaterial(data) {
    logger.debug('postMaterial, data: ' + data);

    var id = data.id,
        result = {};

    if( !id )
    {
        result.success = false;
        result.code = 400;
        result.msg = 'No ID specified for the Material';
    }

    else if (!data.printer_types){
        result.success = false;
        result.code = 400;
        result.msg = 'No printer types specified for the Material';
    }

    else if( findMaterial(id) )
    {
        result.success = false;
        result.code = 400;
        result.msg = 'Material already exists: ' + id;
    }

    else
    {
        var type = new Material( data );

        result.success = true;
        result.code = 204;
    }

    return result;
}


function postMaterial( req, res )
{
    var result = addMaterial(req.body);
    if (result.success) {
        res.status(result.code);
        res.send();
    } else {
        sendError(res, result.code, result.msg);
    }
}

function findMaterial( id ) {
    if (!(typeof(id) === 'string' || id instanceof String)) {
        return undefined;
    }

    return materials.hasOwnProperty(id) ? materials[id] : undefined;
}

function getMaterial( req, res )
{
    var id = req.params.id;
    var type = findMaterial ( id );  //this returns all material properties associated with this ID

    if( type )
    {
        logger.debug("in the type field");
        res.send( type.asJSON() );
    }

    else
    {
        res.status( 404 );
        var msg = 'Material not found: ' + id;
        logger.error( msg );
        res.send( msg );
    }
}


function getRouter()
{
    if( router )
        return router;
    
    router = express.Router();

    router.get( '/', getMaterials );
    router.post( '/', postMaterial );
    router.get('/:id', getMaterial );

    return router;
}


function componentToHex(c) {
    var hex = c.toString(16);
    return hex.length == 1 ? "0" + hex : hex;
}


function rgbToHex(r, g, b) {
    return "#" + componentToHex(r) + componentToHex(g) + componentToHex(b);
}


function hexToRgb(hex) {
    // Expand shorthand form (e.g. "03F") to full form (e.g. "0033FF")
    var shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    hex = hex.replace(shorthandRegex, function(m, r, g, b) {
        return r + r + g + g + b + b;
    });

    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}


module.exports = exports = {
    'initialize' : initialize,
	'Router' : getRouter,
    'find' : findMaterial
};
