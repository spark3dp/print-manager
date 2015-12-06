var FDMTranslatorMarlin = require('../FDMTranslatorMarlin'),
	util = require('util'),

UltimakerTranslator = function(printerType, printerProfile, material, config) {
    FDMTranslatorMarlin.call(this, printerType, printerProfile, material, config);
    this.jobName = "Spark";
};

util.inherits(UltimakerTranslator, FDMTranslatorMarlin);

UltimakerTranslator.canTranslate = function (printerType, profile, material) {
    return printerType.id === "8D39294C-FA7A-40F4-AB79-19F506C64097";
};

module.exports = UltimakerTranslator;
