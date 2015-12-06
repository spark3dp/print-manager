var FDMReader = require('./FDMReader'),
    Translator = require('./Translator'),
    util = require('util');

/**
 * The FDMTranslator is the base class for FDM translators.  Three methods
 * must be implemented:
 * - {@link FDMTranslator#onHeader}
 * - {@link FDMTranslator#onCommand}
 * - {@link FDMTranslator#endTranslation}
 *
 * Calling {@link FDMTranslator#translate} will perform the translation and
 * automatically call these three methods.
 *
 * @param {Object} printerType - an Object representing the printer type
 * @param {Object} printerProfile - an Object representing the printer profile
 * @param {Object} material - an Object representing the material
 * @constructor
 */
function FDMTranslator(printerType, printerProfile, material, config) {
    Translator.call(this, printerType, printerProfile, material);

    this.COMMAND_TYPE = {
        END_OF_COMMANDS : 0,
        MOVE : 1,
        EXTRUDE_MOVE : 2,
        EXTRUDE : 3,
        SET_FEED_RATE : 4,
        SET_TEMP_BED : 5,
        SET_TEMP_NOZZLE : 6,
        SET_FAN_SPEED : 7,
        SET_UNITS : 8,
        DISABLE_MOTORS : 9,
        SET_MODE_XYZ : 10,
        SET_MODE_E : 11,
        RESET_EXTRUSION_DISTANCE : 12,
        PAUSE : 13,
        HOME_AXES : 14,
        COMMENT : 15,
        STARTPRINT : 16,
        ENDPRINT : 17,
        CUSTOM : 18,
        PROGRESS : 19,
        ESTIMATES : 20
    };

    this.UNITS = {
        MM : 0,
        INCH : 1
    };

    this.MODE_TYPE = {
        ABS : 0,
        REL : 1
    };

    this.AXES = [
        {"x" : "X"},
        {"y" : "Y"},
        {"z" : "Z"},
        {"e" : "E"},
        {"f" : "F"}
    ];

    this.setConfig(config);
}
util.inherits(FDMTranslator, Translator);

/**
 * Starts the translation of the given FDM input file.
 *
 * @param {String} inputPath
 * @returns {Promise} - this is fulfilled if the translation succeeds,
 *                      and rejected if the translation fails.
 */
FDMTranslator.prototype.startTranslation = function (inputPath, outputPath) {
    var self = this;
    var reader = new FDMReader();
    reader.on('header', function (header) {
        self.onHeader(header);
    });
    reader.on('command', function (command) {
        self.onCommand(command);
    });
    return reader.read(inputPath);
};

/**
 * Called when the header is read from the incoming FDM file.
 *
 * @param {ProtoBuf.Message} header - a Header message as specified in FDMPrintable.proto.
 * @interface
 */
FDMTranslator.prototype.onHeader = function (header) {
    throw new Error('onHeader() method is unimplemented.');
};

/**
 * Called when a command is read from the incoming FDM file.
 *
 * @param {ProtoBuf.Command} - a Command message as specified in FDMPrintable.proto.
 * @interface
 */
FDMTranslator.prototype.onCommand = function (index, command) {
    throw new Error('onCommand() method is unimplemented.');
};

FDMTranslator.prototype.setConfig = function(config) {
};

/**
 * Convert Command
 * Check which type of command, and parse accordingly
 *
 * @param {Object} command
 * @returns {Object} processed command
 */
