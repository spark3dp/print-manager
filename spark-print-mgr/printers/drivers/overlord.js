/*******************************************************************************
 * overlord.js
 *
 * Configure a specific version of the serial printer.
 *
 ******************************************************************************/
var _ = require('underscore'),

    GcodeClient = require('./drivers/gcodeClient'),
    SerialCommandExecutor = require('./drivers/serialCommandExecutor'),
    Status = require('./status'),
    logger = require('../logging/PrintManagerLogger');

/// START GCodeClient API FUNCTIONS ///

var stopCommands = function (that) {
    return [
        { close : true },
        // Windows seems to need a bit of a pause before the re-open
        { delay : 100 },
        { open : true },
        'G28',
        'M104 S0',
        'M140 S0',
        'M106 S0'
    ];
};

var pauseCommands = function (that) {
    return [
        {
            code : 'M114',
            processData : function (inCommand, inData) {
                // todo pull out function
                if (that.validateReply(inCommand, inData)) {
                    return true;
                } else {
                    var extrudeLength = that.parseExtrudeLength(inData);

                    // Generate commands to return us to our position and extrusion
                    // length
                    //TODO capture the most recent speed command
                    //Make sure to reset the speed to what it was prior to pausing rather than hardcode
                    var returnCommand = 'G1 ' + that.parseCurrentPosition(inData) + ' F4000';
                    var reExtrudeCommand = 'G1 E' + extrudeLength + ' F4000';
                    that.mResumeCommands = [ returnCommand, reExtrudeCommand ];

                    // retract, then move to park position, then pause our queue
                    //todo pull out extrude length as a variable
                    var retractLength = (extrudeLength - 5);
    //                var retractLength = (extrudeLength - that.mPauseRetraction());
                    var retractCommand = 'G1 E' + retractLength + ' F4000';
                    that.mQueue.prependCommands(
                        retractCommand,
                        {
                            code : that.getParkCommand(inData),
                            postCallback : function (inCommand) {
                                that.mQueue.pause();
                            }
                        }
                    );
                }
            }
        }
    ];
};

var getStatusCommands = function (that) {
    var extruderTemp, basePlateTemp;
    var status = new Status(that.getState());
    return [{
        code: 'M105',
        processData : function (inCommand, inData) {
            inData.replace(/(.):(\d+.\d+)/g, function (inMatch, inLetter, inNumber) {
                switch (inLetter) {
                    case 'T': extruderTemp  = inNumber; break;
                    case 'B': basePlateTemp = inNumber; break;
                    default: break;
                }
            });

            if (extruderTemp || basePlateTemp) {
                status.sensors = {};
            }
            if (extruderTemp !== undefined) {
                status.sensors.extruder1 = { 'temperature' : extruderTemp };
            }
            if (basePlateTemp !== undefined) {
                status.sensors.basePlate = { 'temperature' : basePlateTemp };
            }
            that.mStatusInProgress = status;

            return true;
        }
    }];
};

/**
 * validateReply()
 *
 * Confirms if a reply contains 'ok' as its last line.  Parses out DOS newlines.
 *
 * Args:   inReply - USB reply data
 * Return: true if the last line was 'ok'
 */
var validateReply = function(inCommand, inReply) {
    var lines = inReply.toString().split('\n');
    return (_.last(lines) === 'ok');
};

/**
 * expandCode()
 *
 * Expand simple commands to gcode we can send to the printer
 *
 * Args:   inCode - a simple string gcode command
 * Return: a gcode string suitable for the hardware
 */
var expandCode = function (inCode) {
    // Later add checksumming
    return inCode + '\n';
};

var setupExecutor = function(inDeviceData) {
    var openPrime = '';
    return new SerialCommandExecutor(
        inDeviceData.comName,
        inDeviceData.baudrate,
        openPrime
    );
};

/****** END SERIAL API FUNCTIONS ******/

var overlordConfig = {
    stopCommands : stopCommands,
    pauseCommands : pauseCommands,
    getStatusCommands : getStatusCommands,
    validateReply : validateReply,
    expandCode : expandCode,
    setupExecutor : setupExecutor,
    updateInterval : 1000
};

/**
 * Our module export is a creation function that returns an Ultimaker configured SerialPrinter
 */
var createUltimaker = function (data) {
    return new GcodeClient(data, overlordConfig);
};

module.exports = createUltimaker;
