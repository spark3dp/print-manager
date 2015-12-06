var path = require('path'),
    PrintableReader = require('./PrintableReader'),
    ProtoBuf = require('protobufjs'),
    util = require('util');

var builder = ProtoBuf.loadProtoFile(path.join(__dirname, 'DLPPrintable.proto')),
    Header = builder.build('Spark.DLPPrintable.Header'),
    Slice = builder.build('Spark.DLPPrintable.Slice');

/**
 * DLPReader is a stream reader for machine independent DLP printable files.  This is a file
 * containing protobuf messages - one header message, and zero or more slice messages.
 * For more on the file format, see DLPPrintable.proto.
 *
 * To use:
 *
 * // Setup the event listeners.  You will get one 'header' and zero or more 'slice'
 * // events as they are read.
 * //
 * var reader = new DLPReader();
 * reader.on('header', function(header) {
 *	  // do something with header
 * });
 *
 * reader.on('slice', function(slice) {
 *	  // do something with slice
 * });
 *
 * // Read the file.  This returns a promise that's fulfilled (with the slice count) if all the slices
 * // were read correctly, and rejected with an error if there were problems during the read.
 * //
 * reader.read(filePath);
 *   .then(function(sliceCount) {
 * 		// do something when the reading is done
 *	 })
 *   .catch(function(err)) {
 *		// do something if there was an error during the read
 *	});
 *
 * @constructor
 */
function DLPReader() {
    PrintableReader.call(this, 0x5F52BD92);
    this.printerTypeId = null;
    this.sliceCount = 0;
    this.imageWidth = 0;
    this.imageHeight = 0;
}
util.inherits(DLPReader, PrintableReader);

/**
 * Reads the given DLP file.
 *
 * @param {string} filePath - the file path to read from.
 * @param {Object} [options] - an optional dictionary of options
 * @param {number} [options.bufferSize] - the buffer size to use during file read
 * @returns {Promise} - this is fulfilled if the read completes successfully,
 *                      and rejected if the read fails.
 */
DLPReader.prototype.read = function (filePath, options) {
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
            self.sliceCount = header.num_slices;
            self.imageWidth = header.image_width;
            self.imageHeight = header.image_height;
            self.emit('header', header);
            return self.onHeader(header);
        })
        .then(function () {
            var currentSlice = 0;

            function readNextSlice(stream) {
                return self.readMessage(stream, Slice)
                    .then(function (slice) {
                        self.emit('slice', {index: currentSlice, slice: slice});
                        return self.onSlice({index: currentSlice, slice: slice});
                    })
                    .then(function () {
                        currentSlice++;
                        if (currentSlice < self.sliceCount) {
                            return readNextSlice(stream);
                        } else {
                            return currentSlice;
                        }
                    });
            }

            return readNextSlice(stream);
        });
};

DLPReader.prototype.onHeader = function (header) {
};

DLPReader.prototype.onSlice = function (sliceData) {
};

DLPReader.prototype.getSliceCount = function () {
    return this.sliceCount;
};

DLPReader.prototype.getImageHeight = function () {
    return this.imageHeight;
};

DLPReader.prototype.getImageWidth = function () {
    return this.imageWidth;
};

DLPReader.prototype.getPrinterTypeId = function () {
    return this.printerTypeId;
};

module.exports = DLPReader;
module.exports.Header = Header;
module.exports.Slice = Slice;