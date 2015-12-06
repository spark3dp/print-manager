"use strict";

//Utils module loaded
var util = require('util');
var APIError = require('./APIError.js');

/**
	Creates different types of errors based on input error parameters
*/
var ErrorFactory = function (name, logLevel, statusCode) {
	var CustomAPIError = function (errorMessage, errorCode, statusCodeOverride) {
		CustomAPIError.super_.call(this, errorMessage, statusCodeOverride || statusCode , errorCode, logLevel, this.constructor);
		this.name = name;
	};
	util.inherits(CustomAPIError, APIError);
	return CustomAPIError;
};
module.exports = ErrorFactory;
