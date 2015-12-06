var express = require( 'express'),
    path = require('path'),
    files = require( './files'),
    fileMetadata = require( './fileMetadata'),
    resources = require( './resource'),
    util = require( 'util'),
    _ = require('underscore'),
    logger = require('./logging/PrintManagerLogger'),
    config = require('./config').config,
    LocalFileUploader = require('./LocalFileUploader'),
    validator = require('./utils/validator');

var router = null;
var printerTypes = {};

function sendError( res, code, msg )
{
    // TODO: Switch to using spark-common/ErrorHandler
    logger.error( msg );
    res.status( code );
    res.send( msg );
}

function PrinterType( data )
{
    // call the base class
    resources.Resource.call( this );

    _.extend(this, data);
    printerTypes[this.getID()] = this;
}

util.inherits( PrinterType, resources.Resource );

PrinterType.prototype.mapFileResources = function(json)
{
    // Replace file id properties with the path to the file.
    //
    var fileResources = this._files;
    for( var i=0; i < fileResources.length; ++i )
    {
        var id = fileResources[i];
        var fields = id.split('.');
        var resource = json;
        var field = fields[0];
        var value = resource[field];
        for( var j=1; j < fields.length; ++j )
        {
            resource = value;
            field = fields[j];
            value = resource[field];
        }
        var file = files.find( value );

        if( value && file )
        {
            resource[field] = file.path;
            // logger.debug("RES: " + id + " : " + value + " => " + resource[field + "_path"]);
        }
    }
};

PrinterType.prototype.getDefaultMaterialId = function()
{
    return this.default_material_id;
};

PrinterType.prototype.getDefaultProfileId = function()
{
    return this.default_profile_id;
};

function initialize() {
    var dir = config.printer_data_files,
        data = require(path.join(dir, 'printertypes.json'));
    
    data.printerTypes.forEach(function (printertype) {
        LocalFileUploader.uploadFiles(dir, printertype);
        var result = addPrinterType(printertype);
        if (!result.success) {
            logger.error(result.msg);
        }
    });
}


function getAllPrinterTypes( req, res )
{
    var types = [];

    for( var id in printerTypes )
    {
        if (printerTypes.hasOwnProperty(id)) {
            var type = printerTypes[id];
            types.push(type.asJSON());
        }
    }
    res.send( { "printerTypes" : types } );
}


function addPrinterType(data) {
    logger.debug('postPrinterType, data:' + data);

    var id = data.id,
        result = {};

    var isPrinterType = validator.isPrinterType(data);

    if (isPrinterType !== true)
    {
        result.success = false;
        result.code = 400;
        result.msg = 'Failed to create printer type. Data invalid. ' + isPrinterType;
    }
    else if( id && findPrinterType(id) )
    {
        result.success = false;
        result.code = 400;
        result.msg = 'PrinterType already exists: ' + id;
    }
    else
    {
        var meta = new fileMetadata.FileMetadata( data );
        if( !meta.validate() )
        {
            result.success = false;
            result.code = 400;
            result.msg = 'Invalid file metadata';
        }
        else
        {
            var type = new PrinterType( data );
            meta = new fileMetadata.FileMetadata( type );
            meta.addChildren();
            printerTypes[type.getID()] = type;

            result.success = true;
            result.code = 204;
            result.msg = type.asJSON();
        }
    }
    return result;
}


function postPrinterType( req, res )
{
    var result = addPrinterType(req.body);
    if (result.success) {
        res.status(result.code);
        res.send(result.msg);
    } else {
        sendError(res, result.code, result.msg);
    }
}


function findPrinterType( id )
{
    if (!(typeof(id) === 'string' || id instanceof String)) {
        return undefined;
    }

    return printerTypes.hasOwnProperty(id) ? printerTypes[id] : undefined;
}

function getPrinterType( req, res )
{
    var id = req.params.id;
    var type = findPrinterType( id );

    if( type )
    {
        res.send( type.asJSON() );
    }
    else
    {
        res.status( 404 );
        var msg = 'PrinterType not found: ' + id;
        logger.error( msg );
        res.send( msg );
    }
}


function getRouter()
{
    if( router )
        return router;
    
    router = express.Router();

    router.get( '/', getAllPrinterTypes );
    //router.post( '/', postPrinterType );
    router.get('/:id', getPrinterType );
    
    return router;
}

module.exports = exports = {
    'initialize' : initialize,
	'Router' : getRouter,
    'find' : findPrinterType
};
