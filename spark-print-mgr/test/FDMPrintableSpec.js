var should = require('should'),
    fs = require('fs'),
    os = require('os'),
    path = require('path'),
    ProtoBuf = require('protobufjs'),
    FDMReader = require('../printableTranslation/FDMReader.js'),
    FDMTranslator = require('../printableTranslation/FDMTranslator.js'),
    Promise = require('Promise'),
    TestHelper = require('./helpers/TestHelper'),
    util = require('util');

describe('FDMReader', function () {
    it('should read a valid file', function (done) {
        // Create a reader and add listeners for the header and command messages.
        //
        var reader = new FDMReader();

        reader.on('header', function (header) {
            header.should.be.instanceof(FDMReader.Header);
            // After the header has been read, the methods should return the
            // correct values, corresponding to the header.
            //
            header.printer_type_id.should.equal(reader.getPrinterTypeId());

        });

        var commands = [];
        reader.on('command', function (command) {
            command.should.be.instanceof(FDMReader.Command);
            commands.push(command);
        });

        // Begin the read.
        //
        var filePath = path.join(__dirname, 'data/printables/FDMPrintable.mic');
        var fileSize = fs.statSync(filePath).size;
        reader.read(filePath)
            .then(function (commandCount) {
                commandCount.should.equal(commands.length);

                for (var i = 0; i < commands.length; ++i) {
                    var command = commands[i];
                    // Check the command for the correct properties and value types.
                    //
                    command.should.have.property('type').and.be.Number;
                    command.should.have.property('x').and.be.Array;
                    if(command.x.length > 0) command.x[0].should.be.Number;
                    command.should.have.property('y').and.be.Array;
                    if(command.y.length > 0) command.y[0].should.be.Number;
                    command.should.have.property('z').and.be.Array;
                    if(command.z.length > 0) command.z[0].should.be.Number;
                    command.should.have.property('e').and.be.Array;
                    if(command.e.length > 0) command.e[0].should.be.Number;
                    command.should.have.property('f').and.be.Array;
                    if(command.f.length > 0) command.f[0].should.be.Number;
                    command.should.have.property('nozzle_temp').and.be.Number;
                    command.should.have.property('bed_temp').and.be.Number;
                    command.should.have.property('fan_speed').and.be.Number;
                    command.should.have.property('pause_time').and.be.Number;
                    command.should.have.property('comment').and.be.String;
                    command.should.have.property('units').and.be.Number;
                    command.should.have.property('mode').and.be.Number;
                    command.should.have.property('wait').and.be.Boolean;
                    command.should.have.property('custom').and.be.String;
                    command.should.have.property('progress').and.be.Number;
                    command.should.have.property('estimated_print_time').and.be.Number;
                    command.should.have.property('estimated_material_length').and.be.Number;
                }

                // The last message should be of type END_OF_COMMANDS.
                //
                commands[commands.length - 1].type.should.equal(FDMReader.Command.CommandType.END_OF_COMMANDS);
                done();
            })
            .catch(function (err) {
                done(err);
            });
    });

    it('should not read an invalid file', function (done) {
        var reader = new FDMReader();
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
    });

    it('should read with different buffer sizes', function (done) {
        this.timeout(5000);
        var filePath = path.join(__dirname, 'data/printables/FDMPrintable.mic');
        var fileSize = fs.statSync(filePath).size;
        var bufferSizes = [1, 100, fileSize, fileSize + 1];
        var expectedCommandCount = 1690;

        var readRequests = [];
        for (var i = 0; i < bufferSizes.length; ++i) {
            var reader = new FDMReader();
            readRequests.push(reader.read(filePath, {bufferSize: bufferSizes[i]}));
        }

        Promise.all(readRequests)
            .then(function (readResponses) {
                readResponses.length.should.equal(readRequests.length);
                for (var i = 0; i < readResponses.length; ++i) {
                    readResponses[i].should.equal(expectedCommandCount);
                }
                done();
            })
            .catch(function (err) {
                done(err);
            });
    });

    it('should fail with zero buffer size', function (done) {
        var filePath = path.join(__dirname, 'data/printables/FDMPrintable.mic');
        var reader = new FDMReader();
        reader.read(filePath, {bufferSize: 0})
            .then(function (commandCount) {
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
        var filePath = path.join(__dirname, 'data/printables/FDMPrintable.mic');
        var reader = new FDMReader();
        reader.read(filePath, {bufferSize: -1})
            .then(function (commandCount) {
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

describe('FDMTranslator', function () {
    // Derive a basic FDM to JSON translator for testing that the onHeader, onCommand,
    // and writeToFile methods are called at the right times.
    //
    function FDMToJSONTranslator(printerType, printerProfile, material) {
        FDMTranslator.call(this, printerType, printerProfile, material);
        this.output = {};
    }

    util.inherits(FDMToJSONTranslator, FDMTranslator);

    FDMToJSONTranslator.prototype.onHeader = function (header) {
        header.should.have.property('printer_type_id').and.be.String;

        this.commandCount = header.num_commands;
        var jsonHeader = {
            'printer_type_id': header.printer_type_id,
            'profile_id': header.profile_id,
        };

        this.output.header = jsonHeader;
    };

    FDMToJSONTranslator.prototype.onCommand = function (command) {
        command.should.be.instanceof(FDMReader.Command);
        if (!this.output.commands) {
            this.output.commands = [];
        }
        this.output.commands.push({
            type : command.type,
            x : command.x,
            y : command.y,
            z : command.z,
            e : command.e,
            f : command.f,
            nozzle_temp : command.nozzle_temp,
            bed_temp : command.bed_temp,
            fan_speed : command.fan_speed,
            pause_time : command.pause_time,
            comment : command.comment,
            units : command.units,
            mode : command.mode,
            wait : command.wait,
            custom : command.custom,
            progress : command.progress,
            estimated_print_time : command.estimated_print_time,
            estimated_material_length : command.estimated_material_length
        });
    };

    FDMToJSONTranslator.prototype.endTranslation = function (outputFile) {
        var self = this;
        return new Promise(function(resolve, reject) {
            fs.writeFile(outputFile, JSON.stringify(self.output), function(err) {
                if(err) {
                    reject(err);
                    return;
                }
                resolve();
            });
        });
    };

    it('should translate a valid FDM file', function (done) {
        var translator = new FDMToJSONTranslator(thePrinterType, thePrinterProfile, theMaterial);
        translator.getPrinterType().should.eql(thePrinterType);
        translator.getMaterial().should.eql(theMaterial);

        var inputFile = path.join(__dirname, 'data/printables/FDMPrintable.mic');
        var outputFile = path.join(os.tmpdir(), 'FDMPrintable.json');
        translator.translate(inputFile, outputFile)
            .then(function () {
                TestHelper.fileExists(outputFile);
                done();
            })
            .catch(function (err) {
                done(err);
            });
    });
});

var thePrinterType = { id: '3F64F6EC-A1DF-44AB-A22E-58C036F2F474',
    version: 1,
    name: 'Idea Builder',
    manufacturer: 'Dremel 3D',
    registration_url: null,
    model_number: '1.0.0',
    icon_id: '6177e2c6-e3d6-4ec9-b3d6-c2871432589d',
    icon50x50_id: 'f87a8588-f78b-422b-a1e5-1fd63de8f206',
    icon100x100_id: 'b21208b4-b561-4e08-a311-d96b1e5910c3',
    technology: 'FDM',
    default_material_id: 'FB67831E-BB63-4C76-BC00-8D84F8F44CB9',
    default_profile_id: 'CF313AC0-FDE6-467A-9E8B-797F0F35E6A3',
    firmware: { type: 'dremel', version: '1.0.0' },
    build_volume: { type: 'Cartesian',
        home_position: [ 0, 0, 0 ],
        park_position: [ 11.5, 7.5, 14 ],
        bed_size: [ 23, 15, 14 ],
        bed_offset: [ -11.5, -7.5, 0 ],
        bed_file_id: 'b3a3393a-e54e-4b62-aba4-ff360a8ed0e6' },
    max_materials: 1,
    printable: { content: 'application/drm3d',
        thumbnail: 'image/png',
        extension: 'g3drem',
        generates_supports: false,
        packager_data: { icon_file_id: '81b6b5c1-d432-4d1f-8d5b-158ec193a231' } },
    supported_connections: [
        { type: 'usb', protocol: 'usb.dremel' }
    ],
    preferred_connection: 'usb',
    software_info: { name: 'Dremel3D', url: 'https://3dprinter.dremel.com' },
    printer_capabilities: { num_extruders: 1,
        nozzle_temp_max: 300,
        nozzle_max_volume_per_sec: 300,
        nozzle_diameter: 0.04,
        nozzle_offset: [ 0, 0, 0 ],
        nozzle_retraction_length: 0.1,
        nozzle_lift_z: 0.05,
        nozzle_extra_length_on_restart: 0.15,
        e_speed_max: 2,
        nozzle_min_travel_on_retraction: 0.1,
        bed_temp_max: 0,
        xy_speed_max: 20,
        z_speed_max: 0.01,
        travel_feed_rate: 10,
        z_axis_feed_rate: 3 },
    _files: [ 'icon_id',
        'icon50x50_id',
        'icon100x100_id',
        'build_volume.bed_file_id',
        'printable.packager_data.icon_file_id' ] };

var thePrinterProfile = { id: 'CF313AC0-FDE6-467A-9E8B-797F0F35E6A3',
    name: 'Dremel, Standard',
    layer_height: 0.02,
    layer_height_first: 0.03,
    num_bottom_shells: 3,
    num_top_shells: 3,
    num_perimeters: 2,
    speed_first_layer_multiplier: 0.5,
    speed_perimeters_external: 4,
    speed_perimeters_internal: 7,
    speed_solid_infill: 4,
    speed_sparse_infill: 8,
    speed_support_material: 7,
    speed_travel: 10,
    speed_extrude_minimum: 1.5,
    solid_infill_angle: 0.785398163,
    solid_infill_overlap_distance: 0.2,
    solid_infill_pattern: 'Rectilinear',
    sparse_infill_angle: 0.785398163,
    sparse_infill_density: 15,
    sparse_infill_pattern: 'Rectilinear',
    extrusion_width_first_layer_multiplier: 1,
    extrusion_width_multiplier: 1,
    perimeters_inner_first: true,
    connect_fill_wet_move: true,
    cross_solid_fill_dry_move: true,
    cross_sparse_fill_leaky_move: true,
    always_retract_between_layers: true,
    disable_fan_first_layers: 1,
    min_layer_time: 5,
    raft_zbump: 0.03,
    bridging_enabled: true,
    speed_bridge: 3,
    prime_enabled: true,
    end_gcode: '',
    extrusion_width: 0.04,
    extrusion_width_first_layer: 0.04,
    extrusion_width_perimeters: 0.04,
    extrusion_width_solid_infill: 0.04,
    extrusion_width_sparse_infill: 0.04,
    extrusion_width_support_material: 0.04,
    layer_change_gcode: '',
    min_fill_length: 0.01,
    perimeter_overlap_ratio: 0.0875,
    printer_types: [ '3F64F6EC-A1DF-44AB-A22E-58C036F2F474' ],
    raft_base_angle: 0,
    raft_base_density: 70,
    raft_base_extrusion_width: 0.25,
    raft_base_layer_height: 0.03,
    raft_base_num_layers: 1,
    raft_base_num_perimeters: 0,
    raft_enabled: false,
    raft_interface_angle: 0.785398163,
    raft_interface_density: 30,
    raft_interface_extrusion_width: 0.04,
    raft_interface_layer_height: 0.02,
    raft_interface_num_layers: 1,
    raft_interface_num_perimeters: 0,
    raft_outer_border: 0.5,
    raft_surface_angle: 0,
    raft_surface_density: 100,
    raft_surface_extrusion_width: 0.04,
    raft_surface_layer_height: 0.03,
    raft_surface_num_layers: 2,
    raft_surface_num_perimeters: 2,
    skirt_distance: 0.5,
    skirt_layers: 1,
    skirt_loops: 2,
    skirt_minimum_extrusion_length: 0,
    start_gcode: '',
    support_angle_tol: 0.785398163,
    support_max_angle: 0.785398163,
    support_contact_tol: 0,
    support_infill_angle: 0.785398163,
    support_infill_density: 15,
    support_infill_pattern: 'Rectilinear',
    support_base_length: 0.2,
    support_base_radius: 0.35,
    support_post_radius: 0.17,
    support_clearance: 0.0875,
    support_tip_length: 0.34,
    support_tip_radius: 0.04,
    support_tip_penetration_distance: 0,
    support_object_top_connections: 1,
    support_sampling_density: 0.6,
    support_layer_height: 0.1,
    support_bed_standoff: 0,
    technology: 'FDM',
    support_horizontal_connection_size: 0,
    verbose_gcode: true,
    version: 2 };

var theMaterial = { id: 'FB67831E-BB63-4C76-BC00-8D84F8F44CB9',
    name: 'PLA 1.75 mm',
    technology: 'FDM',
    version: 1,
    composition: 'PLA',
    printer_types: [ 'F2F4B9B6-1D54-4A16-883E-B0385F27380C',
        '3F64F6EC-A1DF-44AB-A22E-58C036F2F474',
        'F2F4B9B6-1D54-4A16-883E-B0385F27380D',
        '367012CF-2533-44C7-AD11-9FCD1ED9F2FC' ],
    manufacturer: 'unspecified',
    website: 'unspecified',
    color: 'fffef8',
    opacity: 1,
    tags: [],
    pct_shrink: 0.25,
    is_user: false,
    filament_diameter: 0.175,
    filament_extrusion_to_flow_multiplier: 1,
    temp_extrude_default: 220,
    temp_min_extrude: 175,
    temp_max_extrude: 230,
    temp_bed: 60,
    min_nozzle_diameter: 0,
    extruder_fan_speed: 255,
    cost: 40,
    rating: 5 };