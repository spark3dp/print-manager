var util = require('util'),
    events = require("events"),
    request = require('request'),
    _ = require('underscore'),
    path = require('path'),
    fs = require('fs'),
    Promise = require("node-promise").Promise,
    when = require("node-promise").when,
    Status = require('./status'),
    Command = require('./command'),
    DriverResponse = require('./driverResponse'),
    Heartbeat = require('heartbeater'),
    Jobs = require('../jobs'),
    JobStatus = require('./jobStatus'),
    Job = Jobs.Job,
    logger = require('../logging/PrintManagerLogger');

var usb;
try {
    usb = require('usb'); //NEEDS LIBUSB Binaries to work
} catch (ex) {
    logger.debug('cannot find usb module');
}

var Dremel = function (deviceData) {
    var that = this;
    var __dremelPrinter;
    var __endpointRead;
    var __endpointWrite;

    logger.debug('in dremel constructor, data' , deviceData);
    events.EventEmitter.call(this);

    this.cleanedUp = false;  // protect against double cleanup
    this.address = deviceData.address;
    this.name = deviceData.serviceName;
    this.connectionStatus = Status.State.CONNECTING;
    this.commandProcessor = new Heartbeat();
    this.commandProcessor.interval(100);
    this.commandProcessor.add(_.bind(this.checkNextCommand, this));
    this.stayConnected = new Heartbeat();
    this.stayConnected.interval(2000);
    this.stayConnected.add(_.bind(this.stayConnectedPing, this));
    this.progressUpdater = new Heartbeat();
    this.progressUpdater.interval(1000);
    this.progressUpdater.add(_.bind(this.sendProgress, this));
    this.deviceAddress = deviceData.deviceAddress;

    this.__vid = 0x2A89;
    this.__pid = 0x8889;
    this.__connected = false;
    this.__paused = false;
    this.__printing = false;
    this.__inject_command = false;
    this.__check_status = false;
    this.__status_sensor = 0;
    this.__temperatures = [];
    this.__position = undefined;
    this.percentComplete = 0;
    this.__gcodeParsed = undefined;
    this.__loadingFile = false;
    this.__loadedFile = false;
    this.__dremelStatus = undefined; // response from M119

    // Temporary fix to resolve lack of async loadModel functionality
    // Should only be used in loadModel()
    this.__cachedState = undefined;
    //

    this.file = undefined;
    this.localPath = undefined;
    this.__initialize_index = 0;
    this.__commandQueue = [];
    this.__currentCommand = undefined;
    this.__commandTimeout = this.COMMAND_TIMEOUT_DEFAULT;
    this.COMMAND_TIMEOUT_DEFAULT = 5;

    //start connecting
    when(this.connect(), function (result) {
            if (result && result.success) {
                that.connectionStatus = Status.State.CONNECTED;
                that.emit('event', 'ready', result);
            } else {
                logger.warn('connect() failed', result);
            }
        });
};

//allows to register event handlers
util.inherits(Dremel, events.EventEmitter);

Dremel.prototype.sendProgress = function() {
    var that = this;
    when(this.getStatus(), function (status) {
            if ((status.state !== Status.State.DISCONNECTED) &&
                (status.state !== Status.State.CONNECTING)) {
                //todo: keep the loop running for events that happen on the printer
                //todo: stop sending progress on job complete
                //todo: raise job complete event once done.
                that.emit('event', 'status', status);
            }
        });
};


