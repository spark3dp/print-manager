var express = require('express'),
    path = require('path'),
    resources = require('./resource'),
    util = require('util'),
    _ = require('underscore'),
    logger = require('./logging/PrintManagerLogger'),
    config = require('./config').config,
    LocalFileUploader = require('./LocalFileUploader');

var router = null;
var profiles = {};

function sendError( res, code, msg )
{
    // TODO: Switch to using spark-common/ErrorHandler
    logger.error( msg );
    res.status( code );
    res.send( msg );
}


function Profile( data )
{
    // call the base class
    resources.Resource.call( this );

    _.extend(this, data);

    // install in our collection
    profiles[this.getID()] = this;
}

util.inherits( Profile, resources.Resource );


function initialize() {
    var dir = config.printer_data_files,
        data = require(path.join(dir, 'profiles.json'));

    data.profiles.forEach(function (profile) {
        LocalFileUploader.uploadFiles(dir, profile);
        var result = addProfile(profile);
        if (!result.success) {
            logger.error(result.msg);
        }
    });
}


function getAllProfiles( req, res )
{
    var data = [];

    for( var id in profiles )
    {
        if( profiles.hasOwnProperty(id) ) {
            var profile = profiles[id];
            data.push(profile.asJSON());
        }
    }

    res.send( { "profiles" : data } );
}


function addProfile(data) {
    var id = data.id,
        result = {};

    if( !id )
    {
        result.success = false;
        result.code = 400;
        result.msg = 'No ID specified for Profile';
    }
    else if( findProfile(id) )
    {
        result.success = false;
        result.code = 400;
        result.msg = 'Profile already exists: ' + id;
    }
    else
    {
        var profile = new Profile( data );

        result.success = true;
        result.code = 204;
    }

    return result;
}


function postProfile( req, res )
{
    var result = addProfile(req.body);
    if (result.success) {
        res.status(result.code);
        res.send();
    } else {
        sendError(res, result.code, result.msg);
    }
}


function getProfile( req, res )
{
    var id = req.params.id;
    var type = findProfile(req.params.id);

    if( type )
    {
        res.send( type.asJSON() );
    }
    else
    {
        res.status( 404 );
        var msg = 'Profile not found: ' + id;
        logger.error( msg );
        res.send( msg );
    }
}


function findProfile( id )
{
    if (!(typeof(id) === 'string' || id instanceof String)) {
        return undefined;
    }

    return profiles.hasOwnProperty(id) ? profiles[id] : undefined;
}


function getRouter()
{
    if( router )
        return router;
    
    router = express.Router();

    router.get( '/', getAllProfiles );
    //router.post( '/', postProfile );
    router.get('/:id', getProfile );
    
    return router;
}

module.exports = exports = {
    'initialize': initialize,
	'Router' : getRouter,
    'find' : findProfile
};
