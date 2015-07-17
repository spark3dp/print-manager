var fs = require('fs'),
    path = require('path'),
    files = require( './files'),
    logger = require('./logging/PrintManagerLogger');


var fileIds = {}; // filename -> id


/**
 * Returns the value of a property of the root object.
 *
 * @param {Object} root
 * @param {string[]} propNames - Array of property names
 * @returns {*}
 */
function getProperty(root, propNames) {
    var prop = root;
    propNames.forEach(function (propName) {
        prop = prop[propName];
    });
    return prop;
}

/**
 * Uploads one local file referenced in the json.
 * See uploadFiles().
 *
 * @param {string} dir - Directory containing the files
 * @param {Object} json
 * @param {string} concatPropName - dot-concatenated property name (e.g., "foo.bar.baz")
 */
function uploadFile(dir, json, concatPropName) {
    var propNames = concatPropName.split('.'),
        value = getProperty(json, propNames),
        id = fileIds[value];

    if (id === undefined) {

        var src = path.join(__dirname, dir, value);
        if (fs.existsSync(src)) {

            // Haven't seen this file before. Symlink and remember it.
            //
            var f = new files.File(null, value);
            fs.symlinkSync(src, f.path);

            id = f.id;
            fileIds[value] = id;

        } else {
            logger.error('Upload file ' + concatPropName + '="' + src + '" not found');
        }
    }

    // Replace filename with file id.
    //
    if (id !== undefined) {
        var lastPropName = propNames.pop();
        value = getProperty(json, propNames);
        value[lastPropName] = id;
    }
}

/**
 * Uploads local files referenced in the json.
 *
 * If the json contains a "_files" property, then that property is an array of strings
 * each of which is a dot-concatenated property name (e.g., "foo.bar.baz") which points
 * to a property in the json that contains a filename.
 *
 * This function "uploads" (actually symlinks) the files into an internal files directory
 * where actually-uploaded files are also saved and replaces the filename in the json
 * with the file id.
 *
 * @param {string} dir - Directory containing the files
 * @param {Object} json
 */
function uploadFiles(dir, json) {
    var concatPropNames = json._files;
    if (concatPropNames && 0 < concatPropNames.length) {
        concatPropNames.forEach(function (concatPropName) {
            uploadFile(dir, json, concatPropName);
        });
    }
}

function reset() {
    fileIds = {};
}

module.exports = {
    uploadFiles: uploadFiles,
    reset: reset
};