Dremel.prototype.getStatus = function() {
    //COMMAND/RESPONSE REFERENCE:
    //M105 : get extruder and HBP Temperature: "T0: 25/220 T1: 25/220 B:25/100"
    //M114 : get current position: "X:10 Y:10 A:5 B:0"
    //M115 : get machine information: firmware, tools, etc
    //M119 : get machine status: endstop info, machine status, move mode
    //M27  : get current line number byte/bytes " byte #/#total..ok"
    var status = new Status();
    var that = this;

    if ((this.connectionStatus === Status.State.CONNECTING) ||
        (this.connectionStatus === Status.State.DISCONNECTED)) {
        status.state = this.connectionStatus;
        return status;
    } else {
        status.loadedFile = this.file;
        if (this.__loadingFile) {
            return DriverResponse.Success(Status.State.LOADING_MODEL);
        }
        if (this.__loadedFile) {
            return DriverResponse.Success(Status.State.MODEL_LOADED);
        }

        var deferred = new Promise();
        if (this.__connected) {
            var d1 = new Promise();
            this.queueCommands({ 'code' : 'M105', 'promise' : d1 });
            d1.promise.then(function (data) {
                    that.parseStatus(data, status);
                });

            var d2 = new Promise();
            this.queueCommands({ 'code' : 'M114', 'promise' : d2 });
            d2.promise.then(function (data2) {
                    that.parseStatus(data2, status);
                });

            var d3 = new Promise();
            this.queueCommands({ 'code' : 'M119', 'promise' : d3 });
            d3.promise.then(function (data3) {
                    that.parseStatus(data3, status);
                });

            var d4 = new Promise();
            this.queueCommands({ 'code' : 'M27', 'promise' : d4 });
            d4.promise.then(function (data4) {
                    try {
                        that.parseStatus(data4, status);

                        // Temporary fix to resolve lack of async loadModel
                        that.__cachedState = status.state;
                        //

                        deferred.resolve(status);
                    }
                    catch(ex) {
                        logger.error("Dremel getStatus exception is: " + ex);
                        deferred.resolve(status);
                    }
                });
        } else {
            status.state = Status.State.DISCONNECTED;
            deferred.resolve(status);
        }
        return deferred;
    }
};

// converts data returned in body and adds it to status JSON object 
Dremel.prototype.parseStatus = function(data, status) {
    var byteIndex,
    divisorIndex,
    length_progress,
    numerator,
    denominator,
    extruder0TempIndex,
    extruder1TempIndex,
    bedTempIndex,
    length_temperatures,
    extruder0Temp,
    extruder1Temp,
    bedTemp;

    var that = this;
    data = data.toString();    //convert data to string
    if (this.__status_sensor === 0) {  //if we are checking the temperature response
        extruder0TempIndex = data.indexOf("T0:");
        length_temperatures = data.length;
        extruder0Temp = parseInt(data.substring(extruder0TempIndex + 3,extruder0TempIndex + 6),10);

        status.tools.extruder = { type: 'extruder'};
        status.sensors.extruder = {
            type: 'temperature',
            description: 'extruder temperature sensor',
            temperature: undefined
        };
        status.sensors.extruder.temperature = extruder0Temp;

        this.__status_sensor = 1;
    }
    else if (this.__status_sensor === 1) {          
        //if we are checking the position data
        //this.__position    = data.substring(0, data.toString().length-6);
        // add position status here
        this.__status_sensor = 2;
        // status.tools.extruder0Position =
        // {
        //     "x":100,
        //     "y":100,
        //     "z":100
        // };
        //M114 returns "X:10 Y:10 Z:10 A:5 B:0"
        //X:49.30Y:91.68Z:0.30E:4.13 Count X: 53.90Y:94.61Z:-0.19
    }
    else if (this.__status_sensor === 2){
        var dremelStatusPrefix = 'MoveMode: ';
        var lines = data.split('\r\n');
        _.each(lines, function(line) {
            if (line.indexOf(dremelStatusPrefix) === 0) {
                that.__dremelStatus = line.slice(dremelStatusPrefix.length);
            }
        });

        this.__status_sensor = 3;
    }
    else if (this.__status_sensor === 3) {

        byteIndex = data.indexOf("byte");
        divisorIndex = data.indexOf("/");
        length_progress = data.length;
        numerator = parseInt(data.substring(byteIndex+5, divisorIndex),10);
        denominator = parseInt(data.substring(divisorIndex+1,length_progress-1),10);
        var wasPrinting = this.__printing;
        var midPrint = (numerator > 0) && (numerator < denominator);
        var percentComplete = 0;

        if (denominator > 0) {
            percentComplete = Math.round(100 * numerator/denominator);
        }

        /**** Handle dremel LCD states before standard state resolution ****/
        if (this.__dremelStatus === Dremel.State.PAUSED) {
            this.__printing = true;
            this.__paused = true;
        }

        else if (this.__dremelStatus === Dremel.State.READY){
            this.__printing = false;
            this.__paused = false;
            status.state = Status.State.READY;
        }

        // WAIT_ON_BUTTON state is seen when leveling the printer
        else if (this.__dremelStatus === Dremel.State.WAIT_ON_BUTTON){
            this.__printing = false;
            this.__paused = false;
            status.state = Status.State.MAINTENANCE;
        }

        // If dremel machine is printing or if it has a file being read
        else if ((this.__dremelStatus === Dremel.State.MOVING) || midPrint) {
            this.__printing = true;
            this.__paused = false;
        }


        /**** Now handle Dremel State ****/
        if (this.__connected === false) {
            status.state = Status.State.DISCONNECTED;
        }
        else if (this.__paused === true) {
            this.__paused = true;
            status.state = Status.State.PAUSED;
            status.job.percentComplete = percentComplete;
            status.job.state = JobStatus.State.PAUSED;
        }
        else if (this.__printing === true) {
            status.job.percentComplete = percentComplete;
            if (percentComplete === 100) {
                status.state = Status.State.READY;
                status.job.state = JobStatus.State.COMPLETED;
                this.__printing = false;
                this.__paused = false;
            } else {
                status.state = Status.State.PRINTING;
                status.job.state = JobStatus.State.PRINTING;
            }
        }
        else if (status.state === Status.State.MAINTENANCE){
            //Do Nothing
        }
        else {
            if (wasPrinting) {
                status.job.percentComplete = 100;
                status.job.state = JobStatus.State.COMPLETED;
            }
            status.state = Status.State.READY;
        }
        this.__status_sensor = 0;
        this.__check_status = false;    //done checking status, reset to normal
    }
    else {
        logger.warn("strange condition in get status ", this);
    }
};

