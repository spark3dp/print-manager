var FORMATS = require('./formats');

/**
 * Returns true iff value is a Number.
 * @param value - The value to test.
 * @returns {Boolean} - True if value is an number.
 * @private
 */
function isNumber(value) {
    return value instanceof Number || typeof(value) === 'number';
}

/**
 * Returns true iff value is an Integer.
 * @param value - The value to test.
 * @returns {Boolean} - True if value is an integer.
 * @private
 */
function isInteger(value) {
    return isNumber(value) && (value - Math.floor(value) === 0);
}

/**
 * Returns true iff the provided value is a coordinate. I.e. Is an array of 3 numbers.
 *
 * @param value - The value to check.
 * @returns {Boolean} - True if value is a coordinate.
 * @private
 */
function isCoordinate(value) {
    return (value instanceof Array) && value.length === 3 &&
        isNumber(value[0]) && isNumber(value[1]) && isNumber(value[2]);
}

/**
 * Returns true iff the provided value is a transform. I.e. Is an array of 3 arrays each containing 4 numbers.
 *
 * @param value - The value to check.
 * @returns {Boolean} - True if value is a transform.
 * @private
 */
function isTransform(value) {
    if (!(value instanceof Array) || value.length !== 3) {
        return false;
    }

    for (var i = 0; i < 3; i++) {
        var column = value[i];
        if (!(column instanceof Array) || column.length !== 4) {
            return false;
        }

        for (var j = 0; j < 4; j++) {
            if (!isNumber(column[j])) {
                return false;
            }
        }
    }

    return true;
}

/**
 * Returns true iff the provided value is a UUID in the 8-4-4-4-12 format.
 *
 * @param value - The value to check.
 * @returns {Boolean} - True if the value is a UUID.
 */
function isUUID(value) {
    return !!((value instanceof String || typeof(value) === 'string') &&
           value.toLowerCase().match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/g));
}

/**
 * Returns true if the object has the specified fields and types or a string stating the reason for failure.
 *
 * @param {Object} obj - The object.
 * @param {Object} format - The format specification.
 * @returns {Boolean|String} - True if the object has the specified properties and types. A string describing the
 *                             failure otherwise.
 */
function objectHasFormat(obj, format) {
    var keys = Object.keys(format);

    var message = undefined;

    keys.every(function(key) {
        if (!obj.hasOwnProperty(key)) {
            message = 'missing property ' + key;
            return false;
        }

        if (format[key] instanceof Function) {
            var type = typeof(obj[key]); // To handle literals
            var formatTypeAsString = format[key].toString();
            var formatType = formatTypeAsString.substring(9, formatTypeAsString.indexOf('(')).toLowerCase();
            switch (type) {
                case "boolean" :
                case "number" :
                case "string" :
                    if (type !== formatType) {
                        message = (key + ' is not of type ' + formatType);
                    }
                    break;

                case "object" :
                    if (!(obj[key] instanceof format[key])) {
                        message = (key + ' is not of type ' + formatType);
                    }
                    break;

                default :
                    message = 'unknown type ' + type;
                    break;
            }
        } else {
            // Nesting
            var returnValue = objectHasFormat(obj[key], format[key]);
            if (typeof(returnValue) === 'string') {
                message = returnValue;
            }
        }

        return !message;
    });

    return message || true;
}

/**
 * Returns true if the object is a valid printer type.
 *
 * If profilesById is set, the printer type is checked to ensure its default_profile_id exists in the mapping and that
 * it's valid for this printer type.
 *
 * If materialsById is set, the printer type is checked to ensure its default_material_id exists in the mapping and that
 * it's valid for this printer type.
 *
 * @param {Object} value - The object to test.
 * @param {Object} [profilesById] - A map of profile IDs to the corresponding profiles.
 * @param {Object} [materialsById] - A map of material IDs to the corresponding materials.
 * @returns {Boolean|String} - True if the object is a valid printer type. A string describing the
 *                             failure otherwise.
 */
