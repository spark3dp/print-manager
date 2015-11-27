var FDMTranslatorDelta = require('../FDMTranslatorDelta'),
	util = require('util'),

OceanFarm1Translator = function(printerType, printerProfile, material, config) {
    FDMTranslatorDelta.call(this, printerType, printerProfile, material, config);
    this.jobName = "Spark";
};

util.inherits(OceanFarm1Translator, FDMTranslatorDelta);

OceanFarm1Translator.canTranslate = function (printerType, profile, material) {
    return printerType.id === "FA1118E1-7A59-FF4B-B938-D4D37788792F";
};

module.exports = OceanFarm1Translator;
