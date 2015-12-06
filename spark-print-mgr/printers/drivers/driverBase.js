/*******************************************************************************
 * driverBase.js
 *
 * Extends the DriverApi API to send regular getStatus() update events back to the
 * print manager while a job is printing.
 ******************************************************************************/

var _ = require('underscore'),
    util = require('util'),
    events = require('events'),
    when = require('node-promise').when,
    Heartbeat = require('heartbeater'),
    DriverApi = require('./driverApi'),
    DriverResponse = require('../driverResponse'),
    Status = require('../status'),
    logger = require('../../logging/PrintManagerLogger'),
    Command = require('../command');

/**
 * constructor
 *
 * The constructor is responsible for coming up to a connected and ready
 * state.
 */
var DriverBase = function () {
    DriverApi.call(this); // superclass constructor

    // Create the heartbeater that will trigger our status events
    // We start out in a non-printing state, so add but do not start this
    // heartbeater until needed
    this.mProgressHeartbeat = new Heartbeat();
    this.mProgressHeartbeat.interval(1000);
    this.mProgressHeartbeat.add(_.bind(this.sendprogress, this));

    // The base class can't know what a subclass will need to do so it
    // comes up in a DISCONNECTED state and relies on the subclass to
    // address it, and call back to our connected() method when done.
    this.mState = Status.State.DISCONNECTED;
};

// Inherit our interface from DriverApi
util.inherits(DriverBase, DriverApi);


/**
 * getState/setState()
 *
 * Getter/setter
 */
DriverBase.prototype.getState = function () {
    return this.mState;
};
DriverBase.prototype.setState = function (inState) {
    this.mState = inState;
};


/**
 * connected()
 *
 * Declare the driver to be connected.  Called from a subclass to set the
 * proper state and emit the right event.  We want to queue delay this as
 * when the driver is initially constructed the RPC reverse channel is not
 * yet set up.
 *
 * Args:   N/A
 * Return: DriverResponse
 */
DriverBase.prototype.connected = function () {
    if (this.getState() !== Status.State.DISCONNECTED) {
        return DriverResponse.Failure(this.getState(), DriverResponse.Errors.BAD_STATE);
    }

    this.setState(Status.State.READY);

    // Driver startup is complicated as we don't have an RPC back channel
    // until after our constructor returns.  So we can't emit the 'ready'
    // from that constructor.
    // Since 'connected()' may be called from the constructor, we want a
    // one shot heartbeater to queue delay the emit.
    var connectedHeartbeat = new Heartbeat();
    connectedHeartbeat.interval(100);
    var that = this;
    connectedHeartbeat.add(function () {
            connectedHeartbeat.clear();
            that.emit('event', that.getState());
        });
    connectedHeartbeat.start();

    return DriverResponse.Success(this.getState());
};


/**
 * connectionFailed()
 *
 * Declare that the driver failed to connect.  Called from a subclass, this will
 * set us to an error state and emit an error event
 *
 * Args:   N/A
 * Return: DriverResponse
 */
DriverBase.prototype.connectionFailed = function () {
    logger.warn('failed to connect');
    this.setState(Status.State.DISCONNECTED);
    this.emit('event', this.getState());

    return DriverResponse.Success(this.getState());
};


/**
 * loadmodel()
 *
 * Loading of a model has started.  This starts our progress heartbeater
 * so we can emit updates so the service has updates until loadModelCompleted()
 * is called
 *
 * Args:   inAsset - asset descriptor:
 *                   { type : 'file', path : '/foo/bar' }
 *                   { type : 'url' , url  : 'https://foo/bar' }
 * Return: DriverResponse
 */
DriverBase.prototype.loadmodel = function (inAsset) {
    var response = DriverResponse.Failure(this.getState(), DriverResponse.Errors.BAD_STATE);

    if (this.getState() === Status.State.READY) {
        logger.debug('Loading model started');
        this.mProgressHeartbeat.start();
        this.setState(Status.State.LOADING_MODEL);
        response = DriverResponse.Success(this.getState());
    }

    return response;
};


/**
 * loadmodelCompleted()
 *
 * Called by a subclass when a model has completed, either successfully
 * or if it was aborted
 *
 * Args:   inSuccessful - true if we loaded, false if we aborted
 * Return: N/A
 */
DriverBase.prototype.loadmodelCompleted = function (inSuccessful) {
    logger.debug('Model Loaded, success:', inSuccessful);
    this.mProgressHeartbeat.pause();
    if (inSuccessful) {
        this.setState(Status.State.MODEL_LOADED);
    } else {
        this.setState(Status.State.READY);
    }
    this.sendprogress();
};


/**
 * print()
 *
 * Printing is starting, which is our trigger to start our heartbeater for
 * regular status updates.
 *
 * Return: DriverResponse
 */
