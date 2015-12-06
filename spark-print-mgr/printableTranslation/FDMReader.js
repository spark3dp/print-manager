var path = require('path'),
    PrintableReader = require('./PrintableReader'),
    ProtoBuf = require('protobufjs'),
    util = require('util');

var builder = ProtoBuf.loadProtoFile(path.join(__dirname, 'FDMPrintable.proto')),
    Header = builder.build('Spark.FDMPrintable.Header'),
    Command = builder.build('Spark.FDMPrintable.Command');

/**
 * FDMReader is a stream reader for machine independent FDM printable files.  This is a file
 * containing protobuf messages - one header message, and zero or more command messages.
 * For more on the file format, see FDMPrintable.proto.
 *
 * To use:
 *
 * // Setup the event listeners.  You will get one 'header' and zero or more 'command'
 * // events as they are read.
 * //
 * var reader = new FDMReader();
 * reader.on('header', function(header) {
 *	  // do something with header
 * });
 *
 * reader.on('command', function(command) {
 *	  // do something with command
 * });
 *
 * // Read the file.  This returns a promise that's fulfilled (with the command count) if all the commands
 * // were read correctly, and rejected with an error if there were problems during the read.
 * //
 * reader.read(filePath);
 *   .then(function(commandCount) {
 * 		// do something when the reading is done
 *	 })
 *   .catch(function(err)) {
 *		// do something if there was an error during the read
 *	});
 *
 * @constructor
 */
function FDMReader() {
    PrintableReader.call(this, 0x14C64CAB);
    this.printerTypeId = null;
    this.profileId = null;
}
util.inherits(FDMReader, PrintableReader);

/**
 * Reads the given FDM file.
 *
 * @param {string} filePath - the file path to read from.
 * @param {Object} [options] - an optional dictionary of options
 * @param {number} [options.bufferSize] - the buffer size to use during file read
 * @returns {Promise} - this is fulfilled if the read completes successfully,
 *                      and rejected if the read fails.
 */
FDMReader.prototype.read = function (filePath, options) {
    var self = this;
    var stream = null;

    return PrintableReader.prototype.read.apply(this, [filePath, options])
        .then(function (readStream) {
            // Now read the header message.
            //
            stream = readStream;
            return self.readMessage(stream, Header);
        })
        .then(function (header) {
            self.printerTypeId = header.printer_type_id;
            self.profileId = header.profile_id;
            self.emit('header', header);
            return self.onHeader(header);
        })
        .then(function() {
            var commandCount = 0;

            function readNextCommand(stream) {
                var currentCommand = null;
                return self.readMessage(stream, Command)
                    .then(function (command) {
                        currentCommand = command;
                        self.emit('command', command);
                        return self.onCommand(command);
                    })
                    .then(function() {
                        commandCount++;
                        if (currentCommand.type !== Command.CommandType.END_OF_COMMANDS) {
                            return readNextCommand(stream);
                        } else {
                            return commandCount;
                        }
                    });
            }

            // Now read all of the commands one by one.
            //
            return readNextCommand(stream);
        });
};

FDMReader.prototype.onHeader = function (header) {
};

FDMReader.prototype.onCommand = function (command) {
};

FDMReader.prototype.getPrinterTypeId = function () {
    return this.printerTypeId;
};

FDMReader.prototype.getProfileId = function () {
    return this.profileId;
};

module.exports = FDMReader;
module.exports.Header = Header;
module.exports.Command = Command;
