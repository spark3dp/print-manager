var _  = require('underscore'),
    appSettings = require('./config').appSettings,
    fs = require('fs');

// When we use jxcore we remove an argument from the list ie node server.js simply becomes print_manager
// so we shift the args
if(process.IsEmbedded) process.argv.unshift(process.argv[0]);

var args = process.argv.slice(2);
console.log('args ' + args);

var express = require('express'),
    bodyParser = require('body-parser'),
    printerManager = require('./printers/printerManager'),
    roopa = require('./roopa'),
    tasks = require('./tasks'),
    jobs = require('./jobs'),
    printer = require('./printers/printer'),
    config = require('./config').config,
    files = require('./files'),
    meshes = require('./meshes'),
    materials = require('./materials'),
    printertypes = require('./printertypes'),
    profiles = require('./profiles'),
    trays = require('./trays'),
    version = require('./version'),
    cors = require('cors'),
    logger = require('./logging/PrintManagerLogger');

try {
    var http = require('http');
    http.setMaxHeaderLength(1e7); // is that big enough ?
} catch (ex) {
    //^ only necessary when using JXCore
}

process.stdin.resume(); //so the program will not close instantly

// Setup the memory cleanup to be done once a day. It removes
// all jobs that are older then the specified in the config number of days
// and then it also prunes all the other resources that refCount is zero.
function cleanUpMemory()
{
    var jobsOlderThan  = 0;          // in days.
    var tasksOlderThan = 0;
    if (config) {
        jobsOlderThan = config['memory_cleanup_options']
            ? config['memory_cleanup_options']['delete_jobs_older_than']
            ? config['memory_cleanup_options']['delete_jobs_older_than']
            : 0
            : 0;
        tasksOlderThan = config['memory_cleanup_options']
            ? config['memory_cleanup_options']['delete_tasks_older_than']
            ? config['memory_cleanup_options']['delete_tasks_older_than']
            : 0
            : 0;
    }

    jobs.prune( jobsOlderThan );
    tasks.prune( tasksOlderThan );
    trays.prune();
    meshes.prune();
    files.prune();
}

var one_day=1000*60*60*24;  // one day in miliseconds
setInterval( cleanUpMemory, one_day );

function exitHandler(options, err) {
    if (options.cleanup){
        printerManager.cleanup();
    }

    if (options.exit) {
        exit();
    }

    if (err) {
        logger.error('Fatal error', err);
    }

}

function exit(){
    logger.info('saving data before exit');

    // Delete all the temporary date files that were created
    // during this session of print manager.
    appSettings.deleteAppDataFiles();

    process.exit();
}

//do something when app is closing
process.on('exit', exitHandler.bind(null, {cleanup: true}));
//catches ctrl+c event
process.on('SIGINT', exitHandler.bind(null, {exit: true}));
process.on('SIGTERM', exitHandler.bind(null, {exit: true}));
//catches uncaught exceptions
process.on('uncaughtException', exitHandler.bind(null, {exit: true}));

var app = express();
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

var router = express.Router();

router.get('/', function (req, res, next) {
    res.send('please select an API bucket, e.g., /printers');
});
// Delete all the leftover files (if any) from the PRINT_MANAGER_FILES_FOLDER folder.
// This is only in case some files were left over and the computer crashed or something
// and they have not been deleted on exit.
appSettings.deleteAppDataFiles();

roopa.initialize();
version.initialize();
printertypes.initialize();
materials.initialize();
profiles.initialize();
printerManager.initialize();

// handle a trial request
router.get('/roopa/hello', function (req, res, next) {
    var p = roopa.hello();
    if (p) {
        p.then(
            function (data) {
                res.send(data);
            },
            function (reason) {
                res.status(500);
                res.send(reason);
            }
        );
    } else {
        res.send({"result": "no opp"});
    }
});

app.use('/', router);
app.use('/version', version.Router());
app.use('/printdb/printertypes', printertypes.Router());
app.use('/print/printers', printerManager.Router());
app.use('/printdb/profiles', profiles.Router());
app.use('/print/jobs/', jobs.Router());
app.use('/print/tasks/', tasks.Router());
app.use('/print/trays/', trays.Router());
app.use('/files/', files.Router());
app.use('/geom/meshes', meshes.Router());
app.use('/printdb/materials/', materials.Router());

app.use('/console', express.static(__dirname + '/console'));
app.use('/config', require('./config').Router() );

/**
* ":id/jobs" [POST]
* Create a new job for a printer.
*   
* Note: This API is needed as per the Print API spec. currently, it just forwards request to the 
* "/jobs" [POST] API. we should delete the /print/jobs API and move this to printerManager router.
*/
router.post('/print/printers/:id/jobs', function (req, res, next){
    logger.debug('original url:', req.url);
    logger.debug('redirecting to : /print/jobs');
    req.url = '/print/jobs';
    req.body.printer_id = req.body.printer_id || req.params.id;
    req.body.file_id = req.body.file_id || req.body.printable_id || req.params.printable_id;
    req.body.profile_id = req.body.profile_id || (req.body.settings && req.body.settings.profile_id);
    next('route');
});

// Register an error handler which logs the error to file and returns
// the error to the API caller in the correct format.
//
function handleError(err, req, res, next) {
    if (err.logLevel === 'warning') {
        logger.warn(err.errorId + ': ' + err.message);
    } else {
        logger.error(err.errorId + ': ' + err.message);
    }
    res.status(err.status);
    res.send({
        error_id: err.errorId,
        code: err.code,
        message: err.message
    });
}

app.use(handleError);

module.exports = app;