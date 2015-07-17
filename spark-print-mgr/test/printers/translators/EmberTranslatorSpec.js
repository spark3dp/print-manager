var should = require('should'),
    os = require('os'),
    path = require('path'),
    materials = require('../../../materials.js'),
    printerTypes = require('../../../printertypes.js'),
    profiles = require('../../../profiles.js'),
    EmberTranslator = require('../../../printableTranslation/translators/Autodesk-Ember.js');

describe('Ember Translator', function () {
    var printerType, printerProfile, material;

    before(function (done) {
        printerTypes.initialize();
        printerType = printerTypes.find('7FAF097F-DB2E-45DC-9395-A30210E789AA');
        should.exist(printerType);

        materials.initialize();
        material = materials.find('426F14FE-E6AF-496F-BBC7-7D6C0E16861D');
        should.exist(material);

        profiles.initialize();
        printerProfile = profiles.find('9AEF2475-4A9B-4BAC-FE1B-F0A72703A1AA');
        should.exist(printerProfile);

        // TODO:  These parameters are required by the translator.  The profiles need to
        //        be updated to include these and any missing ones in profiles.json.
        //
        printerProfile['burn_in_layer_angle_of_rotation'] = 10;
        printerProfile['first_layer_angle_of_rotation'] = 10;
        printerProfile['model_layer_angle_of_rotation'] = 10;

        done();
    });

    it('should translate a valid DLP file', function (done) {
        var translator = new EmberTranslator(printerType, printerProfile, material);
        translator.getPrinterType().should.eql(printerType);
        translator.getPrinterProfile().should.eql(printerProfile);
        translator.getMaterial().should.eql(material);

        translator.on('progress', function (progress) {
            translator.progress.should.equal(progress);
        });

        var inputFile = path.join(__dirname, '../../data/printables/DLPPrintable.pb');
        var outputFile = path.join(os.tmpdir(), 'EmberPrintable.tar.gz');
        translator.translate(inputFile, outputFile)
            .then(function () {
                TestHelper.fileExists(outputFile);

                // TODO:  Read the output file to check correctness.
                //
                done();
            })
            .catch(function (err) {
                done(err);
            });
    });
});