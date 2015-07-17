var frisby = require('frisby')
, config = require('./config.js')
, files = require('./files.js')
, tasks = require('./tasks.js')
, meshes = require('./meshes.js')
, harness = require('./harness.js')
, printerTypes = require('./printertypes.js')
, profiles = require('./profiles.js')
;

require('jasmine-expect');


function validateTray( data, next )
{
    var tray = data.result;
    expect(tray).toBeDefined();

    expect(tray.id).toBeString();
    expect(tray.printer_type_id).toBeString();
    expect(tray.profile_id).toBeString();
    expect(tray.meshes).toBeArray();
    expect(tray.ready).toBeFalse();
    expect(tray.state === "created");

    // console.log("TRAY: " + util.inspect(tray));

    var meshID = tray.meshes[0].id;
    expect(tray.mesh_attrs).toBeObject();
    expect(tray.mesh_attrs[meshID]).toBeObject();
    expect(tray.mesh_attrs[meshID]["reposition"]).toBeTrue();
    expect(tray.mesh_attrs[meshID]["reorient"]).toBeTrue();
    expect(tray.mesh_attrs[meshID]["support"]).toBeTrue();
}


function createTray( data, next )
{
    expect(data.printerType).toBeObject();
    expect(data.profile).toBeObject();
    expect(data.mesh).toBeObject();
    expect(data.mesh.id).toBeString();

    frisby.create('create tray')
    .post( config.URL + '/print/trays', {
        "printer_type_id" : data.printerType.id,
        "profile_id" : data.profile.id,
        "mesh_ids" : [ data.mesh.id ] } )
    .expectStatus( 202 )
    .afterJSON( function(json) {
        data.task_id = json.id;
        tasks.wait( data, next );
    } )
    .toss();
}


// Test what happens when no data is specified
harness.runTests( [
    function( data, next ) {
        frisby.create('create tray')
        .post( config.URL + '/print/trays' )
        .expectStatus( 400 )
        .toss();
    } ] );

// Create a nice tray with a heart.
harness.runTests( [
    printerTypes.findEmber,
    profiles.findEmber,
    meshes.importHeart,
    createTray,
    validateTray
    ] );