/** Cleanup API */
/** The printer should clean the state. */
Dremel.prototype.cleanup = function(command, params) {
    if (this.cleanedUp) {
        return DriverResponse.Success(Status.State.DISCONNECTED);
    }

    logger.debug('Cleaning up dremel');
    this.progressUpdater.clear();
    this.commandProcessor.clear();
    this.stayConnected.clear();
    this.__endpointRead.removeAllListeners();
    this.__endpointWrite.removeAllListeners();

    var usbInterface = this.__dremelPrinter.interface(0);
    try {
        usbInterface.release(true, function(error) {
                logger.info('usbInterface.release failed, perhaps unplugged?', error);
            });
    } catch (err) {
        logger.info(err.message);
    }
    this.__endpointRead = undefined;
    this.__endpointWrite = undefined;
    this.cleanedUp = true;

    return DriverResponse.Success(Status.State.DISCONNECTED);
};

Dremel.prototype.precondition = function(command) {
    //for resume, the job should be paused
    //for start, the printer should be ready
    if (command === Command.PRINT) {
        return true;
    } else {
        return when(this.getStatus(), function (status) {
            //logger.debug('status=', status, 'state=', status.state);
            if (((command === Command.PRINT)  && (status.state !== Status.State.READY)) ||
                ((command === Command.RESUME) && (status.state !== Status.State.PAUSED))) {
                return false;
            }
            return true;
        });
    }
};

