var LineByLineReader = require('line-by-line'),
    util = require('util'),
    path = require('path'),
    _ = require('underscore'),
    fs = require('fs'),
    Promise = require("node-promise").Promise,

    DriverResponse = require('../driverResponse'),
    DriverBase = require('../drivers/driverBase'),
    Status = require('../status'),
    logger = require('../../logging/PrintManagerLogger'),
    printerTypes = require('../../../spark-print-data/printertypes').printerTypes,
    CommandQueue = require('./commandQueue');

var GcodeClient = function (inDeviceData, printerConfig) {
    var that = this;
    DriverBase.call(that);
    that.setState(Status.State.DISCONNECTED);

    that.VID = inDeviceData.VID; // USB Vendor ID
    that.PID = inDeviceData.PID; // USB Product ID

    that.lr = undefined; // buffered file line reader
    that.mPercentComplete = 0;

    that.expandCode = printerConfig.expandCode;
    that.validateReply = printerConfig.validateReply;
    that.mStatus = new Status(that.getState());
    that.mStatusInProgress = undefined;
    that.mUpdater = undefined;
    that.mGetStatusCommands = printerConfig.getStatusCommands;
    that.mPauseCommands = printerConfig.pauseCommands;
    that.mResumeCommands = undefined;
    that.mStopCommands = printerConfig.stopCommands;

    // milliseconds between retreiving printer status
    // set to -1 if not using
    that.mUpdateInterval = printerConfig.updateInterval;

    that.mPrinterType = _.find(
        printerTypes,
        function (inPrinterType) {
            return inPrinterType.id === inDeviceData.printerType;
        }
    );

    that.mQueue = new CommandQueue(
        printerConfig.setupExecutor(inDeviceData),
        that.expandCode,
        that.validateReply
    );

    that.connected();
};

// Derive from DriverBase
util.inherits(GcodeClient, DriverBase);

/**
 * loadmodel()
 *
 * Load a model asset so that it is prepared for streaming to printer
 *
 * Args:   inAsset - asset descriptor:
 *                   { type : 'file', path : '/foo/bar' }
 *                   { type : 'url' , url  : 'https://foo/bar' }
 * Return: DriverResponse
 */
GcodeClient.prototype.loadmodel = function(inAsset) {
    var that = this;
    var response = DriverBase.prototype.loadmodel.call(that);
    if (!response.success) {
        return response;
    }

    if (!that.readyToLoadFile(inAsset)) {
        that.loadmodelCompleted(false); // aborted load
        return DriverResponse.Failure(
            that.getState(),
            DriverResponse.Errors.BAD_ASSET
        );
    }

    that.mPercentComplete = 0;

    // We open the connection during loadmodel instead of print
    // to handle printers that send the file directly to the printer
    that.mQueue.queueCommands({
        open : true,
        postCallback : function (inCommand) {
            that.loadFileReader(inAsset);
            if(typeof(that.mUpdateInterval === 'number' && that.mUpdateInterval > 0)) {
                that.mUpdater = setInterval(function(){
                    that.updateStatus();
                }, that.mUpdateInterval);
            }
        }
    });

    return DriverResponse.Success(that.getState());
};

/**
 * loadFileReader()
 *
 * Create a LineByLineReader to read each line of gcode
 *
 * Args:   inAsset - asset descriptor:
 *                   { type : 'file', path : '/foo/bar' }
 *                   { type : 'url' , url  : 'https://foo/bar' }
 */
