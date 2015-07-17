var should = require('should'),
    meshes = require('../meshes'),
    files  = require('../files'),
    LocalFileUploader = require('../LocalFileUploader');

describe('Meshes', function () {

    function createMeshes()
    {
        var json = {
            id_1: 'data/models/Chimney.stl',
            id_2: 'data/models/torus.obj',

            _files: ['id_1', 'id_2']
        };

        LocalFileUploader.uploadFiles('./test/', json);

        // Create meshes.
        var testMeshes = {};
        json._files.forEach(function (id) {
            var file = files.find(json[id]);

            // Create a mesh.
            var mesh = new meshes.Mesh( file, {} );
            testMeshes[mesh.getID()] = mesh;
        });

        return { 'json' : json, 'meshes' : testMeshes };
    }

    it('should create meshes with reference count equal to zero.', function (done) {

        var result = createMeshes();

        var json       = result['json'];
        var testMeshes = result['meshes'];

        // Test files.
        json._files.forEach(function (id) {
            var file = files.find(json[id]);
            should.exist(file);
            file.getRefCount().should.be.eql(1);
        });

        for (var meshId in testMeshes)
        {
            var mesh = testMeshes[meshId];
            mesh.getID().should.be.equal( meshId );
            mesh.getRefCount().should.be.eql(0);
        }

        done();
    });

    it('should fail to find nonexistent mesh.', function (done) {

        // Test finding a mesh that does not exists.
        var mesh = meshes.find("TestIdDoesNotExist");
        should.not.exist(mesh);

        done();
    });

    it ('should find newly created meshes.', function (done) {

        var result = createMeshes();

        var json       = result['json'];
        var testMeshes = result['meshes'];

        for (var meshId in testMeshes)
        {
            if (testMeshes.hasOwnProperty(meshId)) {
                var mesh = meshes.find(meshId);
                should.exist(mesh);
                mesh.getID().should.be.equal(meshId);
                mesh.getRefCount().should.be.eql(0);
            }
        }

        done();
    });

    it ('should prune newly created meshes.', function (done) {

        var result = createMeshes();

        var json       = result['json'];
        var testMeshes = result['meshes'];

        for (var meshId in testMeshes)
        {
            var mesh = meshes.find(meshId);
            should.exist(mesh);
        }

        // Before prune, files should have ref count equal to 1.
        json._files.forEach(function (id) {
            var file = files.find(json[id]);
            file.getRefCount().should.be.eql(1);
        });

        // Now, prune the meshes.
        meshes.prune();

        for (var meshId in testMeshes)
        {
            var mesh = meshes.find(meshId);
            should.not.exist(mesh);
        }

        // After prune, files should have ref count equal to 0.
        json._files.forEach(function (id) {
            var file = files.find(json[id]);
            file.getRefCount().should.be.eql(0);
        });

        done();
    });

    afterEach(function (done) {
        LocalFileUploader.reset();

        meshes.prune();
        files.prune();

        done();
    });
});