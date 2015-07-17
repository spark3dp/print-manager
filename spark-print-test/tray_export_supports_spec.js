var frisby = require('frisby')
, config = require('./config.js')
, files = require('./files.js')
, tasks = require('./tasks.js')
, meshes = require('./meshes.js')
, harness = require('./harness.js')
, printerTypes = require('./printertypes.js')
, profiles = require('./profiles.js')
, util = require('util')
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
    expect(tray.state).toEqual("created");

    // console.log("TRAY: " + util.inspect(tray));

    var meshID = tray.meshes[0].id;
    expect(tray.mesh_attrs).toBeObject();
    expect(tray.mesh_attrs[meshID]).toBeObject();
    expect(tray.mesh_attrs[meshID]["reposition"]).toBeTrue();
    expect(tray.mesh_attrs[meshID]["reorient"]).toBeTrue();
    expect(tray.mesh_attrs[meshID]["support"]).toBeTrue();

    next(data);
}


function createTrayWithMultipleMeshes( data, next )
{
    expect(data.printerType).toBeObject();
    expect(data.profile).toBeObject();
    expect(data.mesh).toBeObject();
    expect(data.mesh.id).toBeString();

    frisby.create('create tray')
    .post( config.URL + '/print/trays', {
        "printer_type_id" : data.printerType.id,
        "profile_id" : data.profile.id,
        "mesh_ids" : [ data.Cylinder.id, data.Elephant.id, data.Torus.id ] } )
    .expectStatus( 202 )
    .afterJSON( function(json) {
        data.task_id = json.id;
        tasks.wait( data, next );
    } )
    .toss();
}


function prepareTray( data, next )
{
    frisby.create('prepare tray')
    .post( config.URL + '/print/trays/prepare', {
        "id" : data.result.id } )
    .expectStatus( 202 )
    .afterJSON( function(json) {
        data.task_id = json.id;
        tasks.wait( data, next );
    } )
    .toss();
}


function validateTrayAfterPrepare( data, next )
{
    var tray = data.result;
    expect(tray).toBeDefined();

    expect(tray.id).toBeString();
    expect(tray.printer_type_id).toBeString();
    expect(tray.profile_id).toBeString();
    expect(tray.meshes).toBeArray();
    expect(tray.ready).toBeTrue();
    expect(tray.state).toEqual("supported");

    // console.log("TRAY: " + util.inspect(tray));

    var meshID = tray.meshes[0].id;
    expect(tray.mesh_attrs).toBeObject();
    expect(tray.mesh_attrs[meshID]).toBeObject();
    expect(tray.mesh_attrs[meshID]["reposition"]).toBeFalse();
    expect(tray.mesh_attrs[meshID]["reorient"]).toBeFalse();
    expect(tray.mesh_attrs[meshID]["support"]).toBeFalse();

    next(data);
}


function exportAllSupports( data, next )
{
    // Stash the meshID so we can use it in the validation step:
    var preparedTray = data.result;
    data.meshIDs = preparedTray.meshes.map(function(m) { return m.id; });
    data.visualsRequested = true;

    frisby.create('export supports')
    .post( config.URL + '/print/trays/exportSupports',
        { "id" : preparedTray.id,
          "generate_visual" : true })
    .expectStatus( 202 )
    .afterJSON( function(json) {
        data.task_id = json.id;
        tasks.wait( data, next );
    } )
    .toss();
}


function exportOneOfThreeSupports( data, next )
{
    // Stash the meshID so we can use it in the validation step:
    var preparedTray = data.result;
    
    // Mesh index 1 should be the Elephant
    // console.log("Exporting mesh ID: " + preparedTray.meshes[1].id);
    data.meshIDs = [ preparedTray.meshes[1].id ];
    data.visualsRequested = false;

    frisby.create('export supports')
    .post( config.URL + '/print/trays/exportSupports', {
        "id" : preparedTray.id,
        "mesh_ids" : data.meshIDs } )
    .expectStatus( 202 )
    .afterJSON( function(json) {
        data.task_id = json.id;
        tasks.wait( data, next );
    } )
    .toss();
}


function validateExport( data, next )
{
    var meshes = data.result;
    expect(meshes).toBeDefined();
    expect(meshes).toBeObject();

    // console.log("exported supports: " + util.inspect(meshes));

    // Get stashed mesh ids:
    var originalMeshIDs = data.meshIDs;
    for( var i=0;  i < originalMeshIDs.length;  ++i )
    {
        expect(originalMeshIDs[i] in meshes).toBeTrue();

        var newMesh = meshes[originalMeshIDs[i]];
        expect(newMesh.id).toBeString();
        expect(newMesh.name).toBeString();
        expect(newMesh.transform).toBeArray;
        expect(newMesh.geom).toBeObject();
        expect(newMesh.geom.num_triangles).toBeNumber();
        expect(newMesh.geom.num_vertices).toBeNumber();
        expect(newMesh.geom.has_uvs).toBeBoolean();

        if( data.visualsRequested )
            expect(newMesh.visual_file_id).toBeString();
        else
            expect(newMesh.visual_file_id).toBeUndefined;
    }

    next(data);
}


// Test what happens when no data is specified
harness.runTests( [
    function( data, next ) {
        frisby.create('export supports invalid')
        .post( config.URL + '/print/trays/exportSupports' )
        .expectStatus( 400 )
        .toss();
    } ] );

// Test what happens when invalid id is specified
harness.runTests( [
    function( data, next ) {
        frisby.create('export supports bad id')
        .post( config.URL + '/print/trays/exportSupports',
            { id: "are you kidding" } )
        .expectStatus( 404 )
        .toss();
    } ] );

// Create a nice tray with 3 objects. Then prepare it and 
// export all the support meshes:
harness.runTests( [
    printerTypes.findEmber,
    profiles.findEmber,
    meshes.importTorus,
    meshes.importCylinder,
    meshes.importElephant,
    createTrayWithMultipleMeshes,
    validateTray,
    prepareTray,
    validateTrayAfterPrepare,
    exportAllSupports,
    validateExport
    ] );

// Create a nice tray with 3 objects. Then prepare it and
// export only one of the three support meshes:
harness.runTests( [
    printerTypes.findEmber,
    profiles.findEmber,
    meshes.importTorus,
    meshes.importCylinder,
    meshes.importElephant,
    createTrayWithMultipleMeshes,
    validateTray,
    prepareTray,
    validateTrayAfterPrepare,
    exportOneOfThreeSupports,
    validateExport
    ] );
