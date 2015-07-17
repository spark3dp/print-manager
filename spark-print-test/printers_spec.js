var frisby = require('frisby'),
    config = require('./config.js'),
    harness = require('./harness.js');

require('jasmine-expect');

function printerFields() {
    frisby.create('Ensure required properties exist for printers')
        .get(config.URL + '/print/printers')
        .expectStatus(200)
        .expectJSONTypes('printers.*', {
            id: String,
            name: String,
            type_id: String,
            default_material_id: String,
            default_profile_id: String
        })
    .toss();
}

function getPrinters(data, next) {
    frisby.create('Ensure required properties exist for printers')
        .get(config.URL + '/print/printers')
        .expectStatus(200)
        .afterJSON(function(json) {
            expect(json).toBeObject();

            var printers = json.printers;
            expect(printers).toBeArrayOfObjects();

            printers.forEach(function(printer) {
                next(printer);
            });
        })
    .toss();
}

function getDefaultMaterial(printer, next) {
    frisby.create('Get default material for ' + printer.name)
        .get(config.URL + '/printdb/materials/' + printer.default_material_id)
        .expectStatus(200)
        .afterJSON(function (defaultMaterial) {
            expect(defaultMaterial).toBeObject();
            expect(defaultMaterial.printer_types).toContain(printer.type_id);

            next(printer);
        })
    .toss();
}

function getDefaultProfile(printer, next) {
    frisby.create('Get default profile for ' + printer.name)
        .get(config.URL + '/printdb/profiles/' + printer.default_profile_id)
        .expectStatus(200)
        .afterJSON(function(defaultProfile) {
            expect(defaultProfile).toBeObject();
            expect(defaultProfile.printer_types).toContain(printer.type_id);
        })
        .toss();
}

harness.runTests([
    printerFields
]);

harness.runTests([
    getPrinters,
    getDefaultMaterial,
    getDefaultProfile
]);
