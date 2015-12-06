var QUERY_TIMEOUT = 2000;

var util = require('util'),
    events = require("events"),
    srequest = require('request'),
    request = require('request').defaults({timeout : QUERY_TIMEOUT}),
    _ = require('underscore'),
    Promise = require("node-promise").Promise,
    when = require("node-promise").when,
    Status = require('./status'),
    JobStatus = require('./jobStatus'),
    Command = require('./command'),
    Heartbeat = require('heartbeater'),
    path = require('path'),
    fs = require('fs'),
    logger = require('../logging/PrintManagerLogger'),
    DriverResponse = require('./driverResponse');

var Ember = function (deviceData){
    logger.debug('in Ember constructor, data' , deviceData);
    events.EventEmitter.call(this);

    this.address = deviceData.address;
    this.name = deviceData.serviceName;

    if (!validateDeviceData(deviceData)) {
        logger.debug('Invalid device data: ', deviceData);
        this.connectionState = Status.State.DISCONNECTED;
        this.emit('event', this.connectionState);
        return;
    }

    this.connectionState = Status.State.CONNECTING;
    this.heartbeater = new Heartbeat();
    this.heartbeater.interval(1000);
    this.heartbeater.add(_.bind(this.sendprogress, this));
    var that = this;

    logger.debug('in ember constructor.calling state() for first time');
    when(this.state(), function(state) {
            logger.debug('ember constructor got state, parsing it now');
            when(that.parseState(state), function (status) {
                if (status && status.state !== Status.State.DISCONNECTED) {
                    logger.debug('in ember constructor. changing connectionState to connected');
                    that.connectionState = Status.State.CONNECTED;
                    //the printer is in error, but could be reset with API. 
                    // That is why we are returning success.
                    
                    //todo: use Event.READY enum once events are finalized.
                    that.emit('event', Status.State.READY);
                } else {
                    logger.debug('in ember constructor. changing connectionState to Disconnected');
                    that.connectionState = Status.State.DISCONNECTED;
                    that.emit('event', Status.State.DISCONNECTED);
                }
            }, function (reason){
                logger.debug('in ember constructor. changing connectionState to Disconnected');
                that.status = Status.State.DISCONNECTED;
                that.emit('event', Status.State.DISCONNECTED);
            });
        }, function () {
            logger.debug('changing connectionState to Disconnected');
            that.status = Status.State.DISCONNECTED;
            that.emit('event', Status.State.DISCONNECTED);
        });
};


/**
 * validateDeviceData()
 *
 * Args:   N/A
 * Return: True if deviceData valid
 */
function validateDeviceData(deviceData) {
    return (deviceData.address     &&
            deviceData.serviceName &&
            (deviceData.type === 'ember'));
}

Ember.API = {
    'COMMAND' : '/command',
    'UPLOAD' : '/print_file_uploads'
};

//allows to register event handlers
util.inherits(Ember, events.EventEmitter);


Ember.prototype.sendprogress = function() {
    var that = this;
    when(this.getStatus(), function (status) {
            if ((status.state !== Status.State.DISCONNECTED) &&
                (status.state !== Status.State.CONNECTED)) {
                logger.debug('sending status');
                //todo: keep the loop running for events that happen on the printer
                //todo: stop sending progress on job complete
                that.emit('event', 'status', status);
                //if the job is complete, stop the heartbeat
                if(status.job && status.job.state === JobStatus.State.COMPLETED){
                    that.heartbeater.pause();
                }
            }
        });
};


