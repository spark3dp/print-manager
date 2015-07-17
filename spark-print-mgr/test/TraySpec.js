var should = require('should'),
    files  = require('../files'),
    meshes = require('../meshes'),
    trays  = require('../trays'),
    LocalFileUploader = require('../LocalFileUploader');

describe('Trays', function () {


    function createTrays()
    {
        var json = {
            id_1: 'data/models/Chimney.stl',
            id_2: 'data/models/torus.obj',
            id_3: 'data/models/HudTest.obj',

            _files: ['id_1', 'id_2', 'id_3']
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

        // Create trays.
        var testTrays = {};
        for (var meshId in testMeshes)
        {
            var mesh = testMeshes[meshId];
            var meshListJSON = [ mesh.asJSON()];
            var data = {
                'meshes' : meshListJSON
            }
            var tray = new trays.Tray( data );
            tray.addChild(mesh);

            testTrays[tray.getID()] = tray;
        }

        return { 'meshes' : testMeshes, 'trays' : testTrays };
    }

    it('should fail to find nonexistent tray.', function (done) {
        // Test finding a tray that does not exists.
        var tray = trays.find("OO131");
        should.not.exist(tray);

        done();
    });

    it('should find newly created trays.', function (done) {

        var result = createTrays();

        var testTrays  = result['trays'];
        var testMeshes = result['meshes'];

        for (var trayId in testTrays)
        {
            var tray = trays.find( trayId );
            should.exist(tray);
            tray.getID().should.be.equal( trayId );
            tray.getRefCount().should.be.eql(0);

            var createdTray = testTrays[trayId];
            tray.should.equal( createdTray );
        }

        done();
    });

    it('should prune trays and release corresponding meshes.', function (done) {

        var result = createTrays();

        var testTrays  = result['trays'];
        var testMeshes = result['meshes'];

        // Confirm that before prune, each mesh referenced by a tray has refcount == 1
        for (var meshId in testMeshes)
        {
            var mesh = testMeshes[meshId];
            mesh.getRefCount().should.equal(1);
        }

        // Confirm that all trays exist.
        for (var trayId in testTrays)
        {
            var tray = trays.find( trayId );
            should.exist(tray);
        }

        // Prune
        trays.prune();

        // Confirm that all trays are deleted.
        for (var trayId in testTrays)
        {
            var tray = trays.find( trayId );
            should.not.exist(tray);
        }

        // Confirm that all meshes got released.
        for (var meshId in testMeshes)
        {
            var mesh = testMeshes[meshId];
            mesh.getRefCount().should.equal(0);
        }

        done();
    });

    afterEach(function (done) {
        LocalFileUploader.reset();
        trays.prune();
        meshes.prune();
        files.prune();
        done();
    });
});