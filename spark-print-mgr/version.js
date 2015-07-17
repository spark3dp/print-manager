var express = require( 'express'),
    roopa = require( './roopa'),
    config = require('./config').config,
    logger = require('./logging/PrintManagerLogger');

var router = null;
var version = null;


function initialize () {

    // Read print definition schema and revision values from
    // version.json config file.
    //
    var data = require(config.printer_data_files + 'version.json');
    config.print_definition_schema = data.print_definition_schema;
    config.print_definition_revision = data.print_definition_revision;
}

function computeVersion(techData) {
    // api
    var api = {};
    api.major = 1;
    api.minor = 0;
    api.commit_id = config.commit_id;
    api.short_commit_id = api.commit_id.substring( 0, 6 );

    // print_definition
    var pd = {};
    pd.schema = config.print_definition_schema;
    pd.revision = config.print_definition_revision;

    // assemble the final object ...
    var ver = {};
    ver.api = api;
    ver.core_technology = techData;
    ver.print_definition = pd;

    // ... and set it
    version = ver;
}

function sendVersion(res) {
    res.status(200);
    res.send(version);
}

function getVersion(req, res, next) {
    if (version) {
        sendVersion(res);
        return;
    }

    // generate the version info
    var p = roopa.run( "getVersion.lua" );
    p.then(function (data) {
            computeVersion( data );
            sendVersion( res );
        },
        function (data) {
            logger.warn('getVersion failed!');
            res.send('getVersion failed!');
            res.status( 500 );
        });
}

function getRouter() {
    if (router)
        return router;

    // configure the router
    router = express.Router();
    router.get('/', getVersion);

    return router;
}


module.exports = exports = {
    'initialize' : initialize,
    'Router' : getRouter
};