function isPrinterType(value, profilesById, materialsById) {
    var formatResult = objectHasFormat(value, FORMATS.printerTypeCommon);

    if (formatResult !== true) {
        return formatResult;
    }

    if (profilesById) {
        var profile = profilesById[value.default_profile_id];
        if (!profile) {
            return 'default_profile_id does not correspond to a known profile';
        }

        if (profile.printer_types.indexOf(value.id) === -1) {
            return 'the default profile is not valid for this printer type';
        }
    }

    if (materialsById) {
        var material = materialsById[value.default_material_id];
        if (!material) {
            return 'default_material_id does not correspond to a known material';
        }

        if (material.printer_types.indexOf(value.id) === -1) {
            return 'the default material is not valid for this printer type';
        }
    }

    if (value.technology === 'FDM') {
        formatResult = objectHasFormat(value, FORMATS.printerTypeFDM);
        if (formatResult !== true) {
            return formatResult;
        }
    } else if (value.technology !== 'DLP') {
        return '"technology" must be either "FDM" or "DLP"';
    }

    if (!isUUID(value.id)) {
        return 'printer types must have a UUID as their ID';
    }

    if (!isUUID(value.default_material_id)) {
        return 'default_material_id must be a UUID';
    }

    if (!isUUID(value.default_profile_id)) {
        return 'default_profile_id must be a UUID';
    }

    var allSupportedConnectionsValid = value.supported_connections.every(function(connection) {
        return objectHasFormat(connection, FORMATS.supportedConnection) === true;
    });
    if (!allSupportedConnectionsValid) {
        return 'a supported_connection is missing some fields';
    }

    if (value.build_volume.type !== 'Cartesian' && value.build_volume.type !== 'Cylindrical') {
        return 'build_volume.type must be one of "Cartesian" or "Cylindrical". Found "' + value.build_volume.type + '" instead.';
    }

    if (value.build_volume.bed_size.length !== 3) {
        return 'build_volume.bed_size should be an array of length 3';
    }

    if (value.build_volume.park_position.length !== 3) {
        return 'build_volume.park_position should be an array of length 3';
    }

    if (value.build_volume.home_position.length !== 3) {
        return 'build_volume.home_position should be an array of length 3';
    }

    return true;
}

/**
 * Returns true if the object is a valid printer.
 *
 * If printerTypesById is set, the printer is checked to ensure its type_id exists in the mapping and that its
 * defaults match the corresponding printer type.
 *
 * @param {Object} value - The object to test.
 * @param {Object} [printerTypesById] - A map of printer type IDs to the corresponding printer type.
 * @returns {Boolean|String} - True if the object is a valid printer. A string describing the
 *                             failure otherwise.
 */
function isPrinter(value, printerTypesById) {
    var formatResult = objectHasFormat(value, FORMATS.printer);

    if (formatResult !== true) {
        return formatResult;
    }

    if (!isUUID(value.type_id)) {
        return 'type_id must be a UUID';
    }

    if (printerTypesById) {
        var printerType = printerTypesById[value.type_id];
        if (!printerType) {
            return 'type_id does not correspond to a known printer type';
        }

        if (printerType.default_material_id !== value.default_material_id) {
            return "default_material_id must match the printer type's default";
        }

        if (printerType.default_profile_id !== value.default_profile_id) {
            return "default_profile_id must match the printer type's default";
        }
    }

    if (!isUUID(value.default_material_id)) {
        return 'default_material_id must be a UUID';
    }

    if (!isUUID(value.default_profile_id)) {
        return 'default_profile_id must be a UUID';
    }

    // Optional field
    if (value.hasOwnProperty('firmware')) {
        formatResult = objectHasFormat(value.firmware, FORMATS.firmware);

        if (formatResult !== true) {
            return 'firmware does not conform to the format: ' + formatResult;
        }
    }

    return true;
}

/**
 * Returns true if the object is a valid material.
 *
 * If printerTypesById is set, the printer_types are checked to ensure they exist in the mapping.
 *
 * @param {Object} value - The object to test.
 * @param {Object} [printerTypesById] - A map of printer type IDs to the corresponding printer type.
 * @returns {Boolean|String} - True if the object is a valid material. A string describing the
 *                             failure otherwise.
 */