Ember.prototype.parseState = function(json) {
    var status = new Status();
    var response = json && json.response;
    if (response ) {
        
        switch (response.spark_state) {       
            case 'ready'        :
                status.state = Status.State.READY;
                break;
            //case 'offline':  //wont be the case for desktop printing 
                
            case 'printing'     :
                status.state = Status.State.PRINTING;
                break;

            case 'paused'       :
                status.state = Status.State.PAUSED;
                break;
            
            case 'maintenance'  :
                status.state = Status.State.MAINTENANCE;
                break;
            
            case 'error'        :
                status.state = Status.State.ERROR;
                break;
            
            case 'busy'         :
                status.state = Status.State.BUSY;  //todo: why is printer busy
                break;

            default             :
            status.state = Status.State.DISCONNECTED;
                
        }

        var sensor = {};
        sensor.type = 'temperature';
        sensor.description = 'resin bath temperature sensor';
        sensor.temperature = response.temperature;
        status.sensors['bath'] = sensor;
        
        if (response.is_error) {
            var error = {};
            error.name = response.error_code;
            error.description = response.error_message;
            //todo: add errors into response
        }

        var layer = response.layer;
        var total_layers = response.total_layers;

        logger.debug('parsestate adding job information in status');
        if ((layer !== undefined) &&
            (total_layers !== undefined)) {
            status.job = {};

            //set job state
            if(response.spark_job_state){
                
                if(response.spark_job_state === 'received') {
                    status.job.state = JobStatus.MODEL_LOADED;
                } else {
                    status.job.state = response.spark_job_state;
                }

            }

            status.job.current_layer = layer;
            status.job.total_layers = total_layers;
            status.job.name = response.job_name;
            //todo: get correct elapsed time
            status.job.elapsed_time = 0;
    
            if (total_layers !== 0) {
                status.job.percentComplete = Math.round(100 * layer / total_layers);
            }
            if (response.seconds_left) {
                var secondsLeft = Number(response.seconds_left);
                if (secondsLeft !== 0 && status.job.start_time) {
                    status.est_end_time = new Date(Date.parse(status.job.start_time) + secondsLeft).toISOString();
                }
            }
        }
        
    }

    return status;
};


Ember.prototype.state = function() {
    logger.debug('in Ember.prototype.state');
    var that = this;
    var promise = new Promise();
    var url = this.address + Ember.API.COMMAND;
    logger.debug('ember status url =', url);
    request.post({
            url: url, 
                form : { command : 'getStatus' }
        }, function (err, response, body) {
            if (!err && (response.statusCode === 200)) {
                promise.resolve(JSON.parse(body.toLowerCase()));
            } else {
                logger.debug('could not retrieve status from Ember Printer, error=', err);
                logger.debug('body=', body);
                promise.reject({success : false, error : err});
            }
        });

    return promise;
};

Ember.prototype.upload = function (file) {
    logger.debug('in upload, file=', file);
    var promise = new Promise();
    var error = {'error' : 'failed to upload file to printer: ' + this.name };
    try {
        var f = fs.createReadStream(file.path);
        var formData = {};
        formData.print_file = f;

        var uploadurl = this.address + Ember.API.UPLOAD;
        logger.debug('uploadurl=', uploadurl);
        srequest.post({ 
                url : uploadurl, 
                    formData : formData,
                    headers :{
                        'Accept' : 'application/json'
                    }
            }, 
            function (err, response, body) {
                logger.debug('reply from file upload to ember');
                if (err || (JSON.parse(body).success === undefined)) {
                    logger.debug('err=', err);
                    promise.resolve({ success : false, 'err' : err});
                    //for some reason, rejecting this is causing an exception. 
                    //todo: figure out why
                    //promise.reject(err || 'error occured' );
                } else {
                    logger.debug('body=', body);
                    //todo do status check before returning success
                    promise.resolve({ success : true, 'msg' : 'upload successful'});
                } 
            }
            );
    }

    catch (e) {
        //rejecting promise 
        promise.reject("could not open the file");
    }

  // return promise;
};

/** Cleanup API */
/** The printer should clean the state. */
Ember.prototype.cleanup = function() {
    logger.debug('Cleaning up Ember');
    return { success : true };
};

