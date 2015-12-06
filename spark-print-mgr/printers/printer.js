var util = require('util'),
    _ = require('underscore'),
    logger = require('../logging/PrintManagerLogger'),
    resource = require('../resource'),
    printerTypes = require('../printertypes');


function Printer(name, type_id, connection, id, data) {
    _.extend(this, data);
    resource.Resource.call(this);  // This is what sets our id
    this.name = name;
    this.type_id = type_id;
    this.__connection = connection;
    this.id = id || this.id;
    this.default_material_id = "";
    this.default_profile_id = "";

    // Get default material and profile from the printer type
    var printerType = printerTypes.find(type_id);
    var defaultMaterialId;
    var defaultProfileId;

    if (printerType) {
        defaultMaterialId = printerType.getDefaultMaterialId();
        defaultProfileId = printerType.getDefaultProfileId();

        if (!defaultMaterialId) {
            logger.warn('Failed to get default_material_id from printer type: ' + type_id);
        } else {
            this.default_material_id = defaultMaterialId;
        }

        if (!defaultProfileId) {
            logger.warn('Failed to get default_profile_id from printer type: ' + type_id);
        } else {
            this.default_profile_id = defaultProfileId;
        }

    } else {
        logger.warn('Failed to get printer from type_id: ' + type_id);
    }
}

util.inherits(Printer, resource.Resource);

module.exports = exports = Printer;