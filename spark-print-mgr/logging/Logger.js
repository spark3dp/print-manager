var winston = require('winston'),
    fs = require('fs'),
    path = require('path');

/**
 * A class for a logger that wraps a winston instance.
 *
 * The file transport (if it exists) is written at the info level. If the file transport should be added but fails,
 * a warning message will be written to the remaining transports.
 *
 * The console transport (if being written to) is written at the debug level.
 *
 * @param {Object} [options] - The configuration object.
 * @param {String} [options.log_file] - The path to the log file. The directory structure must exist.
 *                                      If no path is specified, the logger will not write to a file.
 * @param {Boolean} [options.write_to_console=true] - If true, write log to the console.
 * @class
 */
var Logger = function(options) {
    this.enabled = true;

    if (options === undefined) {
        options = {};
    }

    var warning;
    var transports = [];
    var logFileLocation = options.log_file_location || ".";
    var logFileName     = options.log_file_name || "print_manager.log";
    var logFile = path.join( logFileLocation, logFileName );
    if (logFile) {
        var directory = path.dirname(logFile);
        var directoryExists = fs.existsSync(directory);

        // Only add the file transport if the directory structure exists. Otherwise we get an ENOENT on log write
        // and the server crashes
        if (directoryExists) {
            transports.push(new winston.transports.File({
                level: 'info',
                filename: logFile,
                handleExceptions: true,
                json: false,
                maxsize: 5242880, //5MB
                maxFiles: 10,
                colorize: false
            }));
        } else {
            warning = "Failed to add file transport to the logger. Directory '" +
                directory + "' doesn't exist.";
        }
    }

    if (options.write_to_console === undefined || options.write_to_console === true) {
        transports.push(new winston.transports.Console({
            level: 'info',
            handleExceptions: true,
            json: false,
            colorize: true
        }));
    }

    this.logger = new winston.Logger({
        transports: transports,
        exitOnError: false
    });

    if (warning) {
        this.logger.warn(warning);
    }
};

Logger.prototype.constructor = Logger;

Logger.prototype.debug = function() { // A wrapper for the winston debug method. Ensures logger is enabled.
    if (this.enabled) {
        this.logger.debug.apply(this.logger, arguments);
    }
};

Logger.prototype.info = function() { // A wrapper for the winston info method. Ensures logger is enabled.
    if (this.enabled) {
        this.logger.info.apply(this.logger, arguments);
    }
};

Logger.prototype.warn = function() { // A wrapper for the winston warn method. Ensures logger is enabled.
    if (this.enabled) {
        this.logger.warn.apply(this.logger, arguments);
    }
};

Logger.prototype.error = function() { // A wrapper for the winston error method. Ensures logger is enabled.
    if (this.enabled) {
        this.logger.error.apply(this.logger, arguments);
    }
};

Logger.prototype.setEnabled = function(enabled) {
    this.enabled = enabled;
};

module.exports = Logger;