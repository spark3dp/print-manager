var path = require('path'),
    should = require('should'),
    files = require('../files'),
    LocalFileUploader = require('../LocalFileUploader'),
    TestHelper = require('./helpers/TestHelper');

describe('LocalFileUploader', function () {
    it('should handle basic upload', function (done) {
        var json = {
                id_1: 'data/models/Chimney.stl',
                id_2: 'data/models/torus.obj',

                _files: ['id_1', 'id_2']
            },
            originalJSON = JSON.parse(JSON.stringify(json));

        LocalFileUploader.uploadFiles('./test/', json);

        json._files.forEach(function (id) {
            json[id].should.not.equal(originalJSON[id]);
            var f = files.find(json[id]);
            should.exist(f);
            TestHelper.filesSameSize(path.join(__dirname, originalJSON[id]), f.path).should.be.true;
            f.remove();
        });

        done();
    });

    it('should handle nested property names', function (done) {
        var json = {
                p1: {p2: {p3: {id: 'data/models/Chimney.stl'}}},
                _files: ['p1.p2.p3.id']
            },
            originalJSON = JSON.parse(JSON.stringify(json));

        LocalFileUploader.uploadFiles('./test/', json);

        json.p1.p2.p3.id.should.not.equal(originalJSON.p1.p2.p3.id);
        var f = files.find(json.p1.p2.p3.id);
        should.exist(f);
        TestHelper.filesSameSize(path.join(__dirname, originalJSON.p1.p2.p3.id), f.path).should.be.true;
        f.remove();

        done();
    });

    it('should handle duplicates', function (done) {
        var json = {
                p1: {p2: {id_1: 'data/models/Chimney.stl'}},
                id_2: 'data/models/Chimney.stl',
                _files: ['p1.p2.id_1', 'id_2']
            },
            originalJSON = JSON.parse(JSON.stringify(json));

        LocalFileUploader.uploadFiles('./test/', json);

        json.p1.p2.id_1.should.not.equal(originalJSON.p1.p2.id_1);
        json.id_2.should.not.equal(originalJSON.id_2);
        json.p1.p2.id_1.should.equal(json.id_2);

        var f = files.find(json.id_2);
        should.exist(f);
        TestHelper.filesSameSize(path.join(__dirname, originalJSON.id_2), f.path).should.be.true;
        f.remove();

        done();
    });

    it('should do nothing when source file not found', function (done) {
        var json = {
                id: 'data/file_not_found.stl',
                _files: ['id']
            },
            originalJSON = JSON.parse(JSON.stringify(json));

        LocalFileUploader.uploadFiles('./test/', json);

        json.id.should.equal(originalJSON.id);
        var f = files.find(json.id);
        should.not.exist(f);

        done();
    });

    it('should do nothing for properties not listed in _files', function (done) {
        var json = {
                id: 'data/models/torus.stl',
                _files: ['id']
            },
            originalJSON = JSON.parse(JSON.stringify(json));

        LocalFileUploader.uploadFiles('./test/', json);

        json.id.should.equal(originalJSON.id);
        var f = files.find(json.id);
        should.not.exist(f);

        done();
    });

    afterEach(function (done) {
        LocalFileUploader.reset();
        done();
    });
});