function isMaterial(value, printerTypesById) {
    var formatResult = objectHasFormat(value, FORMATS.materialCommon);

    if (formatResult !== true) {
        return formatResult;
    }

    if (value.pct_shrink === undefined || (value.pct_shrink !== null && !isNumber(value.pct_shrink))) {
        return 'pct_shrink must be either null or a number but was "' + value.pct_shrink + '"';
    }

    if (!isUUID(value.id)) {
        return 'id must be a UUID';
    }

    if (value.technology === 'FDM') {
        formatResult = objectHasFormat(value, FORMATS.materialFDM);

        if (formatResult !== true) {
            return formatResult;
        }

        if (!(isInteger(value.extruder_fan_speed) && value.extruder_fan_speed >= 0 && value.extruder_fan_speed <= 255)) {
            return 'extruder_fan_speed is ' + value.extruder_fan_speed + ' but should be an integer in the range [0, 255]';
        }

    } else if (value.technology === 'DLP') {
        formatResult = objectHasFormat(value, FORMATS.materialDLP);

        if (formatResult !== true) {
            return formatResult;
        }
    } else {
        return 'technology must be either "FDM" or "DLP"';
    }

    if (printerTypesById) {
        for (var i = 0; i < value.printer_types.length; i++) {
            var printerType = printerTypesById[value.printer_types[i]];
            if (!printerType) {
                return 'printer type ID "' + value.printer_types[i] + '" does not correspond to a known printer type';
            }
        }
    }

    if (value.color.toLowerCase().match(/^[0-9a-f]{6}$/g) === null) {
        return 'color must be an HTML color code. E.g. 808080 but is "' + value.color + '"';
    }

    if (!(isInteger(value.opacity) && value.opacity >= 1 && value.opacity <= 3)) {
        return 'opacity is ' + value.opacity + ' but should be either 1, 2, or 3';
    }

    if (!(isInteger(value.rating) && value.rating >= 1 && value.rating <= 5)) {
        return 'rating is ' + value.rating + ' but should be an integer in the range [1, 5]';
    }

    return true;
}

/**
 * Returns true if the object is a valid profile.
 *
 * If printerTypesById is set, the printer_types are checked to ensure they exist in the mapping.
 *
 * @param {Object} value - The object to test.
 * @param {Object} [printerTypesById] - A map of printer type IDs to the corresponding printer type.
 * @returns {Boolean|String} - True if the object is a valid material. A string describing the
 *                             failure otherwise.
 */
function isProfile(value, printerTypesById) {
    var formatResult = objectHasFormat(value, FORMATS.profile);

    if (formatResult !== true) {
        return formatResult;
    }

    if (!isUUID(value.id)) {
        return 'id must be a UUID';
    }

    if (value.technology !== 'FDM' && value.technology !== 'DLP') {
        return 'technology must be either "FDM" or "DLP"';
    }

    if (printerTypesById) {
        for (var i = 0; i < value.printer_types.length; i++) {
            var printerType = printerTypesById[value.printer_types[i]];
            if (!printerType) {
                return 'printer type ID "' + value.printer_types[i] + '" does not correspond to a known printer type';
            }
        }
    }

    return true;
}

/**
 * Returns true if the object is a valid mesh.
 *
 * @param {Object} value - The object to test.
 * @returns {Boolean|String} - True if the object is a valid mesh. A string describing the
 *                             failure otherwise.
 */
function isMesh(value) {
    var formatResult = objectHasFormat(value, FORMATS.mesh);

    if (formatResult !== true) {
        return formatResult;
    }

    if (!isUUID(value.id)) {
        return 'id must be a UUID';
    }

    if (!isTransform(value.transform)) {
        return 'transform must be an Array of 3 Arrays each containing 4 Numbers';
    }

    if (value.hasOwnProperty('visual_file_id') && !(value.visual_file_id instanceof String || typeof(value.visual_file_id) === 'string')) {
        return 'visual_file_id, when included, must be a String.';
    }

    if (!isCoordinate(value.geom.bounding_box.min)) {
        return 'geom.bounding_box.min must be an Array of 3 Numbers';
    }

    if (!isCoordinate(value.geom.bounding_box.max)) {
        return 'geom.bounding_box.min must be an Array of 3 Numbers';
    }

    if (value.analyzed && value.problems) {
        if (!(value.problems instanceof Array)) {
            return 'problems, when included, must be an Array';
        }

        var validProblemTypes = ['degenerate_triangles', 'duplicate_triangles', 'nonmanifold_vertices', 'inconsistently_oriented_triangles', 'holes'];

        for (var i = 0; i < value.problems.length; i++) {
            var problem = value.problems[i];

            if (!problem.hasOwnProperty('type')) {
                return 'problem[' + i + '] must have property "type"';
            }

            if (validProblemTypes.indexOf(problem.type) === -1) {
                return 'problem[' + i + '] has an invalid problem type ' + problem.type;
            }

            if (problem.hasOwnProperty('triangles')) {
                if (!(problem.triangles instanceof Array)) {
                    return 'problem[' + i + '], triangles must be an Array when provided';
                }

                var hasValidTriangles = problem.triangles.every(function(triangle) {
                    return triangle.hasOwnProperty('v0') && triangle.hasOwnProperty('v1') && triangle.hasOwnProperty('v2') &&
                        isCoordinate(triangle.v0) === isCoordinate(triangle.v1) === isCoordinate(triangle.v2) === true;
                });

                if (!hasValidTriangles) {
                    return 'problem[' + i + '], triangles must be an Array of objects with properties "v0", "v1", "v2",' +
                        ' each of which is an array representing the vertex positions in object space';

                }
            }

            if (problem.hasOwnProperty('vertices')) {
                if (!(problem.vertices instanceof Array)) {
                    return 'problem[' + i + '], vertices must be an Array when provided';
                }

                if (!problem.vertices.every(function(vertex) {return isCoordinate(vertex) === true;})) {
                    return 'problem[' + i + '], vertices must be an Array of Arrays representing positions in object space';
                }
            }
        }
    }

    return true;
}

