var DLPTranslator = require('../../../printableTranslation/DLPTranslator'),
    util = require('util');

function DLPToJSONTranslator(printerType, printerProfile, material) {
    DLPTranslator.call(this, printerType, printerProfile, material);
    this.sliceCount = 0;
    this.output = {};
}
util.inherits(DLPToJSONTranslator, DLPTranslator);

DLPToJSONTranslator.canTranslate = function (printerType, profile, material) {
    return printerType && printerType.technology && printerType.technology === 'DLP';
};

DLPToJSONTranslator.prototype.onHeader = function (header) {
    header.should.have.property('printer_type_id').and.be.String;
    header.should.have.property('image_height').and.be.Number;
    header.should.have.property('image_width').and.be.Number;
    header.should.have.property('num_slices').and.be.Number;

    this.sliceCount = header.num_slices;
    var jsonHeader = {
        'printer_type_id': header.printer_type_id,
        'image_height': header.image_height,
        'image_width': header.image_width,
        'num_slices': header.num_slices,
    };

    this.output.header = jsonHeader;
};

DLPToJSONTranslator.prototype.onSlice = function (index, slice) {
    if (!this.output.slices) {
        this.output.slices = [];
    }
    this.output.slices.push({index: index, size: slice.png_data.buffer.length});

    var progress = (index + 1) / this.sliceCount;
    this.setProgress(progress);
};

DLPToJSONTranslator.prototype.endTranslation = function (outputFile) {
    fs.writeFileSync(outputFile, JSON.stringify(this.output));
};

module.exports = DLPToJSONTranslator;