//** Command API*/
Dremel.prototype.command = function(data) {
    var command = data.command;
    var that = this;
    logger.debug('-- command = ', command);
    return when(this.precondition(command), function (satisfied) {
        //logger.debug('precondition was satisfied? : ', satisfied);
        //logger.debug('command data', data);
            var state = Status.State.ERROR;
            if (satisfied) {
                //return when(that.job(command), function(result) {
                //logger.info('in dremel command. job returned with result: ', result);
                switch (command) {
                case Command.PRINT:
                    that.print();
                    state = Status.State.PRINTING;
                    break;
                case Command.RESUME:
                    that.resume();
                    state = Status.State.PRINTING;
                    break;
                case Command.PAUSE:
                    that.pause();
                    state = Status.State.PAUSED;
                    break;
                case Command.LOAD_MODEL:
                    that.loadmodel(data);
                    state = Status.State.LOADING_MODEL;
                    break;
                case Command.CANCEL:
                    that.cancel();
                    state = Status.State.READY;
                    break;
                default:
                    return DriverResponse.Failure(Status.State.ERROR, DriverResponse.Errors.UNKNOWN_COMMAND);
                }
                return DriverResponse.Success(state);
            }
        });
};

Dremel.prototype.connect = function() {
    //Device -> PC: EndpointAddress: 0x81
    //PC -> Device: EndpointAddress: 0x1
    this.__commandQueue = []; // clear command queue on connect
    var deferred = new Promise();
    var self = this;
    if (!this.__connected) { //if the printer is not already connected, try to connect

        this.__dremelPrinter = new this.findByDeviceAddress(this.deviceAddress);

        if (!this.__dremelPrinter.open) {
            logger.warn('Failed to find a Dremel USB printer:', this.__dremelPrinter);
            return deferred.reject({ "command" : 'No USB Printer found' });
        }

        this.__dremelPrinter.open();
        var usbInterface = this.__dremelPrinter.interface(0);
        usbInterface.claim();
        this.__endpointRead = usbInterface.endpoint(0x81); //sets endpointRead to 0x81
        this.__endpointWrite = usbInterface.endpoint(0x1); //sets endpointWrite to 0x1

        this.__initializing = true;
        this.__connected = true;
        this.stayConnected.start(); // We are connected, kick off our 'stay connected' ping

        this.__endpointWrite.transferType = usb.LIBUSB_TRANSFER_TYPE_BULK; //change to bulk transfer mode

        this.listen();                  //call the listener function
        this.commandProcessor.start();

        var m115Response = {};
        this.queueCommands('M601 S0');
        this.queueCommands({ code : 'M115', processData : _.bind(validateM115, m115Response) });
        this.queueCommands('M650');

        this.queueCommands({ code : 'M114', postCallback : function () {
                    logger.debug('\n\nDremel Printer Connected');
                    deferred.resolve({ success : true, serialNumber : m115Response.serialNumber });
                    
                }
            });
    } else {
        deferred.reject({ "command" : "USB Printer is already connected" });
    }

    return deferred;
};

/**
 * validateM115()
 *
 * The M115 response contains our serial number
 */
function validateM115(inReply) {
    var that = this;
    var lines = inReply.toString().split('\r\n');
    _.each(lines, function(line) {
            var serialNumberPrefix = 'SN: ';
            if (line.indexOf(serialNumberPrefix) === 0) {
                that.serialNumber = line.slice(serialNumberPrefix.length);
            }
        });
    return validateReplyOK(inReply);
}

/**
 * listen()
 *
 * Add our processResponse data handler
 */
Dremel.prototype.listen = function () {
    var that = this;

    this.__endpointRead.startPoll(3,100); //open a streaming transfer from the endpoint
    this.__endpointRead.on("data", function (data) { //start the event loop listening
            that.processResponse(data);
        });

    this.__endpointRead.on('error', function(error) {
            logger.warn('Error on USB read end point: ', error);
            logger.warn('Error #' + error.errno);
            if (error.errno === usb.LIBUSB_TRANSFER_STALL || error.errno === 1) { // USB was pulled out.
                logger.warn('USBPrinter received LIBUSB_TRANSFER_STALL. USB was probably pulled out. ' +
                            'Attempting to release USB interface.');
                var usbInterface = that.__dremelPrinter.interface(0);
                usbInterface.release(false, function(error) {
                        if (error) {
                            logger.error('Error when releasing USB interface: ', error);
                        } else {
                            logger.warn('USB interface released');
                        }
                    });
                that.cleanup();
                that.emit('event', 'error', error);
            }
        });
};


