var FDMTranslatorPrintrbot = require('../FDMTranslatorPrintrbot'),
	util = require('util'),

PrintrbotSimpleTranslator = function(printerType, printerProfile, material, config) {
    FDMTranslatorPrintrbot.call(this, printerType, printerProfile, material, config);
    this.jobName = "Spark";
};

util.inherits(PrintrbotSimpleTranslator, FDMTranslatorPrintrbot);

PrintrbotSimpleTranslator.canTranslate = function (printerType, profile, material) {
    return printerType.id === "8301C8D0-7A59-4F4B-A918-D5D38888790F";
};

module.exports = PrintrbotSimpleTranslator;
