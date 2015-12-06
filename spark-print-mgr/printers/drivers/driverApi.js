/*******************************************************************************
 * driverApi.js
 *
 * Defines the API through which the print manager will call virtual print
 * drivers
 *
 * Drivers will generally not want to inherit directly from this (although they
 * may) but instead inherit from DriverBase, a subclass of our DriverApi that
 * adds in regular progress events during a print.
 *
 * Note that default DriverResponses from these API prototypes should not be
 * used and are for documentation value.  The API has no idea what state an
 * abstract driver might find itself in.
 ******************************************************************************/

var util = require('util'),
    events = require('events'),
    Status = require('../status'),
    DriverResponse = require('../driverResponse');

/**
 * Constructor, inherits from EventEmitter
 */
var DriverApi = function () {
    events.EventEmitter.call(this); // superclass construtor
};

// Inherit from EventEmitter to allow registration of event handlers for drivers
util.inherits(DriverApi, events.EventEmitter);


/**
 * getWorkingDir()
 *
 * Get the working directory where a virtual driver can place temporary
 * files during a print
 *
 * Args:   N/A
 * Return: path to a directory
 */
DriverApi.prototype.getWorkingDir = function() {
    /**** NOT A GOOD SOLUTION ****/
    /**** Needs discussion ****/
    return '/tmp';
};

/**
 * loadmodel()
 *
 * Load a model asset so that it is prepared for printing
 *
 * Args:   inAsset - asset descriptor:
 *                   { type : 'file', path : '/foo/bar' }
 *                   { type : 'url' , url  : 'https://foo/bar' }
 * Return: DriverResponse
 */
DriverApi.prototype.loadmodel = function(inAsset) {
    return DriverResponse.Success(Status.State.DISCONNECTED);
};

/**
 * print()
 * Start printing the previously uploaded model
 *
 * Args:   N/A
 * Return: DriverResponse
 */
DriverApi.prototype.print = function() {
    return DriverResponse.Success(Status.State.DISCONNECTED);
};

/**
 * cancel()
 *
 * Stop the currently printing job
 *
 * Args:   N/A
 * Return: DriverResponse
 */
DriverApi.prototype.cancel = function() {
    return DriverResponse.Success(Status.State.DISCONNECTED);
};

/**
 * pause()
 *
 * Pause the currently printing job
 *
 * Args:   N/A
 * Return: DriverResponse
 */
DriverApi.prototype.pause = function() {
    return DriverResponse.Success(Status.State.DISCONNECTED);
};

/**
 * resume()
 *
 * Resume printing a paused job
 *
 * Args:   N/A
 * Return: DriverResponse
 */
DriverApi.prototype.resume = function() {
    return DriverResponse.Success(Status.State.DISCONNECTED);
};

/**
 * getStatus()
 *
 * Return the current status of the printer
 *
 * Args:   N/A
 * Return: DriverResponse with "status = <Status object>"
 */
DriverApi.prototype.getStatus = function() {
    var response = DriverResponse.Success(Status.State.DISCONNECTED);

    response.status = new Status(response.state);

    return response;
};

/**
 * cleanup()
 *
 * Cleanup any state before this driver is shut down.
 *
 * Args:   N/A
 * Return: DriverResponse
 */
DriverApi.prototype.cleanup = function() {
    return DriverResponse.Success(Status.State.DISCONNECTED);
};

/**
 * command()
 *
 * Send a device specific command to the printer
 *
 * Args:   inParams: Flexible object with at least { command : <command> }
 * Return: DriverResponse
 */
DriverApi.prototype.command = function(inParams) {
    return DriverResponse.Success(Status.State.DISCONNECTED);
};

module.exports = DriverApi;
