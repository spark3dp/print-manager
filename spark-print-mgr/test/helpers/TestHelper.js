var fs = require('fs');

// Disable the logging in PrintManager.
//
var pmLogger = require('../../logging/PrintManagerLogger');
pmLogger.setEnabled(false);

/**
 * Returns true if the file at the given path exists.
 *
 * @param {string} filePath
 * @returns {boolean}
 */
function fileExists(filePath) {
    return fs.existsSync(filePath);
}

/**
 * Returns true if the two files exist and have the same size.
 *
 * @param {string} aPath - path to a file
 * @param {string} bPath - path to another file
 * @returns {boolean}
 */
function filesSameSize(aPath, bPath) {
    if (fileExists(aPath) && fileExists(bPath)) {
        var aStat = fs.statSync(aPath),
            bStat = fs.statSync(bPath);
        return (aStat.size === bStat.size);
    }
    return false;
}

module.exports = {
    fileExists:  fileExists,
    filesSameSize: filesSameSize
};
