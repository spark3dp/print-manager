var FDMTranslatorDelta = require('../FDMTranslatorDelta'),
util = require('util'),

DreamMaker_OverLordTranslator = function(printerType, printerProfile, material, config) {
    FDMTranslatorDelta.call(this, printerType, printerProfile, material, config);
    this.jobName = "Spark";
};

util.inherits(DreamMaker_OverLordTranslator, FDMTranslatorDelta);

DreamMaker_OverLordTranslator.canTranslate = function (printerType, profile, material) {
    return printerType.id === "4A0F7523-071B-4F1E-A527-9DA49AECB807";
};

module.exports = DreamMaker_OverLordTranslator;
