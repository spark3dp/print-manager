var FDMTranslator = require('./FDMTranslator'),
    util = require('util'),
    fs = require('fs'),
    logger = require('../logging/PrintManagerLogger');

var FDMTranslatorMarlin = function(printerType, printerProfile, material, config) {
    var self = this;
    FDMTranslator.call(this, printerType, printerProfile, material);
    this.theFile = "";

    this.defaultVerbose = true;
    this.defaultVerboseFromMic = true; // Allow the mic file to change your verbose settings
    this.defaultPrecision = {
        "x" : 3,
        "y" : 3,
        "z" : 3,
        "e" : 5,
        "f" : 0,
        "p" : 0,
        "s" : 0
    };

    this.currentPos = {};
    this.AXES.forEach(function(axis) {
        var key = Object.keys(axis)[0];
        self.currentPos[key] = undefined;
    });

    this.setConfig(config);
};

util.inherits(FDMTranslatorMarlin, FDMTranslator);

FDMTranslatorMarlin.prototype.setConfig = function(config) {
    this.verbose = config === undefined || config.verbose === undefined ?
        this.defaultVerbose : config.verbose;

    this.precision = config === undefined || config.precision === undefined ?
        this.defaultPrecision : config.precision;

    this.verboseFromMic = config === undefined || config.verboseFromMic === undefined ?
        this.defaultVerboseFromMic : config.verboseFromMic;

};

/**
 * Starts the translation of the given FDM input file.
 *
 * @param {String} inputPath
 * @returns {Promise} - this is fulfilled if the translation succeeds,
 *                      and rejected if the translation fails.
 */
FDMTranslatorMarlin.prototype.endTranslation = function(outputPath) {
    fs.writeFileSync(outputPath, this.theFile);
};

FDMTranslatorMarlin.prototype.onHeader = function(header) {
};


FDMTranslatorMarlin.prototype.onCommand = function(command) {
    this.theFile += this.convertCommand(command);
};

/**
 * Takes a number and rounds it to <prec> significant digits
 *
 * @param {Float} num
 * @returns {String} number rounded to <prec>
 */
FDMTranslatorMarlin.prototype.numToString = function(num, prec) {
    if (prec !== undefined) {
        //round to <prec> digits and remove trailing zeros
        //return parseFloat(num.toFixed(prec)).toString();
        return Number(num).toFixed(prec).toString();
    } else {
        return num.toString();
    }
};

/**
 * Create a G1 commandx and then check for extrusion and feed rate changes
 * If Extrusion or Feed Rate have changed since last command, append
 * E<number> and/or F<number> to the G1 command
 *
 * @param {Object} command
 * @returns {string} line
 */
FDMTranslatorMarlin.prototype.convertExtrudeMove = function(command) {
    if (
        command.x.length === 0 &&
        command.y.length === 0 &&
        command.z.length === 0 &&
        command.e.length === 0 &&
        command.f[0] === 0
    ) {
        return "";
    } else {
        return this.processAxesArray(command);
    }
};

/**
 * Create a G1 command and then check for feed rate changes
 * If Feed Rate has changed since last command, append
 * F<number> to the G1 command
 *
 * @param {Object} command
 * @returns {string} line
 */
 FDMTranslatorMarlin.prototype.convertMove = function(command) {
    var line = this.processAxesArray(command);
    return line;
};

/**
 * Check for extrusion and feed rate changes
 * If Extrusion and Feed Rate have changed since last command, append
 * E<number> and F<number> to a G1 command
 *
 * @param {Object} command
 * @returns {string} line
 */
FDMTranslatorMarlin.prototype.convertExtrude = function(command) {
    this.currentPos['f'] = undefined; // force writing F for extrude command
    var line = this.processAxesArray(command);
    return line;
};

/**
 * Check for feed rate changes
 * If Feed Rate has changed since last command, append
 * F<number> to a G1 command
 *
 * @param {Object} command
 * @returns {string} line
 */
FDMTranslatorMarlin.prototype.convertSetFeedRate = function(command) {
    var line = this.processAxesArray(command);
    return line;
};

/**
 * Create a bed temperature command
 * If "wait" flag to wait for temp else set command and move on
 *
 * @param {Object} command
 * @returns {string} line
 */
FDMTranslatorMarlin.prototype.convertSetTempBed = function(command) {
    var line = "";
    if (command.wait) {
        line += "M190 S";
    } else {
        line += "M140 S";
    }
    line += this.numToString(command.bed_temp, this.precision.s);

    return this.postProcessLine(command, line);
};

