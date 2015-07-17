var FDMTranslatorMakerbot = require('../FDMTranslatorMakerbot'),
	util = require('util'),

Replicator2Translator = function(printerType, printerProfile, material, config) {
    FDMTranslatorMakerbot.call(this, printerType, printerProfile, material, config);
    this.jobName = "Spark";
};

util.inherits(Replicator2Translator, FDMTranslatorMakerbot);

Replicator2Translator.canTranslate = function (printerType, profile, material) {
    return printerType.id === "F2F4B9B6-1D54-4A16-883E-B0385F27380D";
};

module.exports = Replicator2Translator;
