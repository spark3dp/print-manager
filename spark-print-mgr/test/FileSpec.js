var should = require('should'),
    files  = require('../files'),
    LocalFileUploader = require('../LocalFileUploader'),
    TestHelper = require('./helpers/TestHelper');

describe('Files', function () {

    it('should fail to find nonexistent files.', function (done) {
        // Test finding a file that does not exists.
        var file = files.find("TestIdDoesNotExist");
        should.not.exist(file);

        done();
    });

    it('should find newly uploaded files together with the corresponding temp stored files on disk.', function (done) {

        var json = {
            id_1: 'data/models/Chimney.stl',
            id_2: 'data/models/torus.obj',

            _files: ['id_1', 'id_2']
        };

        LocalFileUploader.uploadFiles('./test/', json);

        // Test files that do exists
        json._files.forEach(function (id) {
            var file = files.find(json[id]);
            should.exist(file);
            TestHelper.fileExists(file.path).should.be.true;
        });

        done();
    });

    it('should remove newly uploaded files and their corresponding temp files stored on disk.', function (done) {

        var json = {
            id_1: 'data/models/Chimney.stl',
            id_2: 'data/models/torus.obj',

            _files: ['id_1', 'id_2']
        };

        LocalFileUploader.uploadFiles('./test/', json);

        // Test files that do exists
        json._files.forEach(function (id) {
            var file = files.find(json[id]);
            should.exist(file);
            TestHelper.fileExists(file.path).should.be.true;

            file.remove();

            // File should have been deleted from disk.
            TestHelper.fileExists(file.path).should.be.false;

            // Try getting it again (it should not exisit)
            file = files.find(json[id]);
            should.not.exist(file);
        });

        done();
    });

    it('should prune all the files and their correspoding temp files stored on disk.', function (done) {

        var json = {
            id_1: 'data/models/Chimney.stl',
            id_2: 'data/models/torus.obj',

            _files: ['id_1', 'id_2']
        };

        LocalFileUploader.uploadFiles('./test/', json);

        // Test files that do exists
        paths = {};
        json._files.forEach(function (id) {
            var file = files.find(json[id]);
            should.exist(file);
            TestHelper.fileExists(file.path).should.be.true;

            // Save the path.
            paths[json[id]] = file.path;
        });

        files.prune();

        json._files.forEach(function (id) {
            var file = files.find(json[id]);
            should.not.exist(file);
            TestHelper.fileExists( paths[json[id]]).should.be.false;
        });

        done();
    });

    afterEach(function (done) {
        LocalFileUploader.reset();
        files.prune();
        done();
    });
});