/*******************************************************************************
 * serial.js
 *
 * Extends DriverBase and implements a generic serial printer
 *
 * The SerialPrinter class uses a CommandQueue and supplies custom executor
 * which uses a SerialConnection to pass commands to the device.
 ******************************************************************************/
var _ = require('underscore'),
    fs = require('fs-extra'),
    util = require('util'),
    path = require('path'),
    Heartbeat = require('heartbeater'),
    DriverBase = require('./driverBase'),
    DriverResponse = require('../driverResponse'),
    Status = require('../status'),
    CommandQueue = require('./commandQueue'),
    SerialConnection = require('./serialConnection'),
    printerTypes = require('../../../spark-print-data/printertypes').printerTypes,
    logger = require('../../logging/PrintManagerLogger');


/**
 * Constructor
 *
 * Our serial connection will only be open when printing, not at all times.
 * So any command must first establish a connection if one is not already in
 * existence.
 *
 * Args:   inDeviceData - data necessary to start the connection
 *         inConfigData - Configuration sequences for specific variants of
 *                        serial printers (or undefined)
 *                        See setConfiguration() for the definition
 * Return: Constructed SerialPrinter
 */
var SerialPrinter = function(inDeviceData, inConfigData) {
    var printerType, connectionData;
    DriverBase.call(this); // superclass constructor

    this.setConfiguration(inConfigData || {}); // may be undefined coming in

    // Standard values
    this.name = inDeviceData.serviceName;
    this.mDynamicStreaming = undefined;
    this.mReturnFromPausedCommands = undefined;
    this.setState(Status.State.DISCONNECTED);
    this.mUpdater = new Heartbeat();
    this.mUpdater.interval(900); // not aligned with the 1sec status update
    this.mUpdater.add(_.bind(this.update, this));
    this.mUpdateQueued = false;

    this.mTotalCommandsForModel = 0; // dynamic streaming progress
    this.mBytesCompleted = 0;        // SD card printing progress
    this.mPercentComplete = 0;       // normalized progress percentage

    this.mPrinterType = _.find(printerTypes, function (inPrinterType) {
            return (inPrinterType.id === inDeviceData.printerType);
        });

    if (this.mPrinterType) {
        connectionData = _.find(this.mPrinterType.supported_connections, function(inData) {
                return (inData.type === 'serial');
            });
        if (connectionData) {
            this.mConnectionData = connectionData;
        }
    }

    if (this.mConnectionData) {
        this.mExecutor = new SerialCommandExecutor(inDeviceData.comName,
                                                   this.mConnectionData.baud,
                                                   this.mOpenPrime());
        this.mQueue = new CommandQueue(this.mExecutor,
                                       this.mExpandCode, this.mValidateReplyOK);

        // Unlike other drivers, we are considered connected if we have been
        // created, as this only happens when discovery has already made and
        // validated a serial USB connection.  Discovery will also
        // disconnect us, so in the mean time we leave the port closed if we
        // don't need to use it, but we say we are in the connected state.
        this.connected();
    } else {
        this.connectionFailed();
    }
};

// Derive from DriverBase
util.inherits(SerialPrinter, DriverBase);



SerialPrinter.PrintingMethod = {
    STREAMING : 'streaming',
    SD_CARD   : 'SD card'
}

/**
 * ValidateReplyOK()
 *
 * Confirms if a reply contains 'ok' as its last line.  Parses out DOS newlines.
 *
 * Args:   inReply - USB reply data
 * Return: true if the last line was 'ok'
 */
function ValidateReplyOK(inCommand, inReply) {
    var lines = inReply.toString().split('\r\n');
    return (_.last(lines) === 'ok');
};


/**
 * PauseResumeResponse()
 *
 * The pause/resume (M25/M24) commands may have a lot of response data after
 * the 'ok', but may not.  If it is present, it will look like:
 * 'ok'
 * 'Done printing file null'
 * 'echo:0 hours 0 minutes'
 * 'echo:enqueing "M84 X Y Z E"'
 * We need to strip them so they don't pollute the following commands.  When we
 * receive the initial 'ok', start a heartbeat (store in the command) to wait a bit.
 * If we receive the extra data, stop the heartbeat.  If the heartbeat actually
 * fires, we know the 'ok' was alone and we can continue.
 */