/**
 * Create a nozzle temperature command
 * If "wait" flag to wait for temp else set command and move on
 *
 * @param {Object} command
 * @returns {string} line
 */
 FDMTranslatorMarlin.prototype.convertSetTempNozzle = function(command) {
    var line = "";

    if (command.wait) {
        line += "M109 S";
    } else {
        line += "M104 S";
    }
    line += this.numToString(command.nozzle_temp, this.precision.s);

    return this.postProcessLine(command, line);
};

/**
 * Create a fan speed command
 *
 * @param {Object} command
 * @returns {string} line
 */
FDMTranslatorMarlin.prototype.convertSetFanSpeed = function(command) {
    var line = "M106 S" + this.numToString(command.fan_speed, this.precision.s);
    return this.postProcessLine(command, line);
};

/**
 * Create a unit conversion command
 *
 * @param {Object} command
 * @returns {string} line
 */
 FDMTranslatorMarlin.prototype.convertSetUnits = function(command) {
    var line = "";
    switch(command.units) {
        case this.UNITS.MM:
            line += "G21";
            break;
        case this.UNITS.INCH:
            line += "G20";
            break;
        default:
    }

    return this.postProcessLine(command, line);
};

/**
 * Create a Disable Motor command
 *
 * @param {Object} command
 * @returns {string} line
 */
 FDMTranslatorMarlin.prototype.convertDisableMotors = function(command) {
    var line = "M84";
    return this.postProcessLine(command, line);
};

/**
 * Create a command to set printer units
 *
 * @param {Object} command
 * @returns {string} line
 */
FDMTranslatorMarlin.prototype.convertSetModeXYZ = function(command) {
    var line = "";
    if (command.mode === this.MODE_TYPE.ABS) {
        line += "G90";
    } else if (command.mode === this.MODE_TYPE.REL) {
        line += "G91";
    }

    return this.postProcessLine(command, line);
};

/**
 * Create a command to set printer to absolute or relative mode
 *
 * @param {Object} command
 * @returns {string} line
 */
FDMTranslatorMarlin.prototype.convertSetModeE = function(command) {
    var line = "";
    if (command.mode === this.MODE_TYPE.ABS) {
        line += "M82";
    } else if (command.mode === this.MODE_TYPE.REL) {
        line += "M83";
    }

    return this.postProcessLine(command, line);
};

/**
 * Create a command to re-declare extruder's current position
 *
 * @param {Object} command
 * @returns {string} line
 */
