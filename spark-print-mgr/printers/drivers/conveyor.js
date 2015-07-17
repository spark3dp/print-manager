var _ = require('underscore'),
    util = require('util'),
    fs = require('fs-extra'),
    events = require('events'),
    path = require('path'),
    RPC = require('./rpc'),
    net = require('net'),
    EventEmitter = require('events').EventEmitter,
    DriverBase = require('./drivers/driverBase'),
    DriverResponse = require('./driverResponse'),
    Promise = require("node-promise").Promise,
    when = require("node-promise").when,
    Status = require('./status'),
    JobStatus = require('./jobStatus'),
    os = require('os'),
    uuid = require('node-uuid'),
    Command = require('./command'),
    logger = require('../logging/PrintManagerLogger')

var SocketWrapper = function (socket){
    EventEmitter.call(this);
    this.socket = socket;
    var that = this;
    socket.on('data', function (data) {
        that.emit('message', data);
    });
    socket.on('close', function (){
        logger.info('wrapper received close');
        this.emit('exit');
    });
};

util.inherits(SocketWrapper, EventEmitter);

SocketWrapper.prototype.send = function(data) {
    this.socket.write(data);
};

var Conveyor = function(data) {
    DriverBase.call(this); // superclass constructor
    logger.info('conveyor driver');
    this.deviceData = data;
    this.setState(Status.State.CONNECTING);
    this.tempGCodes = [];
    this.print_progress = 0;
    this.connect();
};

// Derive from DriverBase
util.inherits(Conveyor, DriverBase);

Conveyor.prototype.connect = function() {
    logger.info('starting conveyor driver');
    var socket = new net.Socket();
    socket.setEncoding('utf8');
    socket.on('close', function () {
        logger.info('could not connect to conveyor, connection closed');
    });
    socket.on('error', function (e) {
        logger.info('could not connect to conveyor, error =', e);
    });

    try {
        var platform = os.platform();
        var address;
        if ( platform == "darwin" || platform == "linux") {
            address = '/var/tmp/conveyord.socket';
        } else {
            address = 9999;
        }
        socket.connect(address, _.bind(this.init, this));
        this.socket = socket;
    } catch (e) {
        logger.info('could not connect to conveyor, error =', e);
    }
};

Conveyor.prototype.init = function() {
    var that = this;

    this.setState(Status.State.CONNECTED);
    this.client = new SocketWrapper(this.socket);
    this.rpc = new RPC.Client(this.client, 'conveyor');
    this.rpc.on('notify', _.bind(this.onNotification, this));
    logger.info('initiating handshake; invoking hello on conveyor... waiting');

    this.rpc.invoke('hello', { username : 'ram'})
        .then(function (reply) {
            logger.info('in Coveyor. reply from conveyor for method hello "', reply);
            if (reply ==='world') {
                logger.info('conveyor driver started');
                that.setState(Status.State.READY);
                that.emit('event', 'ready');
            }
        });
};

//handler function to RPC
Conveyor.prototype.onNotification = function (notification, params) {
    // Handle notification from the conveyor in case the print was paused / resumed / canceled  from the printer or completed
    if (notification === 'jobchanged') {
        if (params.state === 'RUNNING') {
            // Update job progress
            if (params.progress) {
                this.print_progress = params.progress.progress;
            }
            if (this.getState() === Status.State.PAUSED) {
                // Notify parent that a paused job was resumed
                this.notifyResume();
            }
        }
        else if (params.state === 'STOPPED') {
            if (params.conclusion === 'ENDED') {
                this.printCompleted();
            } else if (params.conclusion === 'CANCELED' && 
              (this.getStatus().state === Status.State.PRINTING || 
               this.getStatus().state === Status.State.PAUSED)) {
                // Notify parent that the job was canceled
                this.notifyCancel();
            }
            else if (params.conclusion === 'FAILED') {
                this.notifyFailed();
            }
        }
        else if (params.state === 'PAUSED') {
            // Notify parent that the job was paused
            this.notifyPause();
        }
    } else if (notification === 'machine_state_changed') {
        if (params.state === 'RUNNING' && this.getState() !== Status.State.PRINTING && this.getState() !== Status.State.PAUSED) {
            this.setState(Status.State.MAINTENANCE);
            this.emit('event', 'status', this.getStatus());
        } else if (params.state === 'IDLE') {
            this.setState(Status.State.READY);
            this.emit('event', 'status', this.getStatus());
        }
    }
};

