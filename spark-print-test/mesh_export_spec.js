var frisby = require('frisby')
, config = require('./config.js')
, files = require('./files.js')
, tasks = require('./tasks.js')
, meshes = require('./meshes.js')
, harness = require('./harness.js')
;

require('jasmine-expect');

function validate ( data, next )
{
    frisby.create('retrieve exported file')
    .get( config.URL + '/files/' + data.result.file_id)
    .expectStatus(200)
    .toss()

    next( data );
}

function exportMesh( data, next )
{
    frisby.create('export mesh')
    .post( config.URL + '/geom/meshes/export', {
        "id" : data.mesh.id,
        "file_type" : data.file_type } )
    .expectHeaderContains( 'content-type', 'application/json' )
    .expectJSONTypes( tasks.JSONTypes )
    .afterJSON(function(json) {
        data.task_id = json.id;
        tasks.wait(data, function( data2, next2)
                    {
                        validate( data2, next );
                    } )
    } )
    .toss();  
}

// Test what happens when no file_id is specified
harness.runTests( [
    function( data, next ) {
        frisby.create('import mesh without file_id')
        .post( config.URL + '/geom/meshes/import' )
        .expectStatus( 400 )
        .toss();
    } ] );

// Export an STL ASCII and Obj file
harness.runTests( [
    meshes.importHeart,
    
    function( data, next ) {
        var mesh = data.mesh;
        expect(mesh).toBeObject();

        data.file_type = "stl_ascii";
        next( data );
    },
    
    //STL ASCII
    exportMesh,

     function( data, next ) {
        data.file_type = "obj";
        next( data );
    },

    //Obj
    exportMesh
] );
