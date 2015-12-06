var FDMTranslatorPrintrbot = require('../FDMTranslatorPrintrbot'),
	util = require('util'),

PrintrbotSimpleTranslator = function(printerType, printerProfile, material, config) {
    FDMTranslatorPrintrbot.call(this, printerType, printerProfile, material, config);
    this.jobName = "Spark";
};

util.inherits(PrintrbotSimpleTranslator, FDMTranslatorPrintrbot);

PrintrbotSimpleTranslator.canTranslate = function (printerType, profile, material) {
    return printerType.id === "8D586473-C1A9-451B-A129-2425357C6428";
};

module.exports = PrintrbotSimpleTranslator;
