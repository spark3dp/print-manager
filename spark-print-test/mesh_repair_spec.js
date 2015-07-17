var frisby = require('frisby')
, util = require('util')
, config = require('./config.js')
, files = require('./files.js')
, tasks = require('./tasks.js')
, meshes = require('./meshes.js')
, harness = require('./harness.js')
;

require('jasmine-expect');


function validate( data, next )
{
    // Be careful!!  Repair returns the mesh in the "result" property.
    var mesh = data.result;
    var geom = mesh.geom;
    expect(geom.num_vertices).toBe(562);
    expect(geom.num_triangles).toBe(1120);
    next( data );
}


function repairMesh( data, next )
{
    var mesh = data.mesh;
    expect(mesh).toBeObject();
    
    frisby.create('mesh repair')
    .post( config.URL + '/geom/meshes/repair', { "id" : mesh.id, "all" : true } )
    .expectHeaderContains( 'content-type', 'application/json' )
    .expectStatus( 202 )
    .expectJSONTypes( tasks.JSONTypes )
    .afterJSON(function(json) {
            data.task_id = json.id;
            tasks.wait( data, next );
        }
    )
    .toss();
}


function validateWithVisual( data, next )
{
    // Be careful!!  Repair returns the mesh in the "result" property.
    var mesh = data.result;
    var geom = mesh.geom;
    expect(geom.num_vertices).toBe(562);
    expect(geom.num_triangles).toBe(1120);
    expect(mesh.visual_file_id).toBeDefined()
    next( data );
}


function repairMeshWithVisual( data, next )
{
    var mesh = data.mesh;
    expect(mesh).toBeObject();
    
    frisby.create('mesh repair')
    .post( config.URL + '/geom/meshes/repair', { "id" : mesh.id, "all" : true, "generate_visual" : true } )
    .expectHeaderContains( 'content-type', 'application/json' )
    .expectStatus( 202 )
    .expectJSONTypes( tasks.JSONTypes )
    .afterJSON(function(json) {
            data.task_id = json.id;
            tasks.wait( data, next );
        }
    )
    .toss();
}


function checkImport( data, next ) {
    var geom = data.mesh.geom;
    expect(geom.num_vertices).toBe(562);
    expect(geom.num_triangles).toBe(1120);
    next( data );
}

// Test what happens when no id is specified
harness.runTests( [
    function( data, next ) {
        frisby.create('mesh repair without id')
        .post( config.URL + '/geom/meshes/repair' )
        .expectStatus( 400 )
        .toss();
    } ] );


// Repair the heart.  There should be no problems.
harness.runTests( [
    meshes.importHeart,
    checkImport,
    repairMesh,
    validate
] );


// Analyze the cut up bunny.  There should be boundaries.
harness.runTests( [

    // upload and import the file "CutUpBunny.obj"
    meshes.importBunny,
    
    // try to repair it
    repairMesh,

    // we should see a problem of "holes" since it currently doesn't get fixed.
    function( data, next ) {
        var result = data.result;

        expect(result).toBeObject();
        expect(result.problems).toBeArrayOfSize(1);
        expect(result.problems[0].type).toBe("holes");
        next( data );
    }
] );

// Repair with generate visual:
harness.runTests( [
    meshes.importHeart,
    checkImport,
    repairMeshWithVisual,
    validateWithVisual
] );


