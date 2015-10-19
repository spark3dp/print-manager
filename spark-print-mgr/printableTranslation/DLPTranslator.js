var DLPReader = require('./DLPReader'),
    Translator = require('./Translator'),
    util = require('util');

/**
 * The DLPTranslator is the base class for DLP translators.  Three methods
 * must be implemented:
 * - {@link DLPTranslator#onHeader}
 * - {@link DLPTranslator#onSlice}
 * - {@link DLPTranslator#endTranslation}
 *
 * Calling {@link DLPTranslator#translate} will perform the translation and
 * automatically call these three methods.
 *
 * @param {Object} printerType - an Object representing the printer type
 * @param {Object} printerProfile - an Object representing the printer profile
 * @param {Object} material - an Object representing the material
 * @param {String} jobName - name of the job
 * @constructor
 */
function DLPTranslator(printerType, printerProfile, material, jobName) {
    Translator.call(this, printerType, printerProfile, material, jobName);
}
util.inherits(DLPTranslator, Translator);

/**
 * Starts the translation of the given DLP input file.  The output path is also
 * provided.
 *
 * @param {String} inputPath
 * @returns {Promise} - this is fulfilled if the translation succeeds,
 *                      and rejected if the translation fails.
 */
DLPTranslator.prototype.startTranslation = function (inputPath, outputPath) {
    var reader = new DLPReader();
    var self = this;
    reader.onHeader = function (header) {
        return self.onHeader(header);
    };
    reader.onSlice = function (sliceData) {
        return self.onSlice(sliceData.index, sliceData.slice);
    };
    return reader.read(inputPath);
};

/**
 * Called when the header is read from the incoming DLP file.  If this method is performing
 * an asynchronous operation, return a promise and resolve it when the operation is complete.
 * The first command will not be read until the promise is resolved.  Otherwise, return nothing.
 *
 * @param {ProtoBuf.Message} header - a Header message as specified in DLPPrintable.proto.
 * @interface
 */
DLPTranslator.prototype.onHeader = function (header) {
    throw new Error('onHeader() method is unimplemented.');
};

/**
 * Called when a slice is read from the incoming DLP file.  If this method is performing
 * an asynchronous operation, return a promise and resolve it when the operation is complete.
 * The next slice will not be read until the promise is resolved.  Otherwise, return nothing.
 *
 * @param {ProtoBuf.Slice} - a Slice message as specified in DLPPrintable.proto.
 * @interface
 */
DLPTranslator.prototype.onSlice = function (index, slice) {
    throw new Error('onSlice() method is unimplemented.');
};

module.exports = DLPTranslator;