DriverBase.prototype.print = function(params) {
    var response = DriverResponse.Failure(this.getState(), DriverResponse.Errors.BAD_STATE);

    if (this.getState() === Status.State.MODEL_LOADED) {
        logger.debug('Print started');
        this.mProgressHeartbeat.start();
        this.setState(Status.State.PRINTING);
        response = DriverResponse.Success(this.getState());
    }

    return response;
};


/**
 * printCompleted()
 *
 * Called by a subclass when a print has completed
 *
 * Args:   N/A
 * Return: N/A
 */
DriverBase.prototype.printCompleted = function () {
    logger.debug('Print completed');
    this.mProgressHeartbeat.pause();
    this.sendprogress();
    this.setState(Status.State.READY);
};


/**
 * cancel()
 * Stop printing, which is our trigger to stop our heartbeater
 *
 * Args:   N/A
 * Return: DriverResponse
 */
DriverBase.prototype.cancel = function(params) {
    logger.debug('Print canceled');
    var response = DriverResponse.Failure(this.getState(), DriverResponse.Errors.BAD_STATE);

    if ((this.getState() === Status.State.PRINTING) ||
        (this.getState() === Status.State.LOADING_MODEL) ||
        (this.getState() === Status.State.PAUSED)) {
        this.mProgressHeartbeat.pause();
        this.setState(Status.State.READY);
        response = DriverResponse.Success(this.getState());
    }

    return response;
};


/**
 * pause()
 *
 * Pause printing, which is our trigger to pause our heartbeater.  Pause is idempotent.
 *
 * Args:   N/A
 * Return: DriverResponse
 */
DriverBase.prototype.pause = function(params) {
    var response;

    if ((this.getState() === Status.State.PRINTING) ||
        (this.getState() === Status.State.PAUSED)) {
        response = DriverResponse.Success(this.getState());
    } else {
        response = DriverResponse.Failure(this.getState(), DriverResponse.Errors.BAD_STATE);
    }

    if (this.getState() === Status.State.PRINTING) {
        this.mProgressHeartbeat.pause();
        this.setState(Status.State.PAUSED);
    }

    return response;
};


/**
 * resume()
 *
 * Resume printing, which is our trigger to resume our heartbeater.  Resume is idempotent.
 *
 * Args:   N/A
 * Return: DriverResponse
 */
DriverBase.prototype.resume = function () {
    var response;

    if ((this.getState() === Status.State.PRINTING) ||
        (this.getState() === Status.State.PAUSED)) {
        response = DriverResponse.Success(this.getState());
    } else {
        response = DriverResponse.Failure(this.getState(), DriverResponse.Errors.BAD_STATE);
    }

    if (this.getState() === Status.State.PAUSED) {
        this.mProgressHeartbeat.resume();
        this.setState(Status.State.PRINTING);
    }

    return response;
};

/**
 * command()
 *
 * By definition these are commands not common to DriverBase so we error
 *
 * Args:   inParams: Flexible object with at least { command : <command> }
 * Return: DriverResponse
 */
DriverBase.prototype.command = function (inParams) {
    // *** TEMPORARY UNTIL THE DRIVER MODEL CHANGE *** //
    switch (inParams[Command.COMMAND]) {
    case Command.PRINT:
        return this.print(inParams);
    case Command.CANCEL:
        return this.cancel(inParams);
    case Command.PAUSE:
        return this.pause(inParams);
    case Command.RESUME:
        return this.resume(inParams);
    }

    // *** THIS IS THE LONGER TERM IMPLEMENTATION *** //
    logger.debug('Received unknown command:', inParams);
    return DriverResponse.Failure(this.getState(), DriverResponse.UNKNOWN_COMMAND);
};


/**
 * cleanup()
 *
 * cleanup() is idempotent, and doesn't care if it was already disconnected.
 *
 * Args:   N/A
 * Return: DriverResponse
 */
DriverBase.prototype.cleanup = function () {
    if (this.getState() !== Status.State.DISCONNECTED) {
        this.mProgressHeartbeat.clear();
        this.setState(Status.State.DISCONNECTED);
    }
    this.mProgressHeartbeat = undefined;

    return DriverResponse.Success(this.getState());
};



/**
 * sendprogress()
 *
 * Regularly queries getStatus() while a job is running to emit events back to
 * the print manager
 *
 * Args:   N/A
 * Return: N/A
 */
DriverBase.prototype.sendprogress = function () {
    var that = this;
    when(this.getStatus(), function (status) {
            if ((status.state !== Status.State.DISCONNECTED) &&
                (status.state !== Status.State.CONNECTING)) {
                logger.debug('sending status');
                //todo: keep the loop running for events that happen on the printer
                //todo: stop sending progress on job complete
                //todo: raise job complete event once done.
                that.emit('event', 'status', status);
            }
        });
};

module.exports = DriverBase;