function PauseResumeResponse(inCommand, inData) {
    if (!inCommand.queue) {
        logger.error('PauseResumeResponse: This should be the current command ' +
                     'and the current command should have a queue');
    }
    if (ValidateReplyOK(inCommand, inData)) {
        inCommand.okTimeout = new Heartbeat();
        inCommand.okTimeout.interval(500);
        inCommand.okTimeout.add(function () {
                // We received an 'ok' and nothing immediately following, so
                // we can keep going
                inCommand.queue.commandProcessed(inCommand);
                inCommand.okTimeout.clear();
                delete inCommand.okTimeout;
            });
        inCommand.okTimeout.start();
        return false;  // Wait for more data or our timeout
    }

    // If we receive any extra data, stop our timeout
    if (inCommand.okTimeout) {
        inCommand.okTimeout.clear();
        delete inCommand.okTimeout;
    }

    return (inData === 'echo:enqueing "M84 X Y Z E"');
}


SerialPrinter.LOCAL_SD_CARD_FILENAME = 'printmgr.gco';
SerialPrinter.PAUSE_RETRACTION = 5.0;
// We expect we may have to send a command when we connect
SerialPrinter.OPEN_PRIME = 'M115';
SerialPrinter.STOP_COMMANDS = ['M26 S0'];
SerialPrinter.PAUSE_COMMANDS = [{ code : 'M25', processData : PauseResumeResponse}];


/**
 * setConfiguration()
 *
 * Take our config data and set our printer specific sequences from it
 *
 * Args:   inConfigData - object with optional values, all functions
 * {
 *     pauseRetraction - retraction length when pausing, in mm
 *     openPrime       - commands to send following the port open
 *     pauseCommands   - commands to send to ask the printer to pause
 *     resumeCommands  - commands to send to ask the printer to resume
 *     stopCommands    - commands to send to ask the printer to stop
 *     startCommands   - commands to send to ask the printer to start,
 *                        given a filename as an argument
 *     expandCode      - function to expand a code to be suitable for the printer
 *                        given a string code as an argument
 *     validateReplyOK - function to validate each basic command was received
 *                        given response data as an argument
 * }
 * Return: N/A
 */
SerialPrinter.prototype.setConfiguration = function (inConfigData) {
    this.mPauseRetraction = (inConfigData.pauseRetraction ||
                             function () { return SerialPrinter.PAUSE_RETRACTION; });
    this.mOpenPrime       = (inConfigData.openPrime       ||
                             function () { return SerialPrinter.OPEN_PRIME; });
    this.mPauseCommands   = (inConfigData.pauseCommands   ||
                             function () { return SerialPrinter.PAUSE_COMMANDS; });
    this.mResumeCommands  = (inConfigData.resumeCommands  || this.resumeCommands);
    this.mStopCommands    = (inConfigData.stopCommands    ||
                             function () { return SerialPrinter.STOP_COMMANDS; });
    this.mStartCommands   = (inConfigData.startCommands   || this.startCommands);
    this.mExpandCode      = (inConfigData.expandCode      || this.expandCode);
    this.mValidateReplyOK = (inConfigData.validateReplyOK || ValidateReplyOK);
};


/**
 * startCommands()
 *
 * Given an SD file, return an array of commands to start printing it
 * M23 takes our file name, and M24 starts the print.
 * Note that M24 is also resume and in that context has special response
 * processing, but in this initial case just receives the default 'ok'
 */
SerialPrinter.prototype.startCommands = function (inFilename) {
    return [ 'M23 ' + inFilename, 'M24'];
};

/**
 * resumeCommands()
 *
 * When we resume an SD card print, we need to restate the file we are
 * printing (why?  but we do), reset the bytes where we left off (M26)
 * before issuing the M24 to start again and capture its specific resume
 * response data.
 */
