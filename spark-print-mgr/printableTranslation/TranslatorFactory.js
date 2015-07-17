var walk = require('fs-walk'),
    path = require('path'),
    fs = require('fs'),
    logger = require('../logging/PrintManagerLogger'),
    Translator = require('./Translator');

function TranslatorFactory() {
    this.translators = [];
}

TranslatorFactory.prototype.registerTranslator = function (translatorClass) {
    if (translatorClass.prototype instanceof Translator) {
        this.translators.push(translatorClass);
        return true;
    }
    return false;
};

TranslatorFactory.prototype.getTranslator = function (printerType, printerProfile, material) {
    for (var i = 0; i < this.translators.length; ++i) {
        var translatorClass = this.translators[i];
        try {
            if (translatorClass.canTranslate(printerType, printerProfile, material)) {
                return new translatorClass(printerType, printerProfile, material);
            }
        } catch (e) {
        }
    }
    return null;
};

TranslatorFactory.prototype.registerTranslators = function (directory) {
    var self = this;

    if (!directory) {
        directory = path.join(__dirname, 'translators');
    }

    if (!fs.existsSync(directory)) {
        return false;
    }

    var found = false;
    walk.filesSync(directory, function (basedir, filename, stat, next) {
        try {
            var translatorClass = require(path.join(basedir, filename));
            found = self.registerTranslator(translatorClass) || found;
        } catch (e) {
            logger.error(e);
        }
    }, function (err) {
        if (err) logger.error(err);
    });

    return found;
};

TranslatorFactory.prototype.getTranslatorCount = function () {
    return this.translators.length;
};

TranslatorFactory.prototype.clearTranslators = function () {
    this.translators = [];
};

var theTranslatorFactory = new TranslatorFactory();
module.exports = theTranslatorFactory;