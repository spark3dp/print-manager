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
    var result = data.result;
    expect(result.visual_file_id).toBeString();
    next(data);
}


function generateVisual( data, next )
{
    var mesh = data.mesh;
    expect(mesh).toBeObject();
    
    frisby.create('generate visual')
    .post( config.URL + '/geom/meshes/generateVisual', { "id" : mesh.id } )
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


function tryRepeating( data, next )
{
    var mesh = data.mesh;
    var vid  = mesh.visual_file_id;
    
    frisby.create('generate visual')
    .post( config.URL + '/geom/meshes/generateVisual', { "id" : mesh.id } )
    .expectHeaderContains( 'content-type', 'application/json' )
    .expectStatus( 200 )
    .expectJSONTypes( meshes.JSONTypes )
    .afterJSON(function(mesh) {
            // console.log( "MESH: " + util.inspect(mesh) );
            expect(mesh.visual_file_id === vid);
        }
    );
}


// Test what happens when no id is specified
harness.runTests( [
    function( data, next ) {
        frisby.create('generate visual without id')
        .post( config.URL + '/geom/meshes/generateVisual' )
        .expectStatus( 400 )
        .toss();
    } ] );


// Generate visual file for the heart.  There should be no problems.
harness.runTests( [
    meshes.importHeart,
    checkImport,
    generateVisual,
    validate,
    tryRepeating
] );

module.exports = exports = {
    'generateVisual' : generateVisual
};