//** Load model API */
Ember.prototype.loadmodel = function(modeldata) {
    var file = _.extend({}, modeldata);
    var that = this;

    if (file.type !== 'file') {
        file.path  = ""; //todo: download file and create url
    }

    file.name = path.basename(file.path); 
    logger.debug('loadmodel, file=', file);

    return when(this.getStatus(), function (status) {
        if(status.state != Status.State.READY){
            logger.debug('printer is not ready to upload file. Try again');
            return DriverResponse.Failure(status.state, DriverResponse.Errors.MODEL_NOT_LOADED);
        } else {
            //TODO: figure out how we could reduce latency for command (command = print) API.
            //logger.debug('kick off upload. Dont wait for upload to finish. Return right away');
            //return DriverResponse.Success(Status.State.LOADING_MODEL);
            when(that.upload(file), function(result) {
                that.heartbeater.start();
                var status = new Status(Status.State.MODEL_LOADED);
                that.emit('event', 'status', status);
            });
            return DriverResponse.Success(Status.State.LOADING_MODEL);
        }   
    });
};

Ember.prototype.genericCommand = function(cmd) {
    var promise = new Promise();
    var that = this;
    var req = {
        uri: this.address + Ember.API.COMMAND,
        method: "POST",
        form : { "command": cmd }
    };

    request(req, function(error, response, body) {
            if (error) {
                logger.debug('RequestError ', error);
                promise.reject({ error : error });
            } else {
                logger.debug('response body ' + body);
                var answer = JSON.parse(body);
                if (answer.command === cmd) {
                    promise.resolve( {'success' : true });
                } else {
                    promise.resolve( {'success' : false });
                }
            }
        });

    return promise;
};

Ember.prototype.print = function (params) {
    logger.debug('inside Ember.prototype.print, get status');
    return when(this.getStatus(), function (status) {
            logger.debug('inside Ember.prototype.print, got status =', status);
            if (status.state === Status.State.READY) {
                logger.debug('inside Ember.prototype.print, printer status is ready');
                return DriverResponse.Success(status.state, "Print is ready to start. Please walk to the printer and start");
            } else {
                logger.debug('inside Ember.prototype.print, model is not loaded');
                return DriverResponse.Failure(status.state, DriverResponse.Errors.MODEL_NOT_LOADED);
            }
        }, function (error){
            logger.debug('inside Ember.prototype.print, failed to get status, error =', error);
            return DriverResponse.Failure(Status.State.ERROR, DriverResponse.Errors.BAD_STATE);
        }
    );
};

//** Command API*/
Ember.prototype.command = function(params) {
    var promise = new Promise();
    var cmd = params.command;
    var canExecute = true;
    var that = this;

    logger.debug('in ember.prototype.command, params = ', params);
    switch(cmd) { 
    //todo: use preconditions for each command
    case Command.START:
        canExecute = when(this.getStatus(), function (status){
            //make sure the printer is not in error state before start
            return status.state != Status.State.ERROR;
        });
    case Command.CANCEL:
    case Command.RESET: 
    case Command.PAUSE:
    case Command.RESUME:
   
        // execute the command
        when(canExecute, function (canExecute){
            if(canExecute){
                when(that.genericCommand(cmd), function (result) {
                        promise.resolve(result);
                    }, function (error) {
                        promise.resolve(DriverResponse.Failure(Status.State.ERROR, DriverResponse.Errors.BAD_STATE));
                    }
                );
            } else {
                promise.resolve(DriverResponse.Failure(Status.State.ERROR, DriverResponse.Errors.BAD_STATE));
            }
        });
        

        break;

        //we should not need to do this, but we need to as
        //ember needs Command.START to actually start the print
        //and Command.PRINT to require user to go to the printer.
    case Command.PRINT:
        when(this.print(params), function (result) {
                promise.resolve(result);
            }, function (error) {
                promise.resolve({success : false, error : error}); 
            });
        break;

    default:
        promise.resolve({success : false, error : 'command not supported'});
    }

    return promise;
};

/** getStatus API*/
Ember.prototype.getStatus = function(args) {
    logger.debug('in Ember.prototype.getStatus');

    var that = this;
    var status = new Status();
    status.state = this.connectionState;

    if ((status.state === Status.State.CONNECTING) ||
        (status.state === Status.State.DISCONNECTED)) {
        return status;
    } else {
        return when(this.state(), function(state) {
           return that.parseState(state);
        }, function (error) {
            //we could not get state from the printer
            status.state = Status.State.DISCONNECTED;
           return status;
        });
    }
};

var createEmber = function (data) {
    return new Ember(data);
};

module.exports = createEmber;
