var should = require('should'),
    fs = require('fs'),
    os = require('os'),
    path = require('path'),
    materials = require('../materials.js'),
    printerTypes = require('../printertypes.js'),
    profiles = require('../profiles.js'),
    ProtoBuf = require('protobufjs'),
    DLPTranslator = require('../printableTranslation/DLPTranslator.js'),
    Promise = require('Promise'),
    util = require('util');

describe('DLPTranslator', function () {
    var printerType, printerProfile, material;

    before(function (done) {
        printerTypes.initialize();
        printerType = printerTypes.find('7FAF097F-DB2E-45DC-9395-A30210E789AA');
        should.exist(printerType);

        materials.initialize();
        material = materials.find('426F14FE-E6AF-496F-BBC7-7D6C0E16861D');
        should.exist(material);

        profiles.initialize();
        printerProfile = profiles.find('0EE76E3C-41FB-ACA7-362A-F1A2818BC3F2');
        should.exist(printerProfile);

        done();
    });

    // Derive a basic DLP to JSON translator for testing that the onHeader, onSlice,
    // and writeToFile methods are called at the right times.
    //
    function DLPToJSONTranslator(printerType, printerProfile, material) {
        DLPTranslator.call(this, printerType, printerProfile, material);
        this.sliceCount = 0;
        this.output = {};
    }

    util.inherits(DLPToJSONTranslator, DLPTranslator);

    DLPToJSONTranslator.canTranslate = function (printerType, printerProfile, material) {
        return printerType.technology === 'DLP';
    };

    DLPToJSONTranslator.prototype.onHeader = function (header) {
        header.should.have.property('printer_type_id').and.be.String;
        header.should.have.property('image_height').and.be.Number;
        header.should.have.property('image_width').and.be.Number;
        header.should.have.property('num_slices').and.be.Number;

        this.sliceCount = header.num_slices;
        var jsonHeader = {
            'printer_type_id': header.printer_type_id,
            'image_height': header.image_height,
            'image_width': header.image_width,
            'num_slices': header.num_slices,
        };

        this.output.header = jsonHeader;
    };

    DLPToJSONTranslator.prototype.onSlice = function (index, slice) {
        slice.should.have.property('png_data').and.be.instanceof(ProtoBuf.ByteBuffer);
        if (!this.output.slices) {
            this.output.slices = [];
        }
        this.output.slices.push({index: index, size: slice.png_data.buffer.length});

        var progress = (index + 1) / this.sliceCount;
        this.setProgress(progress);
    };

    DLPToJSONTranslator.prototype.endTranslation = function (outputFile) {
        var self = this;
        return new Promise(function (resolve, reject) {
            fs.writeFile(outputFile, JSON.stringify(self.output), function (err) {
                if (err) {
                    reject(err);
                    return;
                }
                resolve();
            });
        });
    };

    it('should translate a valid DLP file', function (done) {
        DLPToJSONTranslator.canTranslate(printerType, printerProfile, material).should.be.true;

        var translator = new DLPToJSONTranslator(printerType, printerProfile, material);
        translator.getPrinterType().should.eql(printerType);
        translator.getPrinterProfile().should.eql(printerProfile);
        translator.getMaterial().should.eql(material);

        translator.on('progress', function (progress) {
            translator.progress.should.equal(progress);
        });

        var inputFile = path.join(__dirname, 'data/printables/DLPPrintable.pb');
        var outputFile = path.join(os.tmpdir(), 'DLPPrintable.json');
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

    it('should fail translate an invalid DLP file', function (done) {
        var translator = new DLPToJSONTranslator(printerType, printerProfile, material);

        var inputFile = path.join(__dirname, 'data/printables/FDMPrintable.mic');
        var outputFile = path.join(os.tmpdir(), 'DLPPrintable.json');
        translator.translate(inputFile, outputFile)
            .then(function () {
                done(new Error('This test should have failed.'));
            })
            .catch(function (err) {
                err.message.should.equal('Not a valid printable file.');
                done();
            })
            .catch(function (err) {
                done(err);
            });
    });
});