FDMTranslatorMarlin.prototype.convertResetExtrusionDistance = function(command) {
    var line = "G92 E" + command.e;
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
FDMTranslatorMarlin.prototype.convertPause = function(command) {
    var line = "G4 ";
    var delayTime = this.numToString(command.pause_time * 1000, this.precision.P);
    if (delayTime < 60000) {
        line += "P" + delayTime;
    } else {
        line += "S" + Math.round(delayTime / 1000);
    }

    return this.postProcessLine(command, line);
};

/**
 * Create a command to home the nozzle
 * Append an Axis to the string if it is included in the command
 *
 * @param {Object} command
 * @returns {string} line
 */
FDMTranslatorMarlin.prototype.convertHomeAxes = function(command) {
    var line = "G28";
    //If we're homing all of the axes to [0,0,0], simple issue a G28
    if (command.x.length === 1 && command.y.length === 1 && command.z.length === 1) {
        line += "";
    } else {
        if (command.x.length === 1) {
            line += " X" + this.numToString(command.x[0], this.precision.x);
        }
        if (command.y.length === 1) {
            line += " Y" + this.numToString(command.y[0], this.precision.y);
        }
        if (command.z.length === 1) {
            line += " Z" + this.numToString(command.z[0], this.precision.z);
        }
    }
    return this.postProcessLine(command, line);
};

/**
 * Create a comment
 *
 * @param {Object} command
 * @returns {string} line
 */
FDMTranslatorMarlin.prototype.convertComment = function(command) {
    var line = "";
    if (this.verbose) {
       line += "; " + command.comment;
    }
    return this.postProcessLine(command, line);
};

/**
 * Start print
 * This command currently does nothing
 *
 * @param {Object} command
 * @returns {string} line
 */
FDMTranslatorMarlin.prototype.convertStartPrint = function(command) {
    var line = "";
    return line;
};

/**
 * End print
 * This command currently does nothing
 *
 * @param {Object} command
 * @returns {string} line
 */
FDMTranslatorMarlin.prototype.convertEndPrint = function(command) {
    var line = "";
    return line;
};

/**
 * Custom command
 * Inject a custom gcode command string
 *
 * @param {Object} command
 * @returns {string} line
 */
FDMTranslatorMarlin.prototype.convertCustomCommand = function(command) {
    var line = "";
    if (command.custom.length > 0) {
        line += command.custom;
    }
    return this.postProcessLine(command, line);
};

FDMTranslatorMarlin.prototype.convertProgress = function(command) {
    return "";
};

FDMTranslatorMarlin.prototype.convertEndOfCommands = function(command) {
    return "";
};

FDMTranslatorMarlin.prototype.convertEstimates = function(command) {
    var self = this;
    if (command.comment.length > 0 && this.verboseFromMic) {
        try {
            JSON.parse(command.comment, function(k, v) {
                if (k === 'verbose') {
                    self.verbose = v;
                }
            });
        } catch (ex) {
            logger.warn("JSON parse error", ex);
        }
    }
    return "";
};

/**
 * Process a line
 * Adds a line break for each gcode line
 *
 * @param {Object} command
 * @returns {string} line
 */
FDMTranslatorMarlin.prototype.postProcessLine = function(command, line) {
    if (
        this.verbose
        && command.comment.length > 0
        && command.type !== this.COMMAND_TYPE.COMMENT
    ) {
        line += '; ' + command.comment;
    }

    if (line.length > 0) {
        line += '\n';
    }

    return line;
};

/**
 * Allow for an extra step after processing each command
 * This function currently does nothing
 *
 * @param {Object} command
 * @returns {string} line
 */
FDMTranslatorMarlin.prototype.postProcessCommand = function(inCommand, outCommand) {
    return outCommand;
};


/**
 * When processing a command, if there is an array of axes movement
 * Then determine which axes need to be processed once, or every time
 *
 * @param {Object} command
 * @returns {array}
 * commandArrayAxes   - An array of all axes that must be processed for each move
 * commandInitialAxes - An array of all axes that must be processed for the first movement
 * n_commands         - The number of total movements for this command
 */
FDMTranslatorMarlin.prototype.activeAxes = function(command) {
    // Create an array of axes that will be set on every command
    var commandArrayAxes = [];

    // Create an array of axes that will be set on only the first command
    var commandInitialAxes = [];

    // Assume there is only one command until we confirm there are more
    var n_commands = 1;
    this.AXES.forEach(function(axis) {
        var key = Object.keys(axis);
        if (command[key]) {
            if (command[key].length > 1) {
                commandArrayAxes.push(axis);
                n_commands = command[key].length;
            } else if (command[key].length === 1) {
                commandInitialAxes.push(axis);
            }
        }
    });
    return [commandArrayAxes, commandInitialAxes, n_commands];
};

/**
 * In the case that a command contains an array of axes movements
 * Process each movement, but on the first movement,
 * append any necessary initial parameters
 *
 * @param {Object} command
 * @returns {string} line
 */
FDMTranslatorMarlin.prototype.processAxesArray = function(command) {
    var self = this;
    var line = "";
    var axes = this.activeAxes(command);
    var commandArrayAxes = axes[0];
    var commandInitialAxes = axes[1];
    var n_commands = axes[2];
    for(var i = 0; i < n_commands; i++) {
        line += "G1";
        commandArrayAxes.forEach(function(axis){
            line += self.redundancyCheck(command, axis, i);
        });
        if (i === 0) {
            commandInitialAxes.forEach(function(axis){
                line += self.redundancyCheck(command, axis, i);
            });
        }
        line = this.postProcessLine(command, line);
    }
    return line;
};

/**
 * Review a segment in a movement command
 * If the axis doesn't move relative to its last movement beyond a threshold,
 * don't write a command for it
 *
 * @param {Object} command
 * @param {Object} axis     - which axis of the line segment to review
 * @param {Object} i        - The line segment index
 * @returns {string} line
 */
FDMTranslatorMarlin.prototype.redundancyCheck = function(command, axis, i) {
    var line = "";
    var key = Object.keys(axis)[0];
    var newPos = command[key][i];
    var difference;
    if (this.currentPos[key] !== undefined) {
        difference = Math.abs(this.currentPos[key] - command[key][i]);
    }
    if(
        // Current position has not yet been set
        this.currentPos[key] === undefined ||

        // The difference between the two movements is negligible
        difference > 0.00001 ||

        // The difference between the two movements is enough to change a significant digit
        this.numToString(command[key][i], this.precision[key]) !==
        this.numToString(this.currentPos[key], this.precision[key])
    ) {
        line += " " + axis[key] + this.numToString(command[key][i], this.precision[key]);
        this.currentPos[key] = newPos;
    }
    return line;
};

module.exports = FDMTranslatorMarlin;
