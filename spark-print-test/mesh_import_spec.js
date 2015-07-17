var frisby = require('frisby')
, config = require('./config.js')
, files = require('./files.js')
, tasks = require('./tasks.js')
, meshes = require('./meshes.js')
, harness = require('./harness.js')
;

require('jasmine-expect');

// Test what happens when no file_id is specified
harness.runTests( [
    function( data, next ) {
        frisby.create('import mesh without file_id')
        .post( config.URL + '/geom/meshes/import' )
        .expectStatus( 400 )
        .toss();
    } ] );

// Load a simple .stl binary file
harness.runTests( [
    meshes.importHeart,

    function( data, next ) {
        var geom = data.mesh.geom;
        expect(data.mesh.transform).toEqual([[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]]);
        expect(geom.num_vertices).toBe(562);
        expect(geom.num_triangles).toBe(1120);
        expect(geom.has_uvs).toBe(false);
    } ] );

// Load a simple .stl ASCII file
harness.runTests( [
    meshes.importChimney,

    function( data, next ) {
        var geom = data.mesh.geom;
        expect(data.mesh.transform).toEqual([[2, 0, 0, 0], [0, 2, 0, 0], [0, 0, 2, 0]]);
        expect(geom.num_vertices).toBe(49);
        expect(geom.num_triangles).toBe(94);
        expect(geom.has_uvs).toBe(false);
    } ] );

// Load a .obj file with texture coordinates
harness.runTests( [
    meshes.importHudTest,

    function( data, next ) {
        var geom = data.mesh.geom;
        expect(data.mesh.transform).toEqual([[2, 0, 0, 0], [0, 2, 0, 0], [0, 0, 2, 0]]);
        expect(geom.num_vertices).toBe(4);
        expect(geom.num_triangles).toBe(2);
        expect(geom.has_uvs).toBe(true);
    } ] );

// Load a .obj file without texture coordinates
harness.runTests( [
    meshes.importBunny,

    function( data, next ) {
        var geom = data.mesh.geom;
        expect(data.mesh.transform).toEqual([[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]]);
        expect(geom.num_vertices).toBe(3989);
        expect(geom.num_triangles).toBe(7410);
        expect(geom.has_uvs).toBe(false);
    } ] );

// Load zip with a .OBJ and associated .MTL/texture images (currently disabled)
/*harness.runTests( [
    meshes.importCeaser,

    function( data, next ) {
        var geom = data.mesh.geom;
        expect(data.mesh.transform).toEqual([[2, 0, 0, 0], [0, 2, 0, 0], [0, 0, 2, 0]]);
        expect(geom.num_vertices).toBe(15992);
        expect(geom.num_triangles).toBe(31050);
        expect(geom.has_uvs).toBe(true);
    } ] );*/ 
