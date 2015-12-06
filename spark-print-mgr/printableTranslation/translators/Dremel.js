var FDMTranslatorMarlin = require('../FDMTranslatorMarlin'),
	util = require('util'),
    path = require('path'),
    Promise = require('promise'),
    fs = require('fs');

DremelTranslator = function(printerType, printerProfile, material, config) {
    FDMTranslatorMarlin.call(this, printerType, printerProfile, material, config);
    this.jobName = "Spark";
    this.estimated_print_time = 0;
    this.estimated_material_length = 0;
    this.defaultVerbose = false;
};

util.inherits(DremelTranslator, FDMTranslatorMarlin);

DremelTranslator.canTranslate = function (printerType, profile, material) {
    return printerType.id === "3F64F6EC-A1DF-44AB-A22E-58C036F2F474";
};

function createG3dremHeader(bmpLength, timeEstSec, materialLenMm) {
    var magic = "g3drem 1.0      "; // 16 characters
    var byteIndex = 0;

    // write the 16 byte magic number
    var buf = new Buffer(58);
    for (var i=0; i<16; i++) {
        buf.writeUInt8(magic.charCodeAt(i), byteIndex);
        byteIndex += 1;
    }

    // write img0Addr to output file - unsigned int - 58 bytes to the image
    var img0Addr = 58;
    buf.writeUInt32LE(img0Addr, byteIndex);
    byteIndex += 4;

    // write img1Addr to output file - unsigned int
    var img1Addr = 0;
    buf.writeUInt32LE(img1Addr, byteIndex);
    byteIndex += 4;

    // write gcodeAddr - unsigned int - this many bytes to the Gcode
    var gcodeAddr = img0Addr + bmpLength;
    buf.writeUInt32LE(gcodeAddr, byteIndex);
    byteIndex += 4;

    // write timeEstimate - unsigned int
    var timeEstimate = parseInt(timeEstSec); // this is in seconds, test 4 hours
    buf.writeUInt32LE(timeEstimate, byteIndex);
    byteIndex += 4;

    // write materialsUsed Tool0 - unsigned int
    var materialUsed0 = parseInt(materialLenMm); // millimeters
    buf.writeUInt32LE(materialUsed0, byteIndex);
    byteIndex += 4;

    // write materialsUsed Tool1 - unsigned int
    var materialUsed1 = 0; // millimeters - not used
    buf.writeUInt32LE(materialUsed1, byteIndex);
    byteIndex += 4;

    // write flags - unsigned short
    var flags = 0; // not currently used
    buf.writeUInt16LE(flags, byteIndex);
    byteIndex += 2;

    // write layerHeight in microns - unsigned short
    var layerHeightMicrons = 0; // not currently used
    buf.writeUInt16LE(layerHeightMicrons, byteIndex);
    byteIndex += 2;

    // write infill  - unsigned short
    var infill = 0;// percent - not currently used
    buf.writeUInt16LE(infill, byteIndex);
    byteIndex += 2;

    // write shellCount  - unsigned short
    var shellCount = 0; // not currently used
    buf.writeUInt16LE(shellCount, byteIndex);
    byteIndex += 2;

    // write speed - short
    var speedMmSec = 0; // not currently used
    buf.writeUInt16LE(speedMmSec, byteIndex);
    byteIndex += 2;

    // write platformTemp - unsigned short
    var platformTemp = 0; // not currently used
    buf.writeUInt16LE(platformTemp, byteIndex);
    byteIndex += 2;

    // write extruderTemp0 - unsigned short
    var extruderTemp0 = 0; // not currently used
    buf.writeUInt16LE(extruderTemp0, byteIndex);
    byteIndex += 2;

    // write extruderTemp1 - unsigned short
    var extruderTemp1 = 0; // not currently used
    buf.writeUInt16LE(extruderTemp1, byteIndex);
    byteIndex += 2;

    // write material type0 - unsigned char
    var materialType0 = 0;    // not currently used
    buf.writeUInt8(materialType0, byteIndex);
    byteIndex += 1;

    // write material type1  - unsigned char
    var materialType1 = 0; // not currently used
    buf.writeUInt8(materialType1, byteIndex);
    byteIndex += 1;

    return buf;
}

/**
 * Create a nozzle temperature command
 * If "wait" flag to wait for temp else set command and move on
 *
 * @param {Object} command
 * @returns {string} line
 */
DremelTranslator.prototype.convertSetTempNozzle = function(command) {
    // string line = "M104 S" + numToString( fdmPBCommand.nozzle_temp(), 0 ) + " T0 M6 T0";
    var line = "";
    line += "M104 S" + this.numToString(command.nozzle_temp, this.precision.s) + " T0";
    if(command.wait) {
        line += "\r\nM6 T0";
    }
    return this.postProcessLine(command, line);
};

/**
 * Create a bed temperature command
 * If "wait" flag to wait for temp else set command and move on
 *
 * @param {Object} command
 * @returns {string} line
 */
DremelTranslator.prototype.convertSetTempBed = function(command) {
    // string line = "M140 S", numToString( fdmPBCommand.bed_temp(), 0 );
    var line = "M140 S";
    line += this.numToString(command.bed_temp, this.precision.s);
    return this.postProcessLine(command, line);
};

/**
 * Process the estimates command
 * locally stores the values of the print time and material length for use in the Dremelg3drem binary header.
 * @param {Object} command
 * @returns {string} line
 */
DremelTranslator.prototype.convertEstimates = function(command) {
    this.estimated_print_time = command.estimated_print_time;
    this.estimated_material_length = command.estimated_material_length;
    return "";
};

DremelTranslator.prototype.endTranslation = function(outputPath) {
    var gcode = this.theFile;
    var estimatedPrintTime =  this.estimated_print_time;
    var estimatedMaterialLength = this.estimated_material_length;
    return new Promise(function (resolve, reject) {
            var bitmapFilename = path.join(__dirname, '../../../spark-print-data/data/DremelPrintableIcon.bmp');
            fs.readFile(bitmapFilename, function (err, result) {
                if (err) {
                    return reject(err);
                }
                var bmp = result;
                var header = createG3dremHeader(bmp.length, estimatedPrintTime, estimatedMaterialLength);
                var gcodeBuffer = new Buffer(gcode);
                var g3drem = Buffer.concat([header, bmp, gcodeBuffer]);
                fs.writeFileSync(outputPath, g3drem);

                resolve();
            });
    });
};

/**
 * Process a line
 * Adds a line break for each gcode line
 *
 * @param {Object} command
 * @returns {string} line
 */
DremelTranslator.prototype.postProcessLine = function(command, line) {
    if (line.length > 0) {
        line += "\r\n";
    }
    return line;
};

module.exports = DremelTranslator;
