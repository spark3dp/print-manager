/**
 * driverresponse.js
 *
 * DriverResponse is a class to capture responses from the DriverApi interface methods
 *
 * All responses are successful or unsuccessful (don't leave 'success' undefined)
 * Any response may have warnings (array of strings)
 * Unsuccessful responses may have errors (array of strings)
 * All responses contain the state of the driver at the time of the response
 *
 * DriverResponses may be annoted with additional data, for example the DriverApi.status()
 * will return a DriverResponse with {'status' : Status }
 * Note that DriverResponse.state and DriverResponse.status.state will be redundant here
 * but that is OK, not all responses have status.
 */
var Status = require('./status');

var DriverResponse = function () {
    this.success = true;       // true/false
    this.warnings = undefined; // array of warning strings
    this.errors = undefined;   // array of error strings
    this.state = undefined;    // printer state at the time of warning / error
};

DriverResponse.Success = function(inState, inWarnings) {
    var response = new DriverResponse;

    response.success = true;
    response.warnings = inWarnings;
    response.state = inState;

    return response;
};

DriverResponse.Failure = function(inState, inErrors, inWarnings) {
    var response = new DriverResponse;

    response.success = false;
    response.errors = inErrors;
    response.state = inState;
    response.warnings = inWarnings;

    return response;
};

DriverResponse.Errors = {
    UNKNOWN_ERROR    : 'An unknown error occured',
    UNKNOWN_COMMAND  : 'The command is not recognized',
    COMMAND_FAILED   : 'The command failed to execute',
    BAD_STATE        : 'The printer cannot execute command from existing state',
    MODEL_NOT_LOADED : 'Cannot print if no model has been loaded',
    BAD_ASSET        : 'An asset was corrupt or of the wrong type',
    CONNECTION_ERROR : 'There was a problem connecting'
};

module.exports = DriverResponse;
