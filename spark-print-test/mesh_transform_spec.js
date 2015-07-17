var frisby = require('frisby')
, config = require('./config.js')
, meshes = require('./meshes.js')
, harness = require('./harness.js')
, analyze_spec = require('./mesh_analyze_spec.js')
, visualize_spec = require('./generate_visual_spec.js')
;

require('jasmine-expect');

function transform( data, next )
{
    var mesh = data.result;
    var prob = mesh.problems;
    var vid = mesh.visual_file_id;

    frisby.create('transform mesh')
    .post( config.URL + '/geom/meshes/transform', {
        "id" : mesh.id,
        "transform" : data.new_transform
    }, {json: true} )
    .expectHeaderContains( 'content-type', 'application/json' )
    .expectStatus( 200 )
    .expectJSONTypes( meshes.JSONTypes )
    .afterJSON(function(mesh) {

            expect(mesh).toBeDefined;
            expect(mesh).toBeObject;
            expect(mesh.transform).toBeArray;
            expect(mesh.transform).toEqual( data.new_transform );

            // Check that problems and visual_file_id fields don't change
            expect(mesh.analyzed).toBe(true);
            expect(mesh.problems).toBeArrayOfSize( prob.length );
            expect(mesh.visual_file_id).toBe( vid );
        }
    )
    .toss();
}

harness.runTests( [

    meshes.importHeart,
    analyze_spec.analyze,
    visualize_spec.generateVisual,

    function( data, next ){
        
        expect(data.result.transform).toEqual([[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]])
        expect(data.result.analyzed).toBe(true);
        expect(data.result.problems).toBeArrayOfSize(0);
        expect(data.mesh.visual_file_id).toBeString;

        data.new_transform = [ [2, 0, 0, 0], [0, 2, 0, 0], [0, 0, 2, 0] ];
        next( data );
    },

    transform
] );