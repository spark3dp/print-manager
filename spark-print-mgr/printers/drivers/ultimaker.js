/*******************************************************************************
 * ultimaker.js
 *
 * Configure a specific version of the serial printer.
 * Ultimaker, when turned on, sends a bunch of info that has to be consumed
 * before we can settle into a reliable communication.
 ******************************************************************************/
var SerialPrinter = require('./drivers/serial');

var ultimakerConfig = {
    // default pauseRetraction

    // Ultimaker spits data on initial connection, no openPrime needed
    openPrime    : function () { return ''; },
    // default pauseCommands
    // default resumeCommands
    // default stopCommands

    // default startCommandsFunc
    // default expandCodeFunc()
    // default validateReplyOKFunc()
};

/**
 * Our module export is a creation function that returns a Ultimaker configured
 * SerialPrinter
 */
var createUltimaker = function (data) {
    return new SerialPrinter(data, ultimakerConfig);
};

module.exports = createUltimaker;
