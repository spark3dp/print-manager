var events = require('events'),
    fs = require('fs'),
    path = require('path'),
    ProtoBuf = require('protobufjs'),
    Promise = require('promise'),
    util = require('util');

function PrintableReader(markerByte) {
    events.EventEmitter.call(this);
    this.markerByte = markerByte;

    this.streamEnded = false;
    this.savedBytes = null;
}
util.inherits(PrintableReader, events.EventEmitter);

// Reads 'size' number of bytes from the given stream.
//
PrintableReader.prototype.readBytesFromStream = function (stream, size) {
    var self = this;
    return new Promise(function (resolve, reject) {
        var bytesToReadCount = self.streamEnded ? Math.min(size, stream._readableState.length) : size;

        var bytes;
        if (bytesToReadCount > 0) {
            bytes = stream.read(bytesToReadCount);
        } else {
            bytes = new Buffer(0);
        }

        // Prefix the saved bytes if they exist.
        //
        if (self.savedBytes) {
            bytes = Buffer.concat([self.savedBytes, bytes]);
        }

        // If successful, return the bytes.  If not, this means
        // the stream does not have enough bytes in the buffer.  Wait
        // until it's readable, and try again.
        //
        if (bytes) {
            resolve(bytes);
        } else {
            stream.once('readable', function () {
                self.readBytesFromStream(stream, size)
                    .then(resolve)
                    .catch(reject);
            });
        }
    });
};

PrintableReader.prototype.readNextMessageSize = function (stream) {
    var self = this;

    // Read the max number of bytes that a varint32 can have, then
    // return the unused bytes into the stream.
    //
    return self.readBytesFromStream(stream, ProtoBuf.ByteBuffer.MAX_VARINT32_BYTES)
        .then(function (bytes) {
            var byteBuffer = ProtoBuf.ByteBuffer.wrap(bytes, 'binary', false);
            var result = byteBuffer.readVarint32(byteBuffer.offset);

            // Can't unshift back if the stream has ended, so save the bytes manually.
            //
            if (!self.streamEnded) {
                stream.unshift(byteBuffer.slice(result.length).toBuffer());
            } else {
                self.savedBytes = byteBuffer.slice(result.length).toBuffer();
            }
            return result.value;
        });
};

PrintableReader.prototype.readMessage = function (stream, messageProto) {
    var self = this;
    return self.readNextMessageSize(stream)
        .then(function (size) {
            return self.readBytesFromStream(stream, size);
        })
        .then(function (bytes) {
            return messageProto.decode(bytes, 'binary', false);
        });
};

PrintableReader.prototype.read = function (filePath, options) {
    var self = this;

    return new Promise(function (resolve, reject) {
        var streamOptions = {};

        // Use the requested buffer size if provided.
        //
        if (options && options.hasOwnProperty('bufferSize')) {
            if (options.bufferSize <= 0) {
                reject(new Error('Invalid buffer size: ' + options.bufferSize));
                return;
            }
            streamOptions.highWaterMark = options.bufferSize;
        }

        var stream = fs.createReadStream(filePath, streamOptions);
        stream.once('end', function () {
            self.streamEnded = true;
        })
        stream.once('readable', function () {
            // Read the first four bytes of the stream to verify that this
            // is a valid file.
            //
            self.readBytesFromStream(stream, 4)
                .then(function (bytes) {
                    var buffer = ProtoBuf.ByteBuffer.wrap(bytes, 'binary', true);
                    if (buffer.readUint32() !== self.markerByte) {
                        reject(new Error('Not a valid printable file.'));
                        return;
                    }

                    resolve(stream);
                })
                .catch(function (err) {
                    reject(err);
                });
        });
    });
};

module.exports = PrintableReader;

