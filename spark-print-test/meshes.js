var frisby = require('frisby')
, config = require('./config.js')
, files = require('./files.js')
, tasks = require('./tasks.js')
, harness = require('./harness.js')
;

require('jasmine-expect');

var JSONTypes = {
    "id" : String,
    "name" : String,
    "transform" : Number,
    "geom" : Object,
    "visual_file_id" : String,
};


function validate( data, next )
{
    var mesh = data.mesh;
    expect(mesh).toBeDefined();

    expect(mesh.id).toBeString();
    expect(mesh.name).toBeString();
    expect(mesh.transform).toBeArray;
    expect(mesh.geom).toBeObject();
    expect(mesh.geom.num_triangles).toBeNumber();
    expect(mesh.geom.num_vertices).toBeNumber();
    expect(mesh.geom.has_uvs).toBeBoolean();

    next( data );
}


function importMesh( data, next )
{
    expect(data.mesh_file_id).toBeString();
    expect(data.mesh_name).toBeString();
    if(data.mesh_transform){
        expect(data.mesh_transform).toBeArray();
    }

    frisby.create('import mesh')
    .post( config.URL + '/geom/meshes/import', {
        "file_id" : data.mesh_file_id,
        "name" : data.mesh_name,
        "transform" : data.mesh_transform
    }, {json: true})
    .expectHeaderContains( 'content-type', 'application/json' )
    .expectStatus( 202 )
    .expectJSONTypes( tasks.JSONTypes )
    .afterJSON(function(json) {
        data.task_id = json.id;
        tasks.wait( data, function( data2, next2 )
                     {
                         data2.mesh = data2.result;
                         validate( data2, next );
                     } )
    } )
    .toss();
}

var importHeart = harness.wrap( [
    files.uploadHeart,
    
    function( data, next ) {
        data.mesh_file_id = data.file_id;
        data.mesh_name = "heart";
        next( data );
    },
    importMesh,
    function( data, next ) {
        data.Heart = data.mesh;
        next( data );
    }
] );

var importCylinder = harness.wrap( [
    files.uploadCylinder,
    
    function( data, next ) {
        data.mesh_file_id = data.file_id;
        data.mesh_name = "cylinder";
        next( data );
    },
    importMesh,
    function( data, next ) {
        data.Cylinder = data.mesh;
        next( data );
    }
] );

var importElephant = harness.wrap( [
    files.uploadElephant,
    
    function( data, next ) {
        data.mesh_file_id = data.file_id;
        data.mesh_name = "elephant";
        next( data );
    },
    importMesh,
    function( data, next ) {
        data.Elephant = data.mesh;
        next( data );
    }
] );

var importTorus = harness.wrap( [
    files.uploadTorus,
    
    function( data, next ) {
        data.mesh_file_id = data.file_id;
        data.mesh_name = "torus";
        next( data );
    },
    importMesh,
    function( data, next ) {
        data.Torus = data.mesh;
        next( data );
    }
] );

var importChimney = harness.wrap( [
    files.uploadChimney,
    
    function( data, next ) {
        data.mesh_file_id = data.file_id;
        data.mesh_name = "Chimney";
        data.mesh_transform = [ [2, 0, 0, 0], [0, 2, 0, 0], [0, 0, 2, 0] ];
        next( data );
    },
    importMesh,
    function( data, next ) {
        data.Chimney = data.mesh;
        next( data );
    }
] );

var importHudTest = harness.wrap( [
    files.uploadHudTest,
    
    function( data, next ) {
        data.mesh_file_id = data.file_id;
        data.mesh_name = "HudTest";
        data.mesh_transform = [ [2, 0, 0, 0], [0, 2, 0, 0], [0, 0, 2, 0] ];
        next( data );
    },
    importMesh,
    function( data, next ) {
        data.HudTest = data.mesh;
        next( data );
    }
] );

var importBunny = harness.wrap( [
    files.uploadBunny,
    
    function( data, next ) {
        data.mesh_file_id = data.file_id;
        data.mesh_name = "CutUpBunny";
        next( data );
    },
    importMesh,
    function( data, next ) {
        data.Bunny = data.mesh;
        next( data );
    }
] );

var importCeaser = harness.wrap( [
    files.uploadCeaser,
    
    function( data, next ) {
        data.mesh_file_id = data.file_id;
        data.mesh_name = "Ceaser";
        data.mesh_transform = [ [2, 0, 0, 0], [0, 2, 0, 0], [0, 0, 2, 0] ];
        next( data );
    },
    importMesh,
    function( data, next ) {
        data.Ceaser = data.mesh;
        next( data );
    }
] );

module.exports = exports = {
    'validate' : validate,
    'importMesh' : importMesh,
    'importHeart' : importHeart,
    'importTorus' : importTorus,
    'importChimney' : importChimney,
    'importCylinder' : importCylinder,
    'importElephant' : importElephant,
    'importHudTest' : importHudTest,
    'importBunny' : importBunny,
    'importCeaser' : importCeaser,
};
