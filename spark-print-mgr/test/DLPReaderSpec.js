var should = require('should'),
    fs = require('fs'),
    os = require('os'),
    path = require('path'),
    ProtoBuf = require('protobufjs'),
    DLPReader = require('../printableTranslation/DLPReader.js'),
    Promise = require('Promise'),
    util = require('util');

describe('DLPReader', function () {
    it('should read a valid file', function (done) {
        // Create a reader and add listeners for the header and slice messages.
        //
        var reader = new DLPReader();

        reader.on('header', function (header) {
            header.should.be.instanceof(DLPReader.Header);

            // After the header has been read, the methods should return the
            // correct values, corresponding to the header.
            //
            header.printer_type_id.should.equal(reader.getPrinterTypeId());
            header.image_height.should.equal(reader.getImageHeight());
            header.image_width.should.equal(reader.getImageWidth());
            header.num_slices.should.equal(reader.getSliceCount());
        });

        var slices = []
        var currentIndex = 0;
        reader.on('slice', function (data) {
            data.slice.should.be.instanceof(DLPReader.Slice);
            slices.push(data.slice);

            // Indices should be increasing.
            //
            currentIndex.should.equal(data.index);
            ++currentIndex;
        });

        // Begin the read.
        //
        reader.read(path.join(__dirname, 'data/printables/DLPPrintable.pb'))
            .then(function (sliceCount) {
                sliceCount.should.equal(reader.getSliceCount());

                // Verify the slices.
                //
                slices.length.should.equal(reader.getSliceCount());
                for (var i = 0; i < reader.getSliceCount(); ++i) {
                    var slice = slices[i];
                    slice.should.have.property('png_data').and.be.instanceof(ProtoBuf.ByteBuffer);
                }
                done();
            })
            .catch(function (err) {
                done(err);
            });
    });

    it('should not read an invalid file', function (done) {
        var reader = new DLPReader();
        reader.read(path.join(__dirname, 'data/models/torus.obj'))
            .then(function (res) {
                done(new Error('This test should have failed.'));
            })
            .catch(function (err) {
                err.message.should.equal('Not a valid printable file.');
                done();
            })
            .catch(function (err) {
                done(err);
            });
    })

    it('should read with different buffer sizes', function (done) {
        var filePath = path.join(__dirname, 'data/printables/DLPPrintable.pb');
        var sliceCount = 917 // Slice count for the file.
        var fileSize = fs.statSync(filePath).size;
        var bufferSizes = [1, 100, fileSize, fileSize + 1];

        var readRequests = []
        for (var i = 0; i < bufferSizes.length; ++i) {
            var reader = new DLPReader();
            readRequests.push(reader.read(filePath, {bufferSize: bufferSizes[i]}));
        }

        Promise.all(readRequests)
            .then(function (readResponses) {
                readResponses.length.should.equal(readRequests.length);
                for (var i = 0; i < readResponses.length; ++i) {
                    sliceCount.should.be.equal(readResponses[i]);
                }
                done();
            })
            .catch(function (err) {
                done(err);
            });
    });

    it('should fail with zero buffer size', function (done) {
        var filePath = path.join(__dirname, 'data/printables/DLPPrintable.pb');
        var reader = new DLPReader();
        reader.read(filePath, {bufferSize: 0})
            .then(function (sliceCount) {
                done(new Error('This test should have failed.'));
            })
            .catch(function (err) {
                err.message.should.equal('Invalid buffer size: 0');
                done();
            })
            .catch(function (err) {
                done(err);
            });
    });

    it('should fail with negative buffer size', function (done) {
        var filePath = path.join(__dirname, 'data/printables/DLPPrintable.pb');
        var reader = new DLPReader();
        reader.read(filePath, {bufferSize: -1})
            .then(function (sliceCount) {
                done(new Error('This test should have failed.'));
            })
            .catch(function (err) {
                err.message.should.equal('Invalid buffer size: -1');
                done();
            })
            .catch(function (err) {
                done(err);
            });
    });
});