var util = require('util'),
    Promise = require('promise'),
    fs = require('fs'),
    path = require('path'),
    _ = require('underscore'),

    FDMTranslatorMarlin = require('./FDMTranslatorMarlin');

var FDMTranslatorMakerbot = function(printerType, printerProfile, material, config) {
    this.homeSpeed = {
        xy : 2000,
        z : 900,
        z_slow : 100,
        move_to_wait : 3300
    };
    this.defaultVerbose = false;

    this.AXES = [
        {"x" : "X"},
        {"y" : "Y"},
        {"z" : "Z"},
        {"e" : "A"},
        {"f" : "F"}
    ];

    this.xPos = 0;
    this.yPos = 0;
    this.zPos = 0;
    this.fPos = 0;

    FDMTranslatorMarlin.call(this, printerType, printerProfile, material, config);
};

util.inherits(FDMTranslatorMakerbot, FDMTranslatorMarlin);

/**
 * Create a bed temperature command
 * If "wait" flag to wait for temp else set command and move on
 *
 * @param {Object} command
 * @returns {string} line
 */
FDMTranslatorMakerbot.prototype.convertSetTempBed = function(command) {
    var line = "";
    //Need to implement
    return this.postProcessLine(command, line);
};

/**
 * Create a nozzle temperature command
 * Makerbot does not have an option to wait for temp, it always waits
 *
 * @param {Object} command
 * @returns {string} line
 */
 FDMTranslatorMakerbot.prototype.convertSetTempNozzle = function(command) {
    var line = "";
    line += "M104 S";
    line += this.numToString(command.nozzle_temp, this.precision.s) + " T0";
    if(command.nozzle_temp > 0) {
        line += this.verbose ? '; wait for nozzle to reach temperature\n' : '\n';

        line += "G130 X20 Y20 A20 B20";
        line += this.verbose ? '; lower stepper vrefs while heating\n' : '\n';

        line += "M133 T0";
        line += this.verbose ? '; wait for nozzle to reach temperature\n' : '\n';

        line += "G130 X127 Y127 A127 B127";
        line += this.verbose ? '; set stepper motor vref to defaults\n' : '\n';
    } else {
        line += this.verbose ? '; turn off the extruder\n' : '\n';
    }
    return line;
};

/**
 * Create a fan speed command
 *
 * @param {Object} command
 * @returns {string} line
 */
FDMTranslatorMakerbot.prototype.convertSetFanSpeed = function(command) {
    var line = ""
    if (command.fan_speed > 0) {
        line += "M126 T0";
    } else {
        line += "M127 T0";
    }
    return this.postProcessLine(command, line);
};

/**
 * Create a unit conversion command
 *
 * @param {Object} command
 * @returns {string} line
 */
 FDMTranslatorMakerbot.prototype.convertSetUnits = function(command) {
    //Makerbot always assumes millimeters
    return "";
};

/**
 * Create a Disable Motor command
 *
 * @param {Object} command
 * @returns {string} line
 */
 FDMTranslatorMakerbot.prototype.convertDisableMotors = function(command) {
    var line = "M18 X Y Z A B"
    line += this.verbose ? "; turn off steppers\n" : "\n";
    return line;
};

/**
 * Create a command to set absolute or relative movement
 *
 * @param {Object} command
 * @returns {string} line
 */
FDMTranslatorMakerbot.prototype.convertSetModeXYZ = function(command) {
    var line = "";
    // verify if this should be implemented
    return line;
};

/**
 * Create a command to set extruder to absolute or relative mode
 *
 * @param {Object} command
 * @returns {string} line
 */
FDMTranslatorMakerbot.prototype.convertSetModeE = function(command) {
    var line = "";
    // verify if this should be implemented
    return line;
};

/**
 * Create a command to re-declare extruder's current position
 *
 * @param {Object} command
 * @returns {string} line
 */
FDMTranslatorMakerbot.prototype.convertResetExtrusionDistance = function(command) {
    var line = "G92 A0 B0";
    return this.postProcessLine(command, line);
};

/**
 * Create a command to dwell
 * The input command.pause_time is a Float in seconds
 * Delay time must be an integer
 * If delay time is less than 60 seconds, delay milliseconds
 * Otherwise, delay in seconds
 * This is a coarse implementation to prevent delay's great than 16-bit aka 65536
 *
 * @param {Object} command
 * @returns {string} line
 */
FDMTranslatorMakerbot.prototype.convertPause = function(command) {
    return "";
};

/**
 * Create a command to home the nozzle
 * Append an Axis to the string if it is included in the command
 *
 * @param {Object} command
 * @returns {string} line
 */
