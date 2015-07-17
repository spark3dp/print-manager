var frisby = require('frisby')
, config = require('./config.js')
, meshes = require('./meshes.js')
, harness = require('./harness.js')
, analyze_spec = require('./mesh_analyze_spec.js')
, visualize_spec = require('./generate_visual_spec.js')
;

require('jasmine-expect');

function rename( data, next )
{
    var mesh = data.result;
    var prob = mesh.problems;
    var vid = mesh.visual_file_id;

    frisby.create('rename mesh')
    .post( config.URL + '/geom/meshes/rename', {
        "id" : mesh.id,
        "name" : data.mesh_rename
    } )
    .expectHeaderContains( 'content-type', 'application/json' )
    .expectStatus( 200 )
    .expectJSONTypes( meshes.JSONTypes )
    .afterJSON(function(mesh) {

            expect(mesh).toBeDefined;
            expect(mesh).toBeObject;
            expect(mesh.name).toBeString;
            expect(mesh.name).toBe( data.mesh_rename );

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
        
        expect(data.result.name).toBe("heart");
        expect(data.result.analyzed).toBe(true);
        expect(data.result.problems).toBeArrayOfSize(0);
        expect(data.result.visual_file_id).toBeString;

        data.mesh_rename = "Heart_Renamed";
        next( data );
    },

    rename
] );