/**
 * queueCommands()
 *
 * Queues up commands
 * Allows multiple arguments, arrays of commands and even nesting if you find
 * that useful.
 * Allows simple or complex commands as documented below
 *
 * Args:   arguments - Each argument may be either a simple gcode string command
 *                     or a more complex command of the form:
 *                     {
 *                         code         : <simple gcode here, no pre or post>,
 *                         rawCode      : <exact gcode here>,
 *                         promise      : <promise to resolve on reply 'ok'>,
 *                         preCallback  : <called before command executes>
 *                         processData  : <function to process replies, must
 *                                         return true when it sees the end of
 *                                         the command reply>
 *                         postCallback : <called after the end of the response is received>
 *                     }
 *                     If 'promise' is undefined it will not be called
 *                     If processData is undefined the default validateReplyOK()
 *                         will be used
 *         
 *         examples:
 *           this.queueCommands('M29'); // sends '~M29\r\n'
 *           this.queueCommands('M119', 'M105'); // sends '~M29\r\n', then '~M105\r\n'
 *           this.queueCommands(['M119', 'M105']); // same as above
 *           this.queueCommands('M29', ['M119', ['M29', 'M114'], 'M23'], 'G4 P');
 *           this.queueCommands({ code : 'M29', promise : <some promise> });
 *           this.queueCommands({ code : 'M29', procesData : <processing func> });
 *           this.queueCommands({ code : 'foo' }); // sends 'foo\r\n'
 *           this.queueCommands({ rawCode : 'foo' }); // sends 'foo' (no pre or post)
 *           this.queueCommands('M119', { code : 'M105', postCallback : <some callback> }, 'M29');
 *           this.queueCommands({ preCallback : <func>, code : 'M28' });
 *           this.queueCommands({ postCallback : <func>, code : 'M28' });
 *           // flattens all and sends in order
 * Return: N/A
 */
Dremel.prototype.queueCommands = function() {
    var argIndex, arrayIndex;
    var command;

    // Process all arguments in order
    for (argIndex = 0; argIndex < arguments.length; argIndex++) {
        command = arguments[argIndex];

        // Simple string is converted to a command object with a rawCode
        if (_.isString(command)) {
            this.queueCommands({ code : command }); // upconvert to simple command
        } else if (_.isArray(command)) {
            // For an array, process each command in order
            for (arrayIndex = 0; arrayIndex < command.length; arrayIndex++) {
                this.queueCommands(command[arrayIndex]);
            }
        } else {
            // Any non-string, non-array is treated as a command object and
            // required to have either a code or rawCode
            if (command.code) {
                if (command.rawCode) {
                    logger.error('queueCommands() requires "code" or "rawCode" but not both', command);
                } else {
                    command.rawCode = '~' + command.code + '\r\n';
                    delete command.code;
                }
            }

            this.__commandQueue.push(command);
        }
    }
};

/**
 * checkNextCommand()
 */
Dremel.prototype.checkNextCommand = function () {
    // If we have a current command, check to see if we have timed out and resend if necessary
    if (this.__currentCommand) {
        this.__commandTimeout--;
        if (this.__commandTimeout <= 0) {
            // Trying out resend.  Not ready for prime time just yet
            //                logger.debug('Resending command');
            //                this.sendCommand(); // resend

        }
    } else {
        // If we have no current command, go to the next if we have one
        if (this.__commandQueue.length > 0) {
            this.__currentCommand = this.__commandQueue.shift();
            this.sendCommand();
        }
    }
};

/**
 * sendCommand()
 *
 * Send off a command to the Dremel.
 *
 * Args:   N/A
 * Return: N/A
 */
