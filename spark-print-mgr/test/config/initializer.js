var fs = require('fs'),
    config = require('../../config').config,
    files = require('../../files'),
    os = require('os'),
    Promise = require('promise'),
    Logger = require('../../logging/Logger');

var theLogger = new Logger({
    log_file_name: "print-manager-tests.log",
    write_to_console: false
});

var theFilesToRemove = [];

/**
 * Marks the given file for removal.  The file is removed when removeFiles() or cleanUp()
 * is called.
 *
 * @param filePath - the absolute path to the file.
 * @returns {boolean} - true if the file was successfully marked for removal; false otherwise.
 */
function addFileToRemove(filePath) {
    if (theFilesToRemove.indexOf(filePath) === -1 && fs.existsSync(filePath)) {
        theFilesToRemove.push(filePath);
        return true;
    }
    return false;
}

/**
 * Removes the files marked for removal.
 */
function removeFiles() {
    for (var i = 0; i < theFilesToRemove.length; ++i) {
        theLogger.info('Removing: ' + theFilesToRemove[i]);
        fs.unlinkSync(theFilesToRemove[i]);
    }
    theFilesToRemove = [];
}

function initialize(testServer) {
    return new Promise(function (resolve, reject) {
        // Disable logging in PrintManager
        //
        var pmLogger = require('../../logging/PrintManagerLogger');
        pmLogger.setEnabled(false);

        // Change the APP_DB_FOLDER to point to the temp directory. We need to do this
        // before app.js is read. We want the printers.db file to be placed in this
        // directory instead of using the real one.
        //
        var appSettings = require('../../config').appSettings;
        appSettings.APP_DB_FOLDER = os.tmpDir();

        // Add event listeners to cleanup any files that were uploaded or created.
        //
        testServer.addListener('file_uploaded', function (event) {
            theLogger.info('Uploaded:' + event.fileId);
            var file = files.find(event.fileId);
            addFileToRemove(file.path);
        });

        testServer.addListener('temp_file_created', function (event) {
            //console.log('Temp file created: ' + event.tempFilePath);
            addFileToRemove(event.tempFilePath);
        });

        testServer.addListener('internal_file_created', function (event) {
            theLogger.info('Created: ' + event.internalFileId);
            var internalFilePath = files.find(event.internalFileId).path;
            addFileToRemove(internalFilePath);
        });

        /**
         * Performs cleanup tasks.  Currently this includes removing files marked for removal.
         * Typically this would be called in the afterEach() method of a test suite.
         */
        var printerManager = require('../../printers/printerManager.js');
        testServer.addListener('clean_up', function (event) {
            theLogger.info('Cleaning up');
            removeFiles();
            printerManager.clearSavedPrintersDb();
        });

        // Change the timeout for Roopa Server for PrintManager testing.
        //
        config.roopa_server_timeout = 30;

        theLogger.info('Initialized TestServer for PrintManager');

        resolve();
    })
}

module.exports = initialize;