SerialPrinter.prototype.resumeCommands = function (inFilename) {
    return [
            'M23 ' + inFilename,
            'M26 S' + this.mBytesCompleted,
             { code : 'M24', processData : PauseResumeResponse },
           ];
};

/**
 * expandCode()
 *
 * Expand simple commands to gcode we can send to the printer
 *
 * Args:   inCode - a simple string gcode command
 * Return: a gcode string suitable for the hardware
 */
SerialPrinter.prototype.expandCode = function (inCode) {
    // Later add checksumming
    return inCode + '\n';
}

/**
 * loadmodel()
 *
 * Load a model asset so that it is prepared for printing.
 *
 * If we have detect an SD card on the printer, we stream the file to
 * it.
 *
 * If not, or if the download to the card fails, we stream gcode directly
 * to the device as it prints.
 *
 * Args:   inAsset - asset descriptor:
 *                   { type : 'file', path : '/foo/bar' }
 *                   { type : 'url' , url  : 'https://foo/bar' }
 * Return: DriverResponse
 */
SerialPrinter.prototype.loadmodel = function(inAsset) {
    var response = DriverBase.prototype.loadmodel.call(this);
    if (!response.success) {
        return response;
    }

    if (!this.readyToLoadFile(inAsset)) {
        this.loadmodelCompleted(false); // aborted load
        return DriverResponse.Failure(this.getState(), DriverResponse.Errors.BAD_ASSET);
    }

    this.mPercentComplete = 0;

    // To know if we can do SD or streaming, we have to open the connection to
    // see if we have an SD card.
    var that = this;
    this.mQueue.queueCommands({
            open : true,
            postCallback : function (inCommand) {
                if (!that.mExecutor.isSDCardAvailable()) {
                    // File will be streamed dynamically
                    that.mDynamicStreaming = { modelPath : inAsset.path };
                    that.loadmodelCompleted(true);
                } else {
                    // Push the asset the printer's SD card, loadModelCompleted() will
                    // be called when it is done
                    that.setState(Status.State.LOADING_MODEL);
                    that.streamFileToSDCard(inAsset.path);
                }
            }
        });

    return DriverResponse.Success(this.getState());
};


/**
 * readyToLoadFile()
 *
 * Loading requires an closed conneciton and an existing file
 *
 *
 * Args:   inAsset - asset descriptor:
 *                   { type : 'file', path : '/foo/bar' }
 *                   { type : 'url' , url  : 'https://foo/bar' }
 * Return: true if we can load the file
 */
SerialPrinter.prototype.readyToLoadFile = function (inAsset) {
    var ready = false;

    if (!this.mQueue.isOpen()) {
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
        logger.warn('SerialPrinter.loadmodel requires an open connection');
    }

    return ready;
};
/**
 * streamFileToSDCard()
 *
 * Send the file to the SD card on the device using M28 (start) and M29 (end)
 * with the commands of the gcode streamed inbetween.
 *
 * Args:   inPath - string path to the gcode file
 * Return: N/A
 */
SerialPrinter.prototype.streamFileToSDCard = function (inPath) {
    var that = this;

    // Our connection is already open
    this.mQueue.queueCommands('M28 ' + SerialPrinter.LOCAL_SD_CARD_FILENAME);

    this.mTotalCommandsForModel = 0;
    this.eachCommandOfFile(inPath, function (inCode) {
            that.mQueue.queueCommands(inCode);
            that.mTotalCommandsForModel++;
        });

    this.mQueue.queueCommands({ code : 'M29',
                                processData : function (inCommand, inData) {
                that.loadmodelCompleted(inData === 'Done saving file.');
                return true;
            }
        });
    // Leaves the connection open, as we expect the print next
};


/**
 * eachCommandOfFile()
 *
 * Processes a file of gcode, pulling out each command (stripping
 * comments and blank lines away) and passing it to a passed in function
 *
 * Args:   inFile         - file of gcode commands
 *         inFunc(inCode) - called for each code
 * Return: N/A
 */