FDMTranslator.prototype.convertCommand = function(inCommand) {
    var outCommand;
    switch(inCommand.type) {
        case this.COMMAND_TYPE.END_OF_COMMANDS:
            outCommand = this.convertEndOfCommands(inCommand);
            break;
        case this.COMMAND_TYPE.MOVE:
            outCommand = this.convertMove(inCommand);
            break;
        case this.COMMAND_TYPE.EXTRUDE_MOVE:
            outCommand = this.convertExtrudeMove(inCommand);
            break;
        case this.COMMAND_TYPE.EXTRUDE:
            outCommand = this.convertExtrude(inCommand);
            break;
        case this.COMMAND_TYPE.SET_FEED_RATE:
            outCommand = this.convertSetFeedRate(inCommand);
            break;
        case this.COMMAND_TYPE.SET_TEMP_BED:
            outCommand = this.convertSetTempBed(inCommand);
            break;
        case this.COMMAND_TYPE.SET_TEMP_NOZZLE:
            outCommand = this.convertSetTempNozzle(inCommand);
            break;
        case this.COMMAND_TYPE.SET_FAN_SPEED:
            outCommand = this.convertSetFanSpeed(inCommand);
            break;
        case this.COMMAND_TYPE.SET_UNITS:
            outCommand = this.convertSetUnits(inCommand);
            break;
        case this.COMMAND_TYPE.DISABLE_MOTORS:
            outCommand = this.convertDisableMotors(inCommand);
            break;
        case this.COMMAND_TYPE.SET_MODE_XYZ:
            outCommand = this.convertSetModeXYZ(inCommand);
            break;
        case this.COMMAND_TYPE.SET_MODE_E:
            outCommand = this.convertSetModeE(inCommand);
            break;
        case this.COMMAND_TYPE.RESET_EXTRUSION_DISTANCE:
            outCommand = this.convertResetExtrusionDistance(inCommand);
            break;
        case this.COMMAND_TYPE.PAUSE:
            outCommand = this.convertPause(inCommand);
            break;
        case this.COMMAND_TYPE.HOME_AXES:
            outCommand = this.convertHomeAxes(inCommand);
            break;
        case this.COMMAND_TYPE.COMMENT:
            outCommand = this.convertComment(inCommand);
            break;
        case this.COMMAND_TYPE.STARTPRINT:
            outCommand = this.convertStartPrint(inCommand);
            break;
        case this.COMMAND_TYPE.ENDPRINT:
            outCommand = this.convertEndPrint(inCommand);
            break;
        case this.COMMAND_TYPE.CUSTOM:
            outCommand = this.convertCustomCommand(inCommand);
            break;
        case this.COMMAND_TYPE.PROGRESS:
            outCommand = this.convertProgress(inCommand);
            break;
        case this.COMMAND_TYPE.ESTIMATES:
            outCommand = this.convertEstimates(inCommand);
            break;
        default:
    }
    return this.postProcessCommand(inCommand, outCommand);
};

FDMTranslator.prototype.convertEndOfCommands = function(command) {
    throw new Error('convertEndOfCommands() method is unimplemented.');
};

FDMTranslator.prototype.convertMove = function(command) {
    throw new Error('convertMove() method is unimplemented.');
};

FDMTranslator.prototype.convertExtrudeMove = function(command) {
    throw new Error('convertExtrudeMove() method is unimplemented.');
};

FDMTranslator.prototype.convertExtrude = function(command) {
    throw new Error('convertExtrude() method is unimplemented.');
};

FDMTranslator.prototype.convertSetFeedRate = function(command) {
    throw new Error('convertSetFeedRate() method is unimplemented.');
};

FDMTranslator.prototype.convertTempBed = function(command) {
    throw new Error('convertTempBed() method is unimplemented.');
};

FDMTranslator.prototype.convertSetTempNozzle = function(command) {
    throw new Error('convertSetTempNozzle() method is unimplemented.');
};

FDMTranslator.prototype.convertSetFanSpeedCommand = function(command) {
    throw new Error('convertSetFanSpeed() method is unimplemented.');
};

FDMTranslator.prototype.convertSetUnitsCommand = function(command) {
    throw new Error('convertSetUnits() method is unimplemented.');
};

FDMTranslator.prototype.convertDisableMotors = function(command) {
    throw new Error('convertDisableMotors() method is unimplemented.');
};

FDMTranslator.prototype.convertSetModeXYZ = function(command) {
    throw new Error('convertSetModeXYZ() method is unimplemented.');
};

FDMTranslator.prototype.convertSetModeE = function(command) {
    throw new Error('convertSetModeE() method is unimplemented.');
};

FDMTranslator.prototype.convertResetExtrusionDistance = function(command) {
    throw new Error('convertResetExtrusionDistance() method is unimplemented.');
};

FDMTranslator.prototype.convertPause = function(command) {
    throw new Error('convertPause() method is unimplemented.');
};

FDMTranslator.prototype.convertHomeAxes = function(command) {
    throw new Error('convertHomeAxes() method is unimplemented.');
};

FDMTranslator.prototype.convertComment = function(command) {
    throw new Error('convertComment() method is unimplemented.');
};

FDMTranslator.prototype.convertStartPrint = function(command) {
    throw new Error('convertStartPrint() method is unimplemented.');
};

FDMTranslator.prototype.convertEndPrint = function(command) {
    throw new Error('convertEndPrint() method is unimplemented.');
};

FDMTranslator.prototype.convertCustomCommand = function(command) {
    throw new Error('convertCustomCommand() method is unimplemented.');
};

FDMTranslator.prototype.convertProgress = function(command) {
    throw new Error('convertProgress() method is unimplemented.');
};

FDMTranslator.prototype.convertEstimates = function(command) {
    throw new Error('convertEstimates() method is unimplemented.');
};

//This function does nothing. It should be overwritten per printer as necessary
FDMTranslator.prototype.postProcessCommand = function(inCommand, outCommand) {
    throw new Error('postProcessCommand() method is unimplemented.');
};

module.exports = FDMTranslator;