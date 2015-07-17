var frisby = require('frisby')
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
    expect(result).toBeObject();
    expect(result.problems).toBeArray();

    next( data );
}


function analyze( data, next )
{
    var mesh = data.mesh;
    expect(mesh).toBeObject();
    
    frisby.create('analyze mesh')
    .post( config.URL + '/geom/meshes/analyze', {
        "id" : mesh.id } )
    .expectHeaderContains( 'content-type', 'application/json' )
    .expectStatus( 202 )
    .expectJSONTypes( tasks.JSONTypes )
    .afterJSON(function(json) {
        data.task_id = json.id;
        tasks.wait( data, function( data2, next2 )
                     {
                         validate( data2, next );
                     } )
    } )
    .toss();
}

function tryRepeating( data, next )
{
    var mesh = data.result;
    var prob = mesh.problems;
    
    frisby.create('analyze mesh')
    .post( config.URL + '/geom/meshes/analyze', {
         "id" : mesh.id } )
    .expectHeaderContains( 'content-type', 'application/json' )
    .expectStatus( 200 )
    .expectJSONTypes( meshes.JSONTypes )
    .afterJSON(function(mesh) {
            expect(mesh.analyzed).toBe(true);
            expect(mesh.problems).toBeArrayOfSize(prob.length);
        }
    )
    .toss();
}

// Test what happens when no id is specified
harness.runTests( [
    function( data, next ) {
        frisby.create('analyze mesh without id')
        .post( config.URL + '/geom/meshes/analyze' )
        .expectStatus( 400 )
        .toss();
    } ] );


// Analyze the heart.  There should be no problems.
harness.runTests( [
    // import the heart
    meshes.importHeart,
    
    // analyze
    analyze,

    function( data, next ) {
        var result = data.result;
        expect(result.problems).toBeDefined();
        expect(result.problems).toBeArrayOfSize(0);
        expect(result.analyzed).toBe(true);
        next( data );
    },

    tryRepeating
] );


// Analyze the cut up bunny.  There should be boundaries.
harness.runTests( [

    // upload and import the file "CutUpBunny.obj"
    meshes.importBunny,
    
    // run the analysis
    analyze,

    // we should see a problem of "holes"
    function( data, next ) {
        var result = data.result;
        expect(result.problems).toBeArrayOfSize(1);
        expect(result.problems[0].type).toBe("holes");
        next( data );
    },

    tryRepeating
] );

module.exports = exports = {
    'analyze' : analyze
};