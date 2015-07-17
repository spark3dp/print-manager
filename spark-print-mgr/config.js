var config = require('./config.json'),
    dateUtils = require('./utils/dateUtils'),
    express = require('express'),
    fs = require('fs'),
    path = require('path'),
    AppSettings = require('./appSettings'),
    _ = require('underscore');

// The server shouldn't crash with no local config, just provide an empty object
var localConfig = {};
try {
    localConfig = require('./localConfig.json');
} catch(ex) {
    console.log('No localConfig.json present');
}

// Extend config with the local config overrides.
//
config = _.extend(config, localConfig);

// Set the defaults.
if (!config.printer_data_files) {
    config.printer_data_files = './';
}

if (config.localhost_only === undefined) {
    config.localhost_only = true;
}

// API to get and set the config.
var router = null;


function getUserConfigurableValues()
{
    // Returns only values that can be configurable by the user.
    var userConfig = {};

    userConfig['PORT'] = config.PORT;
    userConfig['logger_options'] = {};
    userConfig['logger_options']['log_file_name'] = config['logger_options']['log_file_name'];
    userConfig['logger_options']['log_file_location'] = config['logger_options']['log_file_location'];
    userConfig['data_files_location'] = config.data_files_location;
    userConfig['localhost_only'] = config.localhost_only;

    return userConfig;
}

function validateConfigData( data )
{
    var error = "";

    // If this is the same as in the config than return true
    if (data.hasOwnProperty('PORT')) {
        if (data.PORT !== config.PORT) {
            // Check if this is an integer.
            if( ( parseInt(data.PORT) != data.PORT ) ) {
                error = error + " | Specified PORT number is not valid.";
            }
        }
    }

    function isWritable(dirPath) {
        try {
            var date = new Date();
            var tmpFile = path.join( dirPath, "__pm__" + dateUtils.dateToYYYYMMDDhhmmss(date) + "__.tmp");
            var fd = fs.openSync( tmpFile, "w" );
            fs.closeSync( fd );
            fs.unlinkSync(tmpFile);
        } catch(ex) {
            return false;
        }
        return true;
    }

    if (data.hasOwnProperty('data_files_location')) {
        // Check if this is a valid path.
        if (!fs.existsSync(data.data_files_location) || !fs.lstatSync(data.data_files_location).isDirectory()) {
            error = error + " | Invalid application data location.";
        }
        else { // Check if the directory is writable
            if (!isWritable(data.data_files_location) ) {
                error = error + " | Invalid application data location - directory has no write permission.";
            }
        }
    }
    if (data.hasOwnProperty('localhost_only')) {
        if (typeof data.localhost_only !== "boolean") {
            error = error + " | localhost_only has to be boolean (true or false).";
        }
    }
    if (data.hasOwnProperty('logger_options')) {
        // Check that the log file name is not empty if it is defined.
        if (data.logger_options['log_file_name'] !== undefined ) {
            if (!data.logger_options['log_file_name']) {
                error = error + " | Invalid log file name.";
            }
        }

        // Check that the log file location dir exists if it is defined.
        var logFileLoc = data.logger_options['log_file_location'];
        if (logFileLoc !== undefined ) {
            if (!fs.existsSync(logFileLoc) || !fs.lstatSync(logFileLoc).isDirectory()) {
                error = error + " | Invalid log file location.";
            }
            else {
                if (!isWritable(logFileLoc) ) {
                    error = error + " | Invalid log file location - directory has no write permission.";
                }
            }
        }
    }

    return error;
}


function getConfig( req, res, next )
{
    res.send( getUserConfigurableValues() );
}


function setConfig( req, res, next )
{
    // Prevent the users from setting any other values than what we allow them to set.
    var validKeyEntries       = ['PORT', 'data_files_location', 'localhost_only', 'logger_options'];
    var validLoggerKeyEntries = ['log_file_name', 'log_file_location'];

    var pickedConfigData = _.pick( req.body, validKeyEntries );
    if (validKeyEntries.indexOf("logger_options") > -1 ) {
        var pickedLoggerOptions = _.pick( pickedConfigData['logger_options'], validLoggerKeyEntries );
        pickedConfigData['logger_options'] = pickedLoggerOptions;
    }

    var error = validateConfigData( pickedConfigData );
    if (!error) {

        for (var key in pickedConfigData ) {
            localConfig[key] = pickedConfigData[key];
        }

        // Set new values in to the local config file.
        var data = JSON.stringify( localConfig );

        fs.writeFile( "./localConfig.json", data, function (err) {
        });

        res.send( localConfig );
    }
    else {
        res.status(400);
        res.send( { 'error' : error } );
    }
}

function getRouter()
{
    if( router )
        return router;

    // configure the router
    router = express.Router();
    router.get('/', getConfig );
    router.post('/', setConfig );

    return router;
}

var appSettings = new AppSettings(config);

module.exports = {
    'config' : config,
    'appSettings' : appSettings,
    'Router' : getRouter
};