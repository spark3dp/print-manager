var util = require('util'),
    Promise = require('promise'),
    fs = require('fs'),
    path = require('path'),
    _ = require('underscore'),

    FDMTranslatorMarlin = require('./FDMTranslatorMarlin');

var FDMTranslatorPrintrbot = function(printerType, printerProfile, material, config) {
    FDMTranslatorMarlin.call(this, printerType, printerProfile, material, config);

    this.initialTemp = 0;
    this.initialBedTemp = 0;
    this.firstMoveProcessed = false;
};

util.inherits(FDMTranslatorPrintrbot, FDMTranslatorMarlin);

/**
 * Printrbot homing and start sequence will occur in the profile
 */
FDMTranslatorPrintrbot.prototype.convertHomeAxes = function(command) {
    return "";
};

/**
 * Create a nozzle temperature command
 *
 * @param {Object} command
 * @returns {string} line
 */
 FDMTranslatorPrintrbot.prototype.convertSetTempNozzle = function(command) {
    var line = "";
    this.initialTemp = this.numToString(command.nozzle_temp, this.precision.s);

    // Don't heat the nozzle until the bed is done heating
    if(this.initialBedTemp <= 0) {
        line += "M104 S" + this.initialTemp;
    }

    return this.postProcessLine(command, line);
};

/**
 * Create a bed temperature command
 *
 * @param {Object} command
 * @returns {string} line
 */
FDMTranslatorPrintrbot.prototype.convertSetTempBed = function(command) {
    var line = "";
    this.initialBedTemp = this.numToString(command.bed_temp, this.precision.s);
    line += "M140 S" + this.initialBedTemp;

    return this.postProcessLine(command, line);
};

/**
 * Custom command
 * Inject a custom gcode command string
 *
 * @param {Object} command
 * @returns {string} line
 */
FDMTranslatorPrintrbot.prototype.convertCustomCommand = function(command) {
    var line = "";
    if (command.custom.length > 0) {
        line += command.custom + "\n";
    }
    if (this.initialBedTemp > 0) {
        line += "M190 S" + this.initialBedTemp + "\n";
    }
    line += "M109 S" + this.initialTemp;

    return this.postProcessLine(command, line);
};

/**
 * Create a G1 command and then check for feed rate changes
 * If Feed Rate has changed since last command, append
 * F<number> to the G1 command
 *
 * @param {Object} command
 * @returns {string} line
 */
 FDMTranslatorPrintrbot.prototype.convertMove = function(command) {
 	if (this.firstMoveProcessed) {
 		var line = this.processAxesArray(command);
    	return line;
 	} else {
 		this.firstMoveProcessed = true;
 		return "";
 	}
};

module.exports = FDMTranslatorPrintrbot;