SerialPrinter.prototype.eachCommandOfFile = function (inPath, inFunc) {
    try {
        var data = fs.readFileSync(inPath, "utf8");
        var commandArray = data.split('\n');
        // For gcode each line in our file
        _.each(commandArray, function (inCommand) {
                // strip out comments and blank lines
                var code = inCommand.split(';')[0];
                if (code !== "") {
                    inFunc(code);
                }
            });
    } catch (inError) {
        logger.warn('Failed to: Load  model file:', inError);
    }
};


/**
 * print()
 *
 * Start printing
 * We may be in either SD card mode (in which case the model should have been
 * loaded on the printer local SD card) or in streaming mode in which case we
 * stream gcode dynamically as we print
 *
 * Args:   N/A
 * Return: DriverResponse
 */
SerialPrinter.prototype.print = function () {
    var response = DriverBase.prototype.print.call(this);
    if (!response.success) {
        return response;
    }

    this.mPercentComplete = 0;
    this.mTotalCommandsForModel = 0;

    if (this.mDynamicStreaming) {
        // If streaming, confirm we have the file and queue up each command
        // to be sent
        var stat = fs.statSync(this.mDynamicStreaming.modelPath);
        if (!stat.isFile()) {
            return DriverResponse.Failure(this.getState(),
                                          DriverResponse.Errors.MODEL_NOT_LOADED);
        }

        // Connection should already be open
        if (!this.mQueue.isOpen()) {
            return DriverResponse.Failure(this.getState(),
                                          DriverResponse.Errors.BAD_STATE);
        }

        // Queue up our stream of commands
        var that = this;
        this.eachCommandOfFile(this.mDynamicStreaming.modelPath, function (inCode) {
                that.mTotalCommandsForModel++;
                that.mQueue.queueCommands(inCode);
            });

        // Now queue a close which completes the print
        this.mQueue.queueCommands({ close : true , postCallback : function(inCommand) {
                                          that.printCompleted();
                                      }
                                  });

        response = DriverResponse.Success(this.getState());
    } else {
        // If printing from the SD card, issue the command to start it off
        this.mQueue.queueCommands(this.mStartCommands(SerialPrinter.LOCAL_SD_CARD_FILENAME));

        // Leave the connection open, polling will determine when we have
        // completed our print and we can close it.
        this.mUpdater.start();
        this.mUpdateQueued = false;
    }

    return response;
};



/**
 * pause()
 *
 * Pause printing.  Move our extruder to the park position.
 * Use an array of commands to allow the SD card printing pause command
 * to be optional. Prepending individually would get the order wrong.
 *
 * Args:   N/A
 * Return: DriverResponse
 */
