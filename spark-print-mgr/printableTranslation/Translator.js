var events = require('events'),
    Promise = require('promise'),
    util = require('util');

/**
 * Translator is the base class for translators.
 *
 * @param {Object} printerType - an Object representing the printer type
 * @param {Object} printerProfile - an Object representing the printer profile
 * @param {Object} material - an Object representing the material
 * @param {String} jobName - name of the job
 * @constructor
 */
function Translator(printerType, printerProfile, material, jobName) {
    events.EventEmitter.call(this);
    this.printerType = printerType;
    this.printerProfile = printerProfile;
    this.material = material;
    this.jobName = jobName;
    this.progress = 0;
}
util.inherits(Translator, events.EventEmitter);

Translator.prototype.getPrinterType = function() {
    return this.printerType;
};

Translator.prototype.getPrinterProfile = function() {
    return this.printerProfile;
};

Translator.prototype.getMaterial = function() {
    return this.material;
};

Translator.prototype.getJobName = function() {
    return this.jobName;
};

/**
 * Override this to return true if this class handles the translation for the given
 * combination of printer type, printer profile, and material.
 *
 * @param {Object} printerType
 * @param {Object} printerMaterial
 * @param {Object} material
 * @returns {boolean}
 */
Translator.canTranslate = function (printerType, printerProfile, material) {
    return false;
};

/**
 * Override this to start the translation of the given input file.  It should return
 * a promise that is fulfilled when the translation is done, and rejected when there
 * is an error.
 *
 * @param {String} inputPath
 * @returns {Promise}
 */
Translator.prototype.startTranslation = function (inputPath, outputPath) {
    return null;
};

/**
 * Translates the given  file represented by inputPath, and output the translation
 * to outputPath.
 *
 * @param {string} inputPath - the path to the  input file.
 * @param {string} outputPath - the path to which the translated file will be written.
 * @param {Object} [options] - an optional dictionary of options used by your translator.
 *                             This can include translation options, temporary directories,
 *                             output formats, etc.
 * @returns {Promise} - this is fulfilled if the translation completes successfully,
 *                      and rejected if the read fails.
 */
Translator.prototype.translate = function (inputPath, outputPath, options) {
    var self = this;
    return new Promise(function (resolve, reject) {
        try {
            return self.startTranslation(inputPath, outputPath)
                .then(function () {
                    return self.endTranslation(outputPath);
                }).then(function (data) {
                    resolve(data);
                }).catch(function (err) {
                    reject(err);
                });
        }
        catch (e) {
            reject(e);
        }
    });
};

/**
 * Override this to end the translation.  Typically this is outputting the file to the given
 * output path.  If this method is performing an asynchronous operation, return a promise and
 * resolve it when the operation is complete.
 *
 * @param {String} outputPath
 */
Translator.prototype.endTranslation = function (outputPath) {
};

/**
 * Sets the progress for the translation.
 *
 * @param {number} progress - a number between 0 and 1, inclusive.
 */
Translator.prototype.setProgress = function (progress) {
    this.progress = progress;
    this.emit('progress', progress);
};

/**
 * Returns the current progress of the translation.
 *
 * @returns {number}
 */
Translator.prototype.getProgress = function () {
    return this.progress;
};

module.exports = Translator;