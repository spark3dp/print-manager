var FDMTranslatorPrintrbot = require('../FDMTranslatorPrintrbot'),
	util = require('util'),

PrintrbotSimpleTranslator = function(printerType, printerProfile, material, config) {
    FDMTranslatorPrintrbot.call(this, printerType, printerProfile, material, config);
    this.jobName = "Spark";
};

util.inherits(PrintrbotSimpleTranslator, FDMTranslatorPrintrbot);

PrintrbotSimpleTranslator.canTranslate = function (printerType, profile, material) {
    return printerType.id === "152A72A1-45C7-11E5-B970-0800200C9A66";
};

module.exports = PrintrbotSimpleTranslator;