/**
 * Returns true if the object is a valid tray.
 *
 * @param {Object} value - The object to test.
 * @param {Object} [printerTypesById] - A map of printer type IDs to the corresponding printer type.
 * @param {Object} [profilesById] - A map of printer profile IDs to the corresponding printer profile.
 * @param {Object} [materialsById] - A map of material IDs to the corresponding material.
 * @returns {Boolean|String} - True if the object is a valid mesh. A string describing the
 *                             failure otherwise.
 */
function isTray(value, printerTypesById, profilesById, materialsById) {
    var formatResult = objectHasFormat(value, FORMATS.tray);

    if (formatResult !== true) {
        return formatResult;
    }

    if (!value.hasOwnProperty('mesh_attrs')) {
        return 'missing property mesh_attrs';
    }

    if (!isUUID(value.printer_type_id)) {
        return 'printer_type_id must be a UUID';
    }

    if (!isUUID(value.profile_id)) {
        return 'profile_id must be a UUID';
    }

    if (!isUUID(value.default_material_id)) {
        return 'default_material_id must be a UUID';
    }

    var attrFormat = {
        reposition: Boolean,
        reorient: Boolean,
        support: Boolean
    };

    for (var i = 0; i < value.meshes.length; i++) {
        var mesh = value.meshes[i];
        var isValidMesh = isMesh(mesh);
        if (isValidMesh !== true) {
            return 'mesh ' + i + ' in meshes is not a valid mesh. ' + isValidMesh;
        }

        if (!value.mesh_attrs.hasOwnProperty(mesh.id)) {
            return 'mesh_attrs is missing an entry for the mesh with id ' + mesh.id;
        }

        var attrs = value.mesh_attrs[mesh.id];
        var isValidAttr = objectHasFormat(attrs, attrFormat);
        if (isValidAttr !== true) {
            return 'mesh_attrs for mesh ' + mesh.id + ' is not a valid mesh_attr. ' + isValidAttr;
        }
    }

    var validStates = ['created', 'repaired', 'oriented', 'positioned', 'supported'];
    if (validStates.indexOf(value.state) === -1) {
        return 'state ' + value.state + ' is not a valid state for a tray';
    }

    // If possible, ensure the type, profile, and material are all compatible with each other\
    var profile = null;
    if (profilesById) {
        profile = profilesById[value.profile_id];
        if (!profile) {
            return 'profile ID "' + value.profile_id + '" does not correspond to a known printer profile';
        }
    }

    var material = null;
    if (value.hasOwnProperty('default_material_id') && materialsById) {
        material = materialsById[value.default_material_id];
        if (!material) {
            return 'material ID "' + value.default_material_id + '" does not correspond to a known material';
        }
    }

    var printerType = null;
    if (printerTypesById) {
        printerType = printerTypesById[value.printer_type_id];
        if (!printerType) {
            return 'printer type ID "' + value.printer_type_id + '" does not correspond to a known printer type';
        }

        if (value.hasOwnProperty('default_material_id') && material && material.printer_types.indexOf(printerType.id) === -1) {
            return 'the provided default_material_id is not compatible with the provided printer_type';
        }

        if (profile && profile.printer_types.indexOf(printerType.id) === -1) {
            return 'the provided profile is not compatible with the provided printer_type';
        }
    }

    return true;
}

module.exports = {
    isUUID: isUUID,
    isTransform: isTransform,
    isPrinterType: isPrinterType,
    isPrinter: isPrinter,
    isMaterial: isMaterial,
    isProfile: isProfile,
    isMesh: isMesh,
    isTray: isTray
};