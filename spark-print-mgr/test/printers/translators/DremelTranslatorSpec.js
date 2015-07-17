var should = require('should'),
    os = require('os'),
    path = require('path'),
    checksum = require('checksum'),

    TestHelper = require('../../helpers/TestHelper'),
    DremelTranslator = require('../../../printableTranslation/translators/Dremel'),

    printerType = {id :"3F64F6EC-A1DF-44AB-A22E-58C036F2F474"},
    comparableFile = path.join(__dirname, '../../data/comparables/FDMComparableDremel.g3drem'),
    inputFile = path.join(__dirname, '../../data/printables/FDMPrintableDremel.mic'),
    outputFile = path.join(os.tmpdir(), 'FDMPrintableDremel.g3drem');

describe('Dremel Translator', function () {
    it('should verify that it has the proper printerType ID', function (done) {
        DremelTranslator.canTranslate(printerType, undefined, undefined).should.equal(true);
        done();
    });

    it('should verify that the Dremel icon file exists', function (done) {
        var bitmapFilename = path.join(__dirname, '../../../../spark-print-data/data/DremelPrintableIcon.bmp');
        TestHelper.fileExists(bitmapFilename).should.equal(true);
        done();
    });

    it('should translate a valid FDM file', function (done) {
        var config = {
            verbose : undefined,
            precision : undefined
        };
        config.verbose = false;
        config.precision = {
            x: 3,
            y: 3,
            z: 3,
            e: 5,
            f: 0,
            p: 0,
            s: 0
        };

        var translator = new DremelTranslator(printerType, undefined, undefined, config);

        translator.translate(inputFile, outputFile)
        .then(function () {
            TestHelper.fileExists(outputFile).should.equal(true);
            done();
        })
        .catch(function (err) {
            done(err);
        });
    });

    it('should match our expected file', function (done) {
        checksum.file(outputFile, function (err, sum) {
            checksum.file(comparableFile, function (err2, sum2) {
                sum.should.equal(sum2);
                done();
            });
        });
    });

});