/** Copies a file while following symlinks */
function copyFile(path, target) {
    // Check if it's a link
    var promise = new Promise();
    fs.lstat(path, function(err, stats) {
        if(err) {
            // Handle errors
            promise.reject("could not open the file");
        } else if(stats.isSymbolicLink()) {
            // Read symlink
            fs.readlink(path, function(err, realPath) {
                // Handle errors
                if (err) {
                    promise.reject("could not open the file");
                }
                else {
                    fs.createReadStream(realPath).pipe( fs.createWriteStream(target));
                    logger.info(target);
                    promise.resolve("File copied");
                }
            });
        } else {
            fs.createReadStream(path).pipe( fs.createWriteStream(target))
            promise.resolve("File copied");
        }
    });

    return promise;
}

/**
 * loadmodel()
 *
 * Load a model asset so that it is prepared for printing
 *
 * Args:   inAsset - asset descriptor:
 *                   { type : 'file', path : '/foo/bar' }
 *                   { type : 'url', url : 'https://foo/bar' }
 * Return: DriverResponse
 */
Conveyor.prototype.loadmodel = function(inAsset) {
    var that = this;
    var file = _.extend({}, inAsset);
    if (file.type !== 'file') {
        file.path  = ""; //todo: download file and create url
    }

    if (this.getState() !== Status.State.READY && this.getState() !== Status.State.MODEL_LOADED) {
        return DriverResponse.Failure(this.getState(), DriverResponse.Errors.BAD_STATE);
    }

    this.removeTempGCode();

    this.setState(Status.State.LOADING_MODEL);
    var platform = os.platform();
    var tmpPath;
    if ( platform == "darwin" || platform == "linux") {
        tmpPath = '/tmp/';
    }
    else {
        tmpPath = os.tmpdir();
    }
    // Copy supplied gcode to a temporary location where the conveyor service has read rights
    this.tmpGCodeFile = path.join(tmpPath, uuid.v4().toLowerCase() + '.gcode');
    return when(copyFile(file.path, this.tmpGCodeFile), function(result) {
            logger.info('Copied ' + file.path + ' into ' + this.tmpGCodeFile);
            that.tempGCodes.push(that.tmpGCodeFile);
            that.loadmodelCompleted(true);
            return DriverResponse.Success(that.getState());
    },
    function (error) {
        //if the model could not be loaded, it is not a printer error state
        //loadmodelCompleted sets the state to ready.
        //that.setState(Status.State.ERROR);
        that.loadmodelCompleted(false);
        return DriverResponse.Failure(that.getState());
    });
};

/**
 * print()
 *
 * Start printing the previously uploaded model
 *
 * Note: This command will only work with conveyor/Makerbot 3.7 and later.
 * Earlier then 3.7 the parameter user_print_settings used to be called slicer_settings
 *
 * Args:   N/A
 * Return: DriverResponse
 */
Conveyor.prototype.print = function() {
    var that = this;
    var promise = new Promise();
    var slicer_settings = {};
    // Create dummy slicer settings
    var param_names = ['slicer', 'extruder', 'raft', 'support', 'infill', 'layer_height', 'shells',
        'extruder_temperatures', 'platform_temperature', 'heat_platform', 'print_speed', 'travel_speed',
        'default_raft_extruder', 'default_support_extruder', 'do_auto_raft', 'do_auto_support', 'path', 'materials'];
    for (var name in param_names) {
        slicer_settings[param_names[name]] = null;
    }

    slicer_settings['extruder'] = "0";
    slicer_settings['materials'] = ['PLA', 'PLA'];
    slicer_settings['extruder_temperatures'] = [0, 0];

    this.rpc.invoke('print', {
        "machine_name": that.deviceData.identifier,
        "input_file": that.tmpGCodeFile,
        "has_start_end": true,
        "user_print_settings": slicer_settings,
        "thumbnail_dir": '',
        "metadata": {},
        "job_metadata": {},
        "verify_gcode": false
    })
        .then(function (reply) {
            if (reply && reply.hasOwnProperty('error')) {
                logger.info('could not start print');
                promise.resolve(DriverResponse.Failure(that.getState(), DriverResponse.Errors.COMMAND_FAILED));
            }
            else {
                logger.info('print started with id: ', reply.id);
                that.conveyorJobId = reply.id;
                that.print_progress = 0;
                promise.resolve(DriverBase.prototype.print.call(that));
            }
        });

    return promise;
};


/**
 * cancel()
 *
 * Stop the currently printing job
 *
 * Args:   N/A
 * Return: DriverResponse
 */
Conveyor.prototype.cancel = function() {

    var promise = new Promise();
    var that = this;

    // Delete temp gcode file
    this.removeTempGCode();

    this.rpc.invoke('job_cancel', {
        "id": this.conveyorJobId
    })
        .then(function (reply) {
            if (reply && reply.hasOwnProperty('error')) {
                logger.info('could not cancel print');
                promise.resolve(DriverResponse.Failure(that.getState(), DriverResponse.Errors.COMMAND_FAILED));
            } else {
                logger.info('print canceled');
                promise.resolve(DriverBase.prototype.cancel.call(that));
            }
        });
    return promise;
};