FDMTranslatorMakerbot.prototype.convertHomeAxes = function(command) {
    var line = "";
    if (command.x.length > 0 || command.y.length > 0) {
        line += "G162 ";
        if (command.x.length > 0) {
            line += "X ";
        }
        if (command.y.length > 0) {
            line += "Y ";
        }
        line += "F" + this.homeSpeed.xy;
        line += this.verbose ? "; home XY\n" : "\n";
    }
    if (command.z.length > 0) {
        line += "G161 Z F" + this.homeSpeed.z;
        line += this.verbose ? "; home Z axis minimum\n" : "\n";

        line += "G92 X0.000 Y0.000 Z-5.000 A0 B0";
        line += this.verbose ? "; set Z to -5\n" : "\n";

        line += "G1 Z0.0 F" + this.homeSpeed.z;
        line += this.verbose ? "; move Z to '0'\n" : "\n";

        line += "G161 Z F" + this.homeSpeed.z_slow;
        line += this.verbose ? "; home Z axis minimum\n" : "\n";
    }
    if (command.x.length > 0 || command.y.length > 0 || command.z.length > 0) {
        line += "M132 ";
        if (command.x.length > 0) { line += "X "; }
        if (command.y.length > 0) { line += "Y "; }
        if (command.z.length > 0) { line += "Z "; }
        line += "A B";
        line += this.verbose ? "; recall stored home offsets for XYZAB axis\n" : "\n";

        line += "G92 ";
        if (command.x.length > 0) {
            line += "X293.000 ";
        } else {
            line += "X0.000 ";
        }
        if (command.y.length > 0) {
            line += "Y153.000 ";
        } else {
            line += "Y0.000 ";
        }
        if (command.z.length > 0) {
            line += "Z0.000 ";
        } else {
            line += "Z10.000 ";
        }
        line += "A0 B0";
        line += this.verbose ? "; set coordinates\n" : "\n";
    }
    return line;
};

/**
 * Start print
 * This command currently does nothing
 *
 * @param {Object} command
 * @returns {string} line
 */
FDMTranslatorMakerbot.prototype.convertStartPrint = function(command) {
    var line = "M136"; //enable build
    return this.postProcessLine(command, line);
};

/**
 * End print
 * This command currently does nothing
 *
 * @param {Object} command
 * @returns {string} line
 */
FDMTranslatorMakerbot.prototype.convertEndPrint = function(command) {
    var line = "M72 P5"
    line += this.verbose ? "; play song\n" : "\n";

    line += "M137";
    line += this.verbose ? "; end print\n" : "\n";
    return line;
};

FDMTranslatorMakerbot.prototype.convertProgress = function(command) {
    line = "M73 P" + parseInt(command.progress * 100);
    line += this.verbose ? '; progress\n' : '\n';
    if (parseInt(command.progress * 100) === 100) {
        line += "M73 P" + parseInt(command.progress * 100);
        line += this.verbose ? '; progress\n' : '\n';
    }
    return line;
};

/**
 * In the case that a command contains an array of axes movements
 * Process each movement, but on the first movement,
 * append any necessary initial parameters
 *
 * @param {Object} command
 * @returns {string} line
 */
FDMTranslatorMakerbot.prototype.processAxesArray = function(command) {
    var self = this;
    var line = "";

    if (command.z.length > 0) {
        this.zPos = command.z[0];
    }

    var axes = this.activeAxes(command);
    // var commandArrayAxes = axes[0];
    // var commandInitialAxes = axes[1];
    var n_commands = axes[2];

    for(var i = 0; i < n_commands; i++) {
        line += "G1";
        if (command.x[i] !== undefined) { this.xPos = command.x[i]; }
        if (command.y[i] !== undefined) { this.yPos = command.y[i]; }
        if (command.z[i] !== undefined) { this.zPos = command.z[i]; }
        if (command.f[i] !== undefined) { this.fPos = command.f[i]; }
        if ( command.x.length > 0 || command.y.length > 0 || command.z.length > 0 ) {
            line += " X" + self.numToString(this.xPos, self.precision['x']);
            line += " Y" + self.numToString(this.yPos, self.precision['y']);
            line += " Z" + self.numToString(this.zPos, self.precision['z']);
            line += " F" + self.numToString(this.fPos, self.precision['f']);
            if ( command.e.length > 0) {
                line += " A" + self.numToString(command.e[i], self.precision['e']);
            }
        } else if (command.e.length > 0) {
            line += " A" + self.numToString(command.e[i], self.precision['e']);
            if (command.f[i] !== undefined) { this.fPos = command.f[i]; }
            line += " F" + self.numToString(this.fPos, self.precision['f']);
        } else if (command.f.length > 0) {
            line += " F" + self.numToString(this.fPos, self.precision['f']);
        }


        line = this.postProcessLine(command, line);
    }
    return line;
};

module.exports = FDMTranslatorMakerbot;
