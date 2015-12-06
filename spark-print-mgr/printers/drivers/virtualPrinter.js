/*******************************************************************************
 * virtualPrinter.js
 *
 * Extends the DriverBase and simulates a printer with all of the standard
 * command set.
 ******************************************************************************/
var _ = require('underscore'),
    util = require('util'),
    fs = require('fs-extra'),
    events = require('events'),
    path = require('path'),
    Heartbeat = require('heartbeater'),
    DriverBase = require('./drivers/driverBase'),
    DriverResponse = require('./driverResponse'),
    Status = require('./status'),
    logger = require('../logging/PrintManagerLogger'),
    Command = require('./command');


var VirtualPrinter = function() {
    DriverBase.call(this); // superclass constructor

    // This heartbeater will simulate general delays in state transition
    // Since states are exclusive, it will be used by only one state at a time
    this.mDelayHeartbeat = new Heartbeat();
    this.mDelayTotalTicks = 0;
    this.mDelayTicks = 0;

    this.mPrintProgress = 0;
    this.mModelLoaded = false;

    // Now that we have constructed, connect.  For a virtual driver we could
    // simulate some time delay getting connected, but for now just move directly
    // to the connected state.  The base class connected() is called to announce
    // our connection is complete.
    this.connected();
};

// Derive from DriverBase
util.inherits(VirtualPrinter, DriverBase);



/**
 * loadmodel()
 *
 * Load a model asset so that it is prepared for printing
 *
 * Args:   inAsset - asset descriptor:
 *                   { type : 'file', path : '/foo/bar' }
 *                   { type : 'url', url : 'https://foo/bar' }
 * Return: DriverResponse
 */
VirtualPrinter.prototype.loadmodel = function(inAsset) {
    var destination;
    var response = DriverBase.prototype.loadmodel.call(this);
    if (!response.success) {
        return response;
    }

    try {
        destination = this.getWorkingDir() + '/' + path.basename(inAsset.path);
    } catch(ex) {
        logger.debug("VirtualPrinter.loadmodel bad asset", inAsset, ex);
        this.loadmodelCompleted(false); // aborted load
        return DriverResponse.Failure(this.getState(), DriverResponse.Error.BAD_ASSET);
    }

    // Clear the way for the download
    try { fs.unlinkSync(destination); } catch(ex) {} // ignore failure

    // load for 1.5 seconds in half second chunks
    this.mDelayHeartbeat.interval(500);
    this.mDelayTotalTicks = 3;
    this.mDelayTicks = 0;
    this.mDelayHeartbeat.add(_.bind(loadDelayed, this, inAsset.path, destination));
    this.mDelayHeartbeat.start();

    return DriverResponse.Success(this.getState());
};

/**
 * loadDelayed()
 *
 * Simulate a file loading over time.  Each ioTicks increments from 0 to
 * inTotalTicks at which time we copy the file, stop our heartbeat and move out
 * of our loading state.
 */
function loadDelayed(inSource, inDestination) {
    this.mDelayTicks += 1;

    if (this.mDelayTicks >= this.mDelayTotalTicks) {
        fs.copySync(inSource, inDestination);
        this.mModelLoaded = true;
        this.mDelayHeartbeat.clear();

        this.loadmodelCompleted(true);
    }
}


/**
 * print()
 *
 * Start printing the previously uploaded model
 *
 * Args:   N/A
 * Return: DriverResponse
 */
VirtualPrinter.prototype.print = function() {
    var totalTicks = 10;
    var ticks = 0;

    var response = DriverBase.prototype.print.call(this);
    if (!response.success) {
        return response;
    }
    if (!this.mModelLoaded) {
        return DriverResponse.Failure(this.getState(), DriverResponse.Errors.MODEL_NOT_LOADED);
    }

    this.mPrintProgress = 0;

    // Print for about 8 seconds in .8 second increments
    this.mDelayHeartbeat.interval(800);
    this.mDelayTotalTicks = 10;
    this.mDelayTicks = 0;
    this.mDelayHeartbeat.add(_.bind(printDelayed, this));
    this.mDelayHeartbeat.start();

    return DriverResponse.Success(this.getState());
};


/**
 * printDelayed()
 *
 * Simulate printing a file over time.  Each ioTicks increments from 0 to
 * inTotalTicks and we update our percentage complete accordingly.
 * When complete, we move back to the Ready state
 * we write the corresponding percentage, and call modelLoaded() when complete to
 * notify our state machine and consumers that file loading is complete.
 */
function printDelayed() {
    if (this.getState() === Status.State.PRINTING) {
        this.mDelayTicks += 1;
        this.mPrintProgress += Math.round(100  / this.mDelayTotalTicks);
    }

    logger.debug("progress = ", this.mPrintProgress);
    if (this.mDelayTicks >= this.mDelayTotalTicks) {
        this.mPrintProgress = 100;
        this.mDelayHeartbeat.clear();

        this.printCompleted();
    }
}


/**
 * cancel()
 *
 * Stop the currently printing job
 *
 * Args:   N/A
 * Return: DriverResponse
 */
VirtualPrinter.prototype.cancel = function() {
    var response = DriverBase.prototype.cancel.call(this);
    if (!response.success) {
        return response;
    }

    this.mPrintProgress = 0;
    this.mDelayHeartbeat.clear();

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
VirtualPrinter.prototype.getStatus = function() {
    var that = this;
    var status = new Status(this.getState());
    
    if ((this.connectionStatus !== Status.State.CONNECTING) &&
        (this.connectionStatus !== Status.State.DISCONNECTED)) {
        if ((this.getState() === Status.State.PRINTING) || (this.getState() === Status.State.PAUSED)) {
            status.job = {};
            status.job.percentComplete = this.mPrintProgress;
        }
    }
    return status;
};

/**
 * We simmulate a few custom commands
 */
VirtualPrinter.CustomCommands = {
    CUSTOM_1 : 'custom command #1',
    CUSTOM_2 : 'custom command #2',
    CUSTOM_3 : 'custom command #3'
};


/**
 * command()
 *
 * Send a device specific command to the printer
 *
 * Args:   inParams: Flexible object with at least { command : <command> }
 * Return: DriverResponse
 */
VirtualPrinter.prototype.command = function(inParams) {
    var response;
    switch (inParams.command) {
    case Command.PAUSE:
        this.pause();
        break;
    case Command.RESUME:
        this.resume();
        break;
    case Command.CANCEL:
        this.cancel();
        break;
    case VirtualPrinter.CustomCommands.CUSTOM_1:
    case VirtualPrinter.CustomCommands.CUSTOM_2:
    case VirtualPrinter.CustomCommands.CUSTOM_3:
        logger.debug('Received custom command:', inParams);
        response = DriverResponse.Success(this.getState());
        break;

    default:
        response = DriverBase.prototype.command.call(this, inParams);
    }

    return response;
};


/**
 * cleanup()
 *
 * cleanup() is idempotent, and doesn't care if it was not connected.
 *
 * Args: N/A
 * Return: DriverResponse
 */
VirtualPrinter.prototype.cleanup = function() {
    // Our superclass call handles errors and cleaning us up
    var response = DriverBase.prototype.cleanup.call(this);

    // If that succeeds, do our driver specific cleanup
    if (response.success) {
        // Add a cleanup delay here ???
        // Seems the outside world just gives us one second...
    }

    return response;
};


var createVirtualPrinter = function (data) {
    return new VirtualPrinter(data);
};

module.exports = createVirtualPrinter;