GcodeClient.prototype.loadFileReader = function(inAsset) {
    var that = this;
    that.lr = new LineByLineReader(inAsset.path);
    that.currentLine = 0;
    that.lr.pause(); // redundant

    that.lr.on('error', function (err) {
        logger.error('line reader error:', err);
    });

    // As the buffer reads each line, process it
    that.lr.on('line', function (line) {
        // pause the line reader immediately
        // we will resume it as soon as the line is done processing
        that.lr.pause();
        that.currentLine += 1;

        // We only care about the info prior to the first semicolon
        var strippedLine = line.split(';')[0];

        if(strippedLine.length <= 0){
            // If the line is blank, move on to the next line
            that.lr.resume();
        } else {
            that.mQueue.queueCommands({
                code: strippedLine,
                postCallback: function(){
                    that.mPercentComplete = parseInt(that.currentLine / that.numLines * 100);
                    if (that.getState() === Status.State.PRINTING) {
                        that.lr.resume();
                    }
                }
            });
        }
    });

    that.lr.on('end', function () {
        // Clean up the update function, if it exists
        if (that.mUpdater) {
            clearInterval(that.mUpdater);
            that.mUpdater = undefined;
        }
        logger.info("completed reading file,", inAsset.path, "is closed now.");

        // Turn off the printer and put it into parked position
        that.mQueue.queueCommands(that.mStopCommands(that));

        // Handle the job becoming completed
        // Close the connection, clear the file buffer,
        // and call the job 100% done, complete
        that.mQueue.queueCommands({
            close: true,
            postCallback : function (inCommand) {
                that.mPercentComplete = 100;
                that.mQueue.clear();
                that.lr = undefined;
                that.printCompleted();
            }
        });
    });

    // Get the number of lines in the file
    var numLines = 0;
    fs.createReadStream(inAsset.path)
    .on('data', function readStreamOnData(chunk) {
        numLines += chunk
        .toString('utf8')
        .split(/\r\n|[\n\r\u0085\u2028\u2029]/g)
        .length-1;
    })
    .on('end', function () {  // done
        that.numLines = numLines;
        that.loadmodelCompleted(true);
    });
};

/**
 * readyToLoadFile()
 *
 * Loading requires a closed connection and an existing file
 *
 * Args:   inAsset - asset descriptor:
 *                   { type : 'file', path : '/foo/bar' }
 *                   { type : 'url' , url  : 'https://foo/bar' }
 * Return: true if we can load the file
 */
GcodeClient.prototype.readyToLoadFile = function (inAsset) {
    var that = this;
    var ready = false;

    if (!that.mQueue.isOpen()) {
        try {
            var stat = fs.statSync(inAsset.path);
            if (stat.isFile()) {
                ready = true;
            } else {
                logger.warn('Asset is not a file:', inAsset);
            }
        } catch (ex) {
            logger.warn('SerialPrinter.loadmodel bad asset', inAsset, ex);
        }
    } else {
        logger.warn('GcodeClient.loadmodel requires a closed connection');
    }

    return ready;
};

/**
 * print()
 *
 * Start streaming gcode to the queue
 *
 * Args:   N/A
 * Return: DriverResponse
 */
GcodeClient.prototype.print = function () {
    var that = this;
    var response = DriverBase.prototype.print.call(that);
    if (!response.success) {
        return response;
    }

    that.mPercentComplete = 0;

    if (that.lr === undefined) {
        return DriverResponse.Failure(that.getState(), DriverResponse.Errors.MODEL_NOT_LOADED);
    }

    // Connection should already be open
    if (!that.mQueue.isOpen()) {
        return DriverResponse.Failure(that.getState(), DriverResponse.Errors.BAD_STATE);
    }

    that.lr.resume();

    response = DriverResponse.Success(that.getState());
    return response;
};

GcodeClient.prototype.pause = function(inParams) {
    var that = this;
    // Bail out if we are already paused or on superclass failure
    if (that.getState() === Status.State.PAUSED) {
        return DriverResponse.Success(that.getState());
    }

    var response = DriverBase.prototype.pause.call(that);
    if (!response.success) {
        return response;
    }

    // Get the extruder out of the way and retract a bit of fillament
    this.mQueue.prependCommands(that.mPauseCommands(that));
    return response;
};

GcodeClient.prototype.resume = function () {
    var that = this;
    // Bail out if we are already resume or on superclass failure
    if (that.getState() === Status.State.PRINTING) {
        return DriverResponse.Success(that.getState());
    }
    var response = DriverBase.prototype.resume.call(that);
    if (!response.success) {
        return response;
    }

    if(that.mResumeCommands !== undefined) {
        that.mQueue.prependCommands(that.mResumeCommands);
        that.mQueue.prependCommands({
            code: '',
            postCallback: function(){
                that.mResumeCommands = undefined;
            }
        });
    }
    that.mQueue.resume();
    that.lr.resume();
    return response;
};

GcodeClient.prototype.cancel = function() {
    var response = DriverBase.prototype.cancel.call(this);

    if (!response.success) {
        return response;
    }

    var that = this;

    if (that.mUpdater) {
        clearInterval(that.mUpdater);
        that.mUpdater = undefined;
    }

    that.mQueue.clear();
    that.mQueue.queueCommands(that.mStopCommands(that));
    that.mQueue.queueCommands({
        close : true,
        postCallback : function (inCommand) {
            that.mStatus = new Status(that.getState());
            that.mStatusInProgress = undefined;
        }
    });
    return DriverResponse.Success(this.getState());
};

