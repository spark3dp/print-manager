var should = require('should'),
    fs = require('fs'),
    path = require('path'),
    DLPTranslator = require('../printableTranslation/DLPTranslator.js'),
    FDMTranslator = require('../printableTranslation/FDMTranslator.js'),
    DLPToJSONTranslator = require('./data/translators/DLPToJSONTranslator.js'),
    TranslatorFactory = require('../printableTranslation/TranslatorFactory'),
    util = require('util');

describe('TranslatorFactory', function () {
    beforeEach(function (done) {
        TranslatorFactory.clearTranslators();
        TranslatorFactory.getTranslatorCount().should.equal(0);
        done();
    });

    it('should register any class derived from the Translator class', function (done) {
        TranslatorFactory.registerTranslator(DLPTranslator).should.be.true;
        TranslatorFactory.getTranslatorCount().should.equal(1);
        TranslatorFactory.registerTranslator(FDMTranslator).should.be.true;
        TranslatorFactory.getTranslatorCount().should.equal(2);

        // Derive a basic DLP to JSON translator.
        //
        function NewDLPTranslator(printerType, printerProfile, material) {
            DLPTranslator.call(this, printerType, printerProfile, material);
            this.sliceCount = 0;
            this.output = {};
        }

        util.inherits(NewDLPTranslator, DLPTranslator);

        NewDLPTranslator.prototype.onHeader = function (header) {
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

        NewDLPTranslator.prototype.onSlice = function (index, slice) {
            if (!this.output.slices) {
                this.output.slices = [];
            }
            this.output.slices.push({index: index, size: slice.png_data.buffer.length});

            var progress = (index + 1) / this.sliceCount;
            this.setProgress(progress);
        };

        NewDLPTranslator.prototype.endTranslation = function (outputFile) {
            fs.writeFileSync(outputFile, JSON.stringify(this.output));
        };

        // Registration of this translator should succeed.
        //
        TranslatorFactory.registerTranslator(NewDLPTranslator).should.be.true;
        TranslatorFactory.getTranslatorCount().should.equal(3);

        done();
    });

    it('should not register a class not derived from the Translator class', function (done) {
        function NotATranslator() {
        }

        var nonTranslators = [NotATranslator, new NotATranslator(), 0, 1, true, false, [], {}];

        for (var i = 0; i < nonTranslators.length; ++i) {
            TranslatorFactory.registerTranslator(nonTranslators[i]).should.be.false;

        }
        TranslatorFactory.getTranslatorCount().should.equal(0);

        done();
    });

    it('should register the translators from a given directory', function (done) {
        var success = TranslatorFactory.registerTranslators(1);
        success.should.be.false;
        TranslatorFactory.getTranslatorCount().should.equal(0);

        success = TranslatorFactory.registerTranslators(path.join(__dirname, 'data', 'translators'));
        success.should.be.true;
        TranslatorFactory.getTranslatorCount().should.equal(1);

        var translator = TranslatorFactory.getTranslator(thePrinterType, thePrinterProfile, theMaterial);
        translator.should.be.instanceof(DLPToJSONTranslator);

        done();
    });

    it('should get the correct translator', function (done) {
        // Derive a new translator.
        //
        function DLPToEmberTranslator(printerType, profile, material) {
            DLPTranslator.call(this, printerType, profile, material);
        };
        util.inherits(DLPToEmberTranslator, DLPTranslator);

        // This only returns true if the printer type's id matches #Ember.
        //
        DLPToEmberTranslator.canTranslate = function (printerType, profile, material) {
            return printerType && printerType.id && printerType.id === '7FAF097F-DB2E-45DC-9395-A30210E789AA';
        };

        // No translators yet so we should not be able to retrieve anything.
        //
        var translator = TranslatorFactory.getTranslator(thePrinterType, thePrinterProfile, theMaterial);
        should.not.exist(translator);

        // Register the Ember translator.
        //
        TranslatorFactory.registerTranslator(DLPToEmberTranslator).should.be.true;
        TranslatorFactory.getTranslatorCount().should.equal(1);

        // Retrieving the translator for Ember should now succeeed.
        //
        translator = TranslatorFactory.getTranslator(thePrinterType, thePrinterProfile, theMaterial);
        translator.should.be.instanceof(DLPToEmberTranslator);

        // Clear the translators.  Retrieving the translator should fail again.
        //
        TranslatorFactory.clearTranslators();
        TranslatorFactory.getTranslatorCount().should.equal(0);

        translator = TranslatorFactory.getTranslator(thePrinterType, thePrinterProfile, theMaterial);
        should.not.exist(translator);

        // Reregister the Ember translator.
        //
        TranslatorFactory.registerTranslator(DLPToEmberTranslator).should.be.true;
        translator = TranslatorFactory.getTranslator(thePrinterType, thePrinterProfile, theMaterial);
        translator.should.be.instanceof(DLPToEmberTranslator);

        // Make a copy of the printer type and change the id.  Retrieving the translator should fail.
        //
        var printerType = JSON.parse(JSON.stringify(thePrinterType));
        printerType.id = 'Not Ember';
        translator = TranslatorFactory.getTranslator(printerType, thePrinterProfile, theMaterial);
        should.not.exist(translator);

        done();
    });

    var thePrinterType = { id: '7FAF097F-DB2E-45DC-9395-A30210E789AA',
        version: 1,
        name: 'Ember',
        manufacturer: 'Autodesk',
        model_number: '1.0.0',
        registration_url: null,
        icon_id: 'c28682fc-1487-467c-b833-7dc945b2c60c',
        icon50x50_id: '310bd5b1-c32f-4d57-a5b1-263dad19b1df',
        icon100x100_id: 'd2b30cbf-d2b7-4b52-b706-b6fd9be20ce1',
        technology: 'DLP',
        default_material_id: '426F14FE-E6AF-496F-BBC7-7D6C0E16861D',
        default_profile_id: '34F0E39A-9389-42BA-AB5A-4F2CD59C98E4',
        firmware: { type: 'Ember', version: '1.0.0' },
        build_volume: { type: 'Cartesian',
            bed_size: [ 6.4, 4, 13.4 ],
            bed_offset: [ -3.2, -2, 0 ],
            home_position: [ 0, 0, 0 ],
            park_position: [ 0, 0, 0 ],
            bed_file_id: '39e58891-e6a7-4f42-afb6-33ae3d22ff29' },
        max_materials: 1,
        printable: { content: 'image/png+tar.gz',
            thumbnail: 'image/png',
            extension: 'tar.gz',
            generates_supports: false,
            packager_file_id: 'd49d87c7-5ef3-43b6-b0ae-6abb44674df8' },
        supported_connections: [
            { type: 'bonjour', protocol: '_http._tcp', info: [Object] },
            { type: 'LAN', protocol: '_http._tcp', info: [Object] }
        ],
        preferred_connection: 'bonjour',
        max_speeds: { z: 0.1 },
        software_info: { name: 'Spark Print Studio', url: 'www.spark.autodesk.com' },
        printer_capabilities: {},
        _files: [ 'icon_id',
            'icon50x50_id',
            'icon100x100_id',
            'build_volume.bed_file_id',
            'printable.packager_file_id' ] };

    var thePrinterProfile = { id: '34F0E39A-9389-42BA-AB5A-4F2CD59C98E4',
        version: 1,
        technology: 'DLP',
        name: 'Ember High Quality',
        printer_types: [ '7FAF097F-DB2E-45DC-9395-A30210E789AA' ],
        layer_height: 0.0025,
        support_angle_tol: 1.0472,
        support_contact_tol: 0.0025,
        support_offset: -0.01,
        support_min_radius: 0.1,
        support_min_separation: 0,
        img_width: 1280,
        img_height: 800 };

    var theMaterial = { id: '426F14FE-E6AF-496F-BBC7-7D6C0E16861D',
        version: 1,
        name: 'Resin',
        manufacturer: 'unspecified',
        website: 'unspecified',
        technology: 'DLP',
        composition: 'PHOTORESIN',
        printer_types: [ '7FAF097F-DB2E-45DC-9395-A30210E789AA' ],
        cost: 100,
        rating: 5,
        opacity: 2,
        tags: [],
        pct_shrink: null,
        is_user: false,
        FirstExposureSec: 0,
        BurnInLayers: 0,
        BurnInExposureSec: 0,
        ModelExposureSec: 0,
        density: 0,
        exposure_power: 1,
        cure_time_adhesion: 1,
        cure_time_intermediary: 1,
        cure_time_nominal_layers: 1,
        'shader:glossy_normal_noise_intensity': '0.3',
        'shader:matte_normal_noise_intensity': '0.0',
        color: 'f0f8ff' };
});