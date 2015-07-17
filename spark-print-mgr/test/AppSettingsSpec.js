var should = require('should'),
    fs = require('fs');
    appSettings = require('../config').appSettings,
    files = require('../files.js'),
    config = require('../config').config,
    LocalFileUploader = require('../LocalFileUploader'),
    TestHelper = require('./helpers/TestHelper');


describe('appSettings', function () {

    it('should initialize and create PrintManager temp date direcotry.', function (done) {
        should.exist(appSettings.APP_DATA_FOLDER);
        fs.stat(appSettings.APP_DATA_FOLDER, function (er, s) {
            should.not.exist(er);
            s.isDirectory().should.be.true;
        });
        done();
    });

    it('should initialize and create PrintManager/files temp date direcotry.', function (done) {
        should.exist(appSettings.APP_FILES_FOLDER);
        fs.stat(appSettings.APP_FILES_FOLDER, function (er, s) {
            should.not.exist(er);
            s.isDirectory().should.be.true;
        });
        done();
    });

    it('should initialize and create PrintManager/db temp date direcotry.', function (done) {
        should.exist(appSettings.APP_DB_FOLDER);
        fs.stat(appSettings.APP_DB_FOLDER, function (er, s) {
            should.not.exist(er);
            s.isDirectory().should.be.true;
        });
        done();
    });

    it('should set the log file name to a string with a valid file name', function (done) {
        var loggerOptions = config.logger_options;
        should.exist(loggerOptions);
        should.exist(loggerOptions['log_file_name']);
        done();
    });

    it('should set the log file location to PrintManager temp directory', function (done) {
        var loggerOptions = config.logger_options;
        should.exist(loggerOptions);
        should.exist(loggerOptions['log_file_location']);
        fs.stat(loggerOptions['log_file_location'], function (er, s) {
            should.not.exist(er);
            s.isDirectory().should.be.true;
        });
        done();
    });

    it('should deleteAppDataFiles() from the PrintManager/files directory.', function (done) {

        // Upload some files - it will create temp files in PrintManager app date dir: appSettings.APP_FILES_FOLDER
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

        appSettings.deleteAppDataFiles();

        // All the temp files on disk should be gone.
        json._files.forEach(function (id) {
            var file = files.find(json[id]);
            should.exist(file);
            TestHelper.fileExists(file.path).should.be.false;
        });
        done();
    });

});