GcodeClient.prototype.updateStatus = function() {
    var that = this;
    if (that.mStatusInProgress === undefined) {
        that.mStatusInProgress = new Status(that.getState());
        that.mQueue.queueCommands(that.mGetStatusCommands(that));
        that.mQueue.queueCommands({
            postCallback: function() {
                that.mStatusInProgress.job = {};
                that.mStatusInProgress.job.percentComplete = that.mPercentComplete;
                that.mStatus = that.mStatusInProgress;
                that.mStatusInProgress = undefined;
                if (that.mStatusPromise) {
                    that.mStatusPromise.resolve(that.mStatus);
                    that.mStatusPromise = undefined;
                }
            }
        });
    }
};

GcodeClient.prototype.getStatus = function() {
    var that = this;
    var status = new Status(that.getState());
    switch (status.state) {
    case Status.State.PRINTING:
    case Status.State.PAUSED:
        that.mStatus.state = status.state;
        // If the job is complete
        if (that.mPercentComplete >= 100) {
            status.job = {};
            status.job.percentComplete = that.mPercentComplete;
            if (that.mUpdater) {
                clearInterval(that.mUpdater);
                that.mUpdater = undefined;
            }
            // reset the status and the status in progress
            // return a sanitized 100% complete status
            that.mStatusInProgress = undefined;
            that.mStatus = new Status(that.getState());
            return status;
        }

        // If we aren't constantly checking for the status then create a promise
        // and return the status once it's done processing
        if (
            that.mUpdater === undefined && (that.mUpdateInterval === -1 || that.mUpdateInterval === undefined)
        ) {
            if (that.mStatusPromise === undefined) {
                that.mStatusPromise = new Promise();
                that.updateStatus();
            }
            return that.mStatusPromise;
        // Otherwise, just give them the most recent status
        } else {
            return that.mStatus;
        }
        break;
    default:
        return new Status(that.getState());
        break;
    }
};


////   HELPER FUNCTIONS  ////

/**
 * getParkCommand()
 *
 * Look up our park position and generate the Gcode to move to it
 */
GcodeClient.prototype.getParkCommand = function(inData) {
    var buildVolume, parkPosition, x, y, z, parkCommand;

    //Find the current Z position and park 1mm above it
    //TODO limit the Z position to be less than or equal to the maximum Z
    var regEx = /^X:(\d+\.\d+)Y:(\d+\.\d+)Z:(\d+\.\d+).*$/;
    var currentZ = (Number(inData.replace(regEx, "$3")) + 1) / 10;

    buildVolume = this.mPrinterType && this.mPrinterType.build_volume;
    if (buildVolume) {
        parkPosition = buildVolume.park_position;
        if (parkPosition) {
            x = parkPosition[0];
            y = parkPosition[1];
            z = currentZ; //parkPosition[2];
            parkCommand = 'G1 X' + x*10 + ' Y' + y*10 + ' Z' + z*10 + ' F4000';
        }
    }

    return parkCommand;
};

/**
 * parseExtrudeLength()
 *
 * Parse the output of the M114 command to get our current extrusion
 * length
 *
 * Args:   inData - response of the M114 command
 * Return: extrusion length (in float form)
 */
GcodeClient.prototype.parseExtrudeLength = function (inData) {
    var length = inData.replace(/.*E:(-?\d+\.\d+).*/, "$1");
    return length;
};

/**
 * parseCurrentPosition()
 *
 * Parse the output of the M114 command to get our current position.
 * It is of the form:
 *
 * Args:   inData - response of the M114 command
 * Return: current postion in the form: "X<x> Y<y> Z<z>"
 */
GcodeClient.prototype.parseCurrentPosition = function (inData) {
    var regEx = /^X:(\d+\.\d+)Y:(\d+\.\d+)Z:(\d+\.\d+).*$/;
    var curPos = inData.replace(regEx, "X$1 Y$2 Z$3");
    return curPos;
};
/// END HELPER FUNCTIONS ///


var createGcodeClient = function (data, printerConfig) {
    return new GcodeClient(data, printerConfig);
};

module.exports = createGcodeClient;