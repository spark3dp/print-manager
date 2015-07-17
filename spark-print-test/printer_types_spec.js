var frisby = require('frisby'),
    config = require('./config.js'),
    harness = require('./harness.js');

require('jasmine-expect');

function printerTypeFields(data, next) {
    frisby.create('Ensure required properties exist for printer types')
        .get(config.URL + '/printdb/printertypes')
        .expectStatus(200)
        .expectJSONTypes('printerTypes.*', { // It's unclear which fields are required at the moment so only check some
            //id:	String,
            //version: Number,
            //manufacturer: String,
            //model: String,
            //technology: String,
            default_material_id: String,
            default_profile_id: String
            //icon_id: String,
            //build_volume: {
            //    type: String,
            //    bed_size: Array,
            //    bed_file_id: String
            //},
            //printable: {
            //packager_file_id: String
            // packager_data: Object  // This one is optional
            //},
            //_files: Array
        })
    .toss();
}

function getPrinterTypes(data, next) {
    frisby.create('Get printer types')
        .get(config.URL + '/printdb/printerTypes')
        .expectStatus(200)
        .afterJSON(function (json) {
            expect(json).toBeObject();

            var printerTypes = json.printerTypes;
            expect(printerTypes).toBeArrayOfObjects();

            printerTypes.forEach(function(printerType) {
                next(printerType);
            });
        })
    .toss();
}

function getDefaultMaterial(printerType, next) {
    frisby.create('Get default material for ' + printerType.name)
        .get(config.URL + '/printdb/materials/' + printerType.default_material_id)
        .expectStatus(200)
        .afterJSON(function (defaultMaterial) {
            expect(defaultMaterial).toBeObject();
            expect(defaultMaterial.printer_types).toContain(printerType.id);

            next(printerType);
        })
    .toss();
}

function getDefaultProfile(printerType, next) {
    frisby.create('Get default profile for ' + printerType.name)
        .get(config.URL + '/printdb/profiles/' + printerType.default_profile_id)
        .expectStatus(200)
        .afterJSON(function(defaultProfile) {
            expect(defaultProfile).toBeObject();
            expect(defaultProfile.printer_types).toContain(printerType.id);
        })
    .toss();
}

harness.runTests([
    printerTypeFields
]);

harness.runTests([
    getPrinterTypes,
    getDefaultMaterial,
    getDefaultProfile
]);