Dremel.prototype.sendCommand = function () {
    var command, commandCode;

    if (this.__connected && this.__currentCommand) {
        command = this.__currentCommand;
        if (_.isFunction(command.preCallback)) {
            logger.debug('calling preCallback:');
            command.preCallback();
        }

        // If we have a command code, send it and wait on the response
        commandCode = this.__currentCommand.rawCode;
        if (commandCode) {
            logger.debug('sending command: ', commandCode.split('\r\n')[0]);
            this.__commandTimeout = this.COMMAND_TIMEOUT_DEFAULT;

            try {
                this.__endpointWrite.transfer(commandCode);
            } catch (exception) {
                logger.debug('__endpointwrite.transfer(' + commandCode + ')', exception);
                logger.debug('exception caught: ', exception);
            }
        } else {
            // If there is no command code, go directly to the next command
            this.__currentCommand = undefined;
        }
    }
};

/**
 * isIdle()
 *
 * We are considered idle if we have no active or queued commands.
 *
 * Args:   N/A
 * Return: true if idle
 */
Dremel.prototype.isIdle = function() {
    return (!this.__currentCommand &&
            (this.__commandQueue.length === 0) &&
            !this.__loadingFile);
};

/**
 * stayConnectedPing()
 *
 * The Dremel drops the USB connection if we don't keep in contact.
 * This is a regular ping to keep the connection alive, but only if we 
 * consider we are idle (see above for the definition).
 * Better might be to allow the connection to drop, and reestablish
 * when needed.  This could conserve power, but may drop context we need
 * so it needs investigation.
 *
 * Args:   N/A
 */
Dremel.prototype.stayConnectedPing = function () {
    if (this.isIdle()) {
        this.queueCommands('M119');
        this.queueCommands('M105');
    }
};

/**
 * validateReplyOK()
 *
 * Confirms if a reply contains 'ok' as its last line.  Parses out DOS newlines.
 *
 * Args:   inReply - USB reply data
 * Return: true if the last line was 'ok'
 */
function validateReplyOK(inReply) {
    var lines = inReply.toString().split('\r\n');

    return ((lines.length > 1) &&
            (lines[lines.length - 2] === 'ok'));
}

/**
 * processResponse()
 *
 * Process a response packet from the USB bus
 *
 * Args:   inData - data from USB
 */
Dremel.prototype.processResponse = function (inData) {
    var processDataFunc = validateReplyOK; // our default
    var command = this.__currentCommand;

    if (command) {
        // reset our timeout as we have heard from the Dremel
        this.__commandTimeout = this.COMMAND_TIMEOUT_DEFAULT;

        // Allow a custom data processing function if the command has one
        if (command.processData) {
            processDataFunc = command.processData;
        }

        // If our command is done processing, move on
        if (processDataFunc(inData)) {
            if (command.postCallback) {
                command.postCallback();
            }

            // GET RID OF THIS NOW THAT WE HAVE the 'processData' func
            if (command.promise) {
                command.promise.resolve(inData.toString());
            }

            // We have finished this command, go on to the next
            this.__currentCommand = undefined;
        }
    } else {
        logger.warn('*** Odd that we received a processResponse with no currentCommand', inData.toString());
    }
};



/**
 * loadmodel()
 *
 * Load model API
 *
 * Args:   modeldata
 * Return: Promise that returns a DriverResponse
 */
Dremel.prototype.loadmodel = function(modeldata) {

    var that = this;
    if (this.__cachedState !== Status.State.READY) {
        return DriverResponse.Failure(this.__cachedState, DriverResponse.Errors.BAD_STATE);
    }
    var deferred = new Promise();
    this.file = modeldata.path;
    this.__loadingFile = true;
    this.__loadedFile = false;
    logger.debug('-- loadmodel', this.file);

    var g3dremLoaded = fs.readFileSync(this.file);
    this.localPath = '0:/user/' + path.basename(this.file);
    this.queueCommands('M104 S0 T0', 'M104 S0 T1', 'M140 S0');

    var loadCommand = "M28 " + g3dremLoaded.length + ' ' + this.localPath;
    this.queueCommands({ code : loadCommand, postCallback : function() {
                var loadFileDuration = 20000 * g3dremLoaded.length/3000000;
                that.__dremelPrinter.timeout = loadFileDuration;

                //logger.debug("sending over the file now");
                try {
                    that.__endpointWrite.transfer(g3dremLoaded, function (error) {
                            if (error) {
                                logger.warn("the error is: " + error);
                            }

                            for (var x = 0; x < 15; x++) {
                                that.queueCommands({ preCallback : function () {} });
                            }

                            that.queueCommands('M29');
                            that.queueCommands({ preCallback : _.bind(that.doneLoading, that, deferred) });
                        });
                } catch(ex) {
                    logger.error("exception is: \n", ex);
                }
            }
        });
    return deferred;
};

/**
 * doneLoading()
 *
 * Called by our response parser when the file load is complete
 *
 * Args:   Promise to resolve
 * Return: N/A
 */
Dremel.prototype.doneLoading = function (inDeferred) {
    this.__loadingFile = false;
    this.__loadedFile = true;
    this.__dremelPrinter.timeout = 1000; // reset back to the normal timeout
    var status = new Status(Status.State.MODEL_LOADED);
    inDeferred.resolve(status);
    this.emit('event', 'status', status);
    logger.debug('done loading the file!!!');
};

/**
 * print()
 *
 * Kick off a print of the loaded file
 *
 * Args:   N/A
 * Return: boolean, but that is probably wrong
 */
Dremel.prototype.print = function() {
    logger.debug('Printing:', this.localPath);

    if (!this.__loadedFile) {
        logger.error('Trying to print when no file loaded');
        return false;
    }
    this.__loadedFile = false;

    this.queueCommands('M23 ' + this.localPath);
    this.progressUpdater.start();

    // *** NOTE ***
    // Should only set __printing true when it receives 'ok', use a processFunc
    this.__printing = true;
    this.__paused = false;
    this.emit('event', 'printing');

    return true;
};


/**
 * pause()
 *
 * Pause an in-progress print
 *
 * Args:   N/A
 * Return: DriverResponse
 */
Dremel.prototype.pause = function() {
    this.queueCommands('M25');
    this.progressUpdater.pause();
    this.__paused = true;
    this.emit('event', 'paused');
};

/**
 * resume()
 *
 * Resume an in-progress but paused print
 *
 * Args:   N/A
 * Return: DriverResponse
 */
Dremel.prototype.resume = function() {
    this.queueCommands('M24');
    this.progressUpdater.start();
    this.__paused = false;
    this.emit('event', 'resumed');
};


/**
 * cancel()
 *
 * Cancel an in-progress print
 *
 * Args:   N/A
 * Return: DriverResponse
 */
Dremel.prototype.cancel = function() {
    this.queueCommands('M26', { code : 'G1 X0 Y0 Z140', processData : validateG1 });
    this.progressUpdater.pause();
    this.__paused = false;
    this.__printing = false;
    this.emit('event', 'canceled');
};

/**
 * findByDeviceAddress()
 *
 * Finds a usbDevice from libusb's device list
 * THIS FUNCTION NEEDS TO BE MOVED OUT OF DREMEL TO GENERIC USBDISCOVERY
 *
 * Args:   deviceAddress
 * Return: usb device
 */
Dremel.prototype.findByDeviceAddress = function(inDeviceAddress) {
    var devices = usb.getDeviceList();
    for(var i = 0; i < devices.length; i++){
        if(devices[i].deviceAddress === inDeviceAddress){
            return devices[i];
        }
    }
    // _.each(devices, function(device){
    //     if(device.deviceAddress === deviceAddress){
    //         return device;
    //     }
    // });
};

/**
 * validateG1()
 *
 * Oddly the G1 command reponse does not contain 'ok' as a last line.  So we
 * need this custom validation to know we can move on to the next command.
 */
function validateG1(inReply) {
    return (inReply.toString() === 'CMD G1 Received.\r\n');
}



var createDremel = function (data) {
    return new Dremel(data);
};

Dremel.State = {
    HOMING : 'HOMING',
    WAIT_ON_TOOL : 'WAIT_ON_TOOL',
    MOVING : 'MOVING',
    PAUSED : 'PAUSED', 
    READY : 'READY',
    WAIT_ON_BUTTON : 'WAIT_ON_BUTTON'
};

module.exports = createDremel;
