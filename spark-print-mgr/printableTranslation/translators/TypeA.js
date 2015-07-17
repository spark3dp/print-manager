var FDMTranslatorMarlin = require('../FDMTranslatorMarlin'),
	util = require('util'),

TypeATranslator = function(printerType, printerProfile, material, config) {
    FDMTranslatorMarlin.call(this, printerType, printerProfile, material, config);
    this.jobName = "Spark";
};

util.inherits(TypeATranslator, FDMTranslatorMarlin);

TypeATranslator.canTranslate = function (printerType, profile, material) {
    return printerType.id === "F2F4B9B6-1D54-4A16-883E-B0385F27380C";
};

module.exports = TypeATranslator;
