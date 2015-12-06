"use strict";

//Utils module loaded
var util = require('util');
var uuid = require('node-uuid');

/**
	Base class for all API errors
	errorMessage	: Message to be displayed to caller
	statusCode		: Http status code
	errorCode		: Internal error code for this error
	logLevel		: WARNING|DEBUG...
	errorId         : A GUID assigned to this error.
					  This GUID will be logged in error logs, in event analytics and sent to caller
*/
var APIError = function (errorMessage, statusCode, errorCode, logLevel, constr) {
	Error.call(this);
	Error.captureStackTrace && Error.captureStackTrace(this, constr || this);
	
	this.message = errorMessage || 'Error';
	this.status = statusCode || 400; // default to 400
	this.code = errorCode || -1;
	this.logLevel = logLevel || 'debug';
	this.errorId = uuid.v4();
	this.errorType = 'APIError';
};
util.inherits(APIError, Error);
module.exports = APIError;