SerialPrinter.prototype.pause = function(inParams) {
    var that = this;

    // Bail out if we are already paused or on superclass failure
    if (this.getState() === Status.State.PAUSED) {
        return DriverResponse.Success(this.getState());
    }
    var response = DriverBase.prototype.pause.call(this);
    if (!response.success) {
        return response;
    }

    var commandArray = [];

    // If SD card printing, issue the command to pause
    if (!this.mDynamicStreaming) {
        commandArray.push(this.mPauseCommands());
    }

    // Get the extruder out of the way and retract a bit of fillament
    commandArray.push({
            code : 'M114',
            processData : function (inCommand, inData) {
                if (that.mValidateReplyOK(inCommand, inData)) {
                    return true;
                } else {
                    var extrudeLength = that.parseExtrudeLength(inData);

                    // Generate commands to return us to our position and extrusion
                    // length
                    var returnCommand = 'G1 ' + that.parseCurrentPosition(inData) + ' F9000';
                    var reExtrudeCommand = 'G1 E' + extrudeLength + 'F4000';
                    that.mReturnFromPausedCommands = [ returnCommand, reExtrudeCommand ];

                    // retract, then move to park position, then pause our queue
                    var retractLength = (extrudeLength - that.mPauseRetraction());
                    var retractCommand = 'G1 E' + retractLength + ' F4000';
                    that.mQueue.prependCommands(retractCommand,
                                                { code : that.getParkCommand(),
                                                  postCallback : function (inCommand) {
                                                        that.mQueue.pause();
                                                    }
                                                });
                }
            }
        });

    this.mQueue.prependCommands(commandArray);

    return response;
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
SerialPrinter.prototype.parseCurrentPosition = function (inData) {
    var regEx = /^X:(\d+\.\d+)Y:(\d+\.\d+)Z:(\d+\.\d+).*$/;
    var curPos = inData.replace(regEx, "X$1 Y$2 Z$3");
    return curPos;
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
SerialPrinter.prototype.parseExtrudeLength = function (inData) {
    var length = inData.replace(/.*E:(-?\d+\.\d+).*/, "$1");
    return length;
};


/**
 * getParkCommand()
 *
 * Look up our park position and generate the Gcode to move to it
 */
SerialPrinter.prototype.getParkCommand = function () {
    var buildVolume, parkPosition, x, y, z, parkCommand;

    buildVolume = this.mPrinterType && this.mPrinterType.build_volume;
    if (buildVolume) {
        parkPosition = buildVolume.park_position;
        if (parkPosition) {
            x = parkPosition[0];
            y = parkPosition[1];
            z = parkPosition[2];
            parkCommand = 'G1 X' + x*10 + ' Y' + y*10 + ' Z' + z*10 + ' F4000';
        }
    }

    return parkCommand;
};


/**
 * resume()
 *
 * Resume printing.  Since our files are in absolute coordinates, we can resume directly
 *
 * Args:   N/A
 * Return: DriverResponse
 */
SerialPrinter.prototype.resume = function () {
    // If we have moved into park, return to our position at the time of pause
    var response = DriverBase.prototype.resume.call(this);
    if (response.success && this.mReturnFromPausedCommands) {
        var commandArray = [];

        commandArray.push(this.mReturnFromPausedCommands);
        if (!this.mDynamicStreaming) {
            commandArray.push(this.mResumeCommands(SerialPrinter.LOCAL_SD_CARD_FILENAME));
        }

        this.mQueue.prependCommands(commandArray);

        this.mReturnFromPausedCommands = undefined;

        // Ensure we get another M27
        this.mUpdateQueued = false;
    }

    return response;
};

/**
 * cancel()
 *
 * Stop the currently printing job.
 *
 * If we are SD card printing, issue the stop command.
 * If we are dynamically streaming, clear our command queue, then push a command
 * to go to park and close the connection.
 *
 * Args:   N/A
 * Return: DriverResponse
 */
SerialPrinter.prototype.cancel = function() {
    var that = this;
    var response = DriverBase.prototype.cancel.call(this);

    if (!response.success) {
        return response;
    }

    if (this.mQueue.isOpen()) {
        this.setState(Status.State.BUSY); // until we are truly canceled
        // Stop whatever we were doing
        this.mQueue.clear();

        // Close and reopen our connection to force a full restart from the printer.
        // Note this also stops any active heating so we don't have to issue commands
        // to cool down the bed or extruder.
        // Then put us into a safe position and close again.
        this.mQueue.queueCommands({ close : true },
                                  // Windows seems to need a bit of a pause before the re-open
                                  { delay : 100 },
                                  { open : true },
                                  'G28', // G28 does a full reset to home
                                  { close : true,
                                    postCallback : function (inCommand) {
                                          that.setState(Status.State.READY);
                                      }
                                  });
    }

    return DriverResponse.Success(this.getState());
};


/**
 * getStatus()
 *
 * Return the current status of the printer
 *
 * Args:   N/A
 * Return: DriverResponse with "status = <Status object>"
 */
SerialPrinter.prototype.getStatus = function() {
    var response, processedCommands, percentComplete, status;
    var extruder, basePlate, extruderTemp, basePlateTemp;
    status = new Status(this.getState());

    switch (this.getState()) {
    case Status.State.PRINTING:
    case Status.State.PAUSED:
    case Status.State.LOADING_MODEL:
        status.job = {};
        // Progress is determined either by walking through the commands queued up
        // (streaming to the SD or direct printing) or by monitoring a print set in
        // motion after it has been streamed to the SD card.
        // The presence of known queued commands tells us which to expect.
        if (this.mTotalCommandsForModel > 0) {
            processedCommands = this.mExecutor.getCommandsProcessed();
            status.job.percentComplete = Math.round((processedCommands * 100) /
                                                    this.mTotalCommandsForModel);
        } else {
            status.job.percentComplete = this.mPercentComplete;
        }

        // Note streaming or SD based printing
        status.job.printMethod = (this.mDynamicStreaming ?
                                  SerialPrinter.PrintingMethod.STREAMING :
                                  SerialPrinter.PrintingMethod.SD_CARD);

        // Extruder and bed temperatures are printer specific, not job related
        extruderTemp = this.mExecutor.getExtruderTemp();
         if (extruderTemp) {
             extruder = { 'temperature' : extruderTemp };
             status.sensors['extruder1'] = extruder;
         }
         var basePlateTemp = this.mExecutor.getBasePlateTemp();
         if (basePlateTemp) {
             basePlate = { 'temperature' : basePlateTemp };
             status.sensors['basePlate'] = basePlate;
         }
         break;

     default:
         break;
     }

    return status;
 };


 /**
  * command()
  *
  * Send a device specific command to the printer
  *
  * Args:   inParams: Flexible object with at least { command : <command> }
  * Return: DriverResponse
  */
 SerialPrinter.prototype.command = function(inParams) {
     // No custom commands supported at the moment
     return DriverBase.prototype.command.call(this, inParams);
 };


 /**
  * cleanup()
  *
  * cleanup() is idempotent, and doesn't care if it was not connected.
  *
  * Args: N/A
  * Return: DriverResponse
  */
 SerialPrinter.prototype.cleanup = function () {
     // Our superclass call handles errors and cleaning us up
     var response = DriverBase.prototype.cleanup.call(this);

     // If that succeeds, do our driver specific cleanup
     if (response.success) {
         this.mQueue.cleanup();
     }

     return response;
 };


 /**
  * update()
  *
  * When SD card printing we send frequent queries to see our progress
  * and update our instance.
  *
  * This should only ever be called when we are printing, but in case
  * of race conditions (if one was on our event queue after we stop) we
  * check before queueing our query
  *
  * Args:   N/A
  * Return: N/A
  */
 SerialPrinter.prototype.update = function () {
     if (this.mUpdateQueued) { // don't queue more than one
         return;
     }

     var that = this;
     if (((this.getState() === Status.State.PRINTING) || 
          (this.getState() === Status.State.PAUSED)) &&
         this.mQueue.isOpen()) {
         this.mQueue.queueCommands({ code : 'M27',
                                     processData : function (inCommand, inData) {
                     var okReceived = that.mValidateReplyOK(inCommand, inData);
                     if (!okReceived) {
                         // Format is 'SD printing byte 1234/5678' so we can simply match
                         // for digits and it will pull out an array of [1234, 5678]
                         // Sometimes we get data we don't ask for (temp updates) so ignore them
                         var progressArray = inData.match(/\d+/g);
                         if (progressArray && (progressArray.length === 2) && (progressArray[1] > 0)) {
                             that.mBytesCompleted = progressArray[0];
                             var totalBytes = progressArray[1];
                             var percentage = (100 * that.mBytesCompleted) / totalBytes;
                             that.mPercentComplete = Math.floor(percentage);

                             if (that.mPercentComplete === 100) {
                                 that.mUpdater.pause();
                                 that.mQueue.clear();
                                 that.mQueue.queueCommands({ close : true, postCallback : function (inCommand) {
                                             that.printCompleted();
                                         }
                                     });
                             } else {
                                 that.mUpdateQueued = false;
                             }
                         }
                     }
                     return okReceived;
                 }
             });
         this.mUpdateQueued = true;
     }
 };


 /*******************************************************************************
  * SerialCommandExecutor()
  *
  * Constructor for the SerialCommandExecutor.  The command queue requests to
  * open and close the connection, and while open sends command strings to be
  * executed.
  *
  * This class uses SerialConnection() to establish and maintain our connection
  * open.
  *
  * Args:   inComName      - com port to which to connect
  *         inBaud         - baud rate at which to connect
  *         inOpenPrimeStr - function a string of commands to send to prime the conn
  */
var SerialCommandExecutor = function (inComName, inBaud, inOpenPrimeStr) {
     this.mComName = inComName;
     this.mBaud = inBaud;
     this.mOpenPrimeStr = inOpenPrimeStr;
     this.mConnection = undefined;
     this.mCommandsProcessed = undefined;

     this.mSDCardAvailable = false;
     this.mExtruderTemp = undefined;
     this.mBasePlateTemp = undefined;
 };


 /**
  * getCommandsProcessed()
  *
  * Accessor
  */
 SerialCommandExecutor.prototype.getCommandsProcessed = function () {
     return this.mCommandsProcessed;
 };


 /**
  * isSDCardAvailable()
  *
  * In our opening sequence the port notes the SD card status. We save
  * it and it is supplied here.
  */
 SerialCommandExecutor.prototype.isSDCardAvailable = function () {
     return this.mSDCardAvailable;
 };

 /**
  * getExtruderTemp()
  * getBasePlateTemp()
  */
 SerialCommandExecutor.prototype.getExtruderTemp = function () {
     return this.mExtruderTemp;
 };
 SerialCommandExecutor.prototype.getBasePlateTemp = function () {
     return this.mBasePlateTemp;
 };

 /**
  * open()
  *
  * The executor's open uses a SerialConnection object to establish a
  * stable connection.
  *
  * Args:   inDoneFunc - called when we complete our connection
  * Return: N/A
  */
 SerialCommandExecutor.prototype.open = function (inDoneFunc) {
     var that = this;
     this.mConnection = new SerialConnection(this.mComName, this.mBaud,
                                             this.mOpenPrimeStr,
                                             function (inData) {
                                                 if (inData.indexOf('echo:SD ') === 0) {
                                                     that.mSDCardAvailable = (inData === 'echo:SD card ok');
                                                 }
                                             },
                                             function () { inDoneFunc(true); });
     // ****** WHAT TO DO IF OPEN FAILS???? ********//
     this.mCommandsProcessed = 0;
 };

 /**
  * close()
  *
  * The executor simply closes any open port.
  *
  * Args:   inDoneFunc - called when we close our connection
  * Return: N/A
  */
 SerialCommandExecutor.prototype.close = function (inDoneFunc) {
     this.mConnection.close();
     inDoneFunc(true);
     this.mCommandsProcessed = undefined;
 };


 /**
  * execute()
  *
  * Send the requested command to the device, passing any response
  * data back for processing.
  *
  * Args:   inRawCode  - command to send
  *         inDataFunc - function to call with response data
  *         inDoneFunc - function to call if the command will have no response
  */
 SerialCommandExecutor.prototype.execute = function (inRawCode,
                                                     inDataFunc, inDoneFunc) {
     this.mConnection.setDataFunc(_.bind(this.filterTemp, this, inDataFunc));
     this.mConnection.send(inRawCode);
     this.mCommandsProcessed++;
 };

 /*******************************************************************************
  * End of SerialCommandExecutor
  *******************************************************************************/

 /**
  * Passively watch all responses and pull out temperature data
  * before passing it on
  */
 SerialCommandExecutor.prototype.filterTemp = function (inDataFunc, inData) {
     var that = this;

     inData.replace(/(.):(\d+.\d+)/g, function (inMatch, inLetter, inNumber) {
             switch (inLetter) {
             case 'B': that.mBasePlateTemp = inNumber; break;
             case 'T': that.mExtruderTemp    = inNumber; break;
             default: break;
             }
         });

     return inDataFunc(inData);
};

module.exports = SerialPrinter;