/**
 * pause()
 *
 * Pauses the currently printing job
 *
 * Args:   N/A
 * Return: DriverResponse
 */
Conveyor.prototype.pause = function () {
    var promise = new Promise();
    var that = this;
    this.rpc.invoke('job_pause', {
        "id": this.conveyorJobId
    })
        .then(function (reply) {
            if (reply && reply.hasOwnProperty('error')) {
                logger.info('could not pause print');
                promise.resolve(DriverResponse.Failure(that.getState(), DriverResponse.Errors.COMMAND_FAILED));
            } else {
                logger.info('print paused');
                promise.resolve(DriverBase.prototype.pause.call(that));
            }
        });
    return promise;
};

/**
 * resume()
 *
 * Resumes the currently printing job
 *
 * Args:   N/A
 * Return: DriverResponse
 */
Conveyor.prototype.resume = function() {
    var promise = new Promise();
    var that = this;
    this.rpc.invoke('job_resume', {
        "id": this.conveyorJobId
    })
        .then(function (reply) {
            if (reply && reply.hasOwnProperty('error')) {
                logger.info('could not resume print');
                promise.resolve(DriverResponse.Failure(that.getState(), DriverResponse.Errors.COMMAND_FAILED));
            } else {
                logger.info('print resumed');
                promise.resolve(DriverBase.prototype.resume.call(that));
            }
        });
    return promise;
};

Conveyor.prototype.notifyCancel = function() {
    this.removeTempGCode();

    var response = DriverBase.prototype.cancel.call(this);
    if (!response.success) {
        return response;
    }

    logger.info('sending status');
    var status = this.getStatus();
    status.job = {};
    status.job.state = JobStatus.State.CANCELED;
    this.emit('event', 'status', status);

    return DriverResponse.Success(this.getState());
};

Conveyor.prototype.notifyPause = function() {
    var response = DriverBase.prototype.pause.call(this);
    if (!response.success) {
        return response;
    }

    logger.info('sending status');
    this.emit('event', 'status', this.getStatus());

    return DriverResponse.Success(this.getState());
};

Conveyor.prototype.notifyResume = function() {
    var response = DriverBase.prototype.resume.call(this);
    if (!response.success) {
        return response;
    }

    logger.info('sending status');
    this.emit('event', 'status', this.getStatus());

    return DriverResponse.Success(this.getState());
};

Conveyor.prototype.notifyFailed = function() {
    this.mProgressHeartbeat.pause();
    this.setState(Status.State.ERROR);

    logger.info('sending status');
    this.emit('event', 'status', this.getStatus());

    return DriverResponse.Success(this.getState());
};

/**
 * getStatus()
 *
 * Return the current status of the printer
 *
 * Args:   N/A
 * Return: DriverResponse with "status = <Status object>"
 */
Conveyor.prototype.getStatus = function() {
    var status = new Status(this.getState());

    if ((this.getState() === Status.State.PRINTING) || (this.getState() === Status.State.PAUSED)) {
        status.job = {percentComplete: this.print_progress};
    }

    return status;
};

/**
 * command()
 *
 * Send a device specific command to the printer
 *
 * Args:   inParams: Flexible object with at least { command : <command> }
 * Return: DriverResponse
 */
Conveyor.prototype.command = function(inParams) {
    if (inParams.command === Command.PRINT) {
        return this.print();
    }
    else if (inParams.command === Command.CANCEL) {
        return this.cancel();
    }
    else if (inParams.command === Command.PAUSE) {
        return this.pause();
    }
    else if (inParams.command === Command.RESUME) {
        return this.resume();
    }
    return DriverResponse.Failure(this.getState(), DriverResponse.Errors.UNKNOWN_COMMAND);
};


/**
 * cleanup()
 *
 * cleanup() is idempotent, and doesn't care if it was not connected.
 *
 * Args: N/A
 * Return: DriverResponse
 */
Conveyor.prototype.cleanup = function() {
    // Our superclass call handles errors and cleaning us up
    var response = DriverBase.prototype.cleanup.call(this);

    // Delete all temporary gcode files
    for (var tmpFile in this.tempGCodes) {
        logger.info('Deleting temp file: ' + this.tempGCodes[tmpFile]);
        fs.unlink(this.tempGCodes[tmpFile], function() {});
    }

    this.tempGCodes = [];

    return response;
};

Conveyor.prototype.removeTempGCode = function() {
    if (this.tmpGCodeFile) {
        logger.info('Deleting temp file: ' + this.tmpGCodeFile);
        fs.unlink(this.tmpGCodeFile, function () {
        });
        var index = this.tempGCodes.indexOf(this.tmpGCodeFile);
        if (index > -1) {
            this.tempGCodes.splice(index, 1);
        }
    }
};


var createConveyor = function (data) {
    return new Conveyor(data);
};

module.exports = createConveyor;
