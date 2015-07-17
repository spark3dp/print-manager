var QUERY_TIMEOUT = 3000;

var util = require('util'),
    events = require("events"),
    srequest = require('request'),
    request = require('request').defaults({timeout : QUERY_TIMEOUT}),
    _ = require('underscore'),
    uuid = require('uuid'),
    path = require('path'),
    fs = require('fs'),
    Heartbeat = require('heartbeater'),
    Promise = require("node-promise").Promise,
    when = require("node-promise").when,
    Status = require('./status'),
    JobStatus = require('./jobStatus'),
    Command = require('./command'),
    DriverResponse = require('./driverResponse'),
    logger = require('../logging/PrintManagerLogger');

var Octoprint = function (deviceData) {
    logger.debug('in octoprint constructor, deviceData' , deviceData);
    events.EventEmitter.call(this);

    this.address = deviceData.address;
    this.name = deviceData.serviceName;
    this.connectionStatus = Status.State.CONNECTING;
    this.fetchAPI();

    this.heartbeater = new Heartbeat();
    this.heartbeater.interval(1000);
    this.heartbeater.add(_.bind(this.sendprogress, this));
};

Octoprint.API = {
    'typea' : {
        'SETTINGS' : '/ajax/settings',
        'UPLOAD' : '/ajax/gcodefiles/upload',
        'UPLOAD_NAME' : 'gcode_file',
        'JOB' : '/ajax/control/job',
        'LOAD' : '/ajax/gcodefiles/load',
        'STATE' :'/api/state',
        'VERSION' : 'typea'
    },
    '1.1.0' : {
        'SETTINGS' : '/api/settings',
        'UPLOAD' : '/api/files/local',
        'UPLOAD_NAME' : 'file',
        'JOB' : '/api/job',
        'LOAD' : '/api/files/local/',
        'STATE' : '/api/state',
        'VERSION' : '1.1.0'
    }
};

//allows to register event handlers
util.inherits(Octoprint, events.EventEmitter);

Octoprint.prototype.API = function() {
    return this.__api;
};

Octoprint.prototype.sendprogress = function() {
    var that = this;
    when (this.getStatus(), function (status) {
            if ((status.state !== Status.State.DISCONNECTED) &&
                (status.state !== Status.State.CONNECTING)) {
                logger.debug('sending status');
                //todo: keep the loop running for events that happen on the printer
                //if the job is complete, stop the heartbeat
                if(status.job && status.job.state === JobStatus.State.COMPLETED){
                    that.heartbeater.pause();
                }
                that.emit('event', 'status', status);
            }
        });
};


Octoprint.prototype.fetchAPI = function () {
    logger.debug('fetching octoprint api');
    var index = '1.1.0';
    if ((this.name.toLowerCase().indexOf('series') !== -1)
       //|| (this.name.toLowerCase().indexOf('octopi') !== -1)
       ) {
        index = 'typea';
    }
    this.__api = _.extend({} , Octoprint.API[index]);
    logger.debug(this.API());

    var url = this.address + this.API().SETTINGS;
    logger.debug('getting API key with url=', url);
    var that = this;

    //this takes roughly 700 ms. that is why we set the QUERY_TIMEOUT high.
    request(url, function (error, response, body) {
            if (!error && (response.statusCode === 200)) {
                var reply = JSON.parse(body);

                function onReady (){
                    var state = that.state();
                    var status = when(state, function (state){
                            return that.parseState(state);
                        }, function (){
                            that.connectionStatus = Status.State.DISCONNECTED;   
                        }
                    );

                    when(status, function(status){
                            if(status.state !== Status.State.DISCONNECTED){
                                that.connectionStatus = Status.State.CONNECTED;
                                that.emit('event', 'ready');
                            } else {
                                that.connectionStatus = Status.State.DISCONNECTED;
                            }
                        }, 
                        function (){
                            that.connectionStatus = Status.State.DISCONNECTED;
                        }
                    );
                        
                }

                if (reply.api && reply.api.enabled) {
                    that.API().KEY = reply.api.key;
                    onReady();
                } else {
                    logger.debug('api is not already enabled. we need to enable API');
                    var key = (reply.api && reply.api.key) || uuid.v1();
                    var req = {
                        'url' : that.address + that.API().SETTINGS,
                        'method': "POST",
                        'json' : { api  : { enabled : true, key : key} },
                    };

                    request(req, function (error, response, body) {
                            if (!error) {
                                that.API().KEY = key;
                                onReady();    
                            } else {
                                logger.debug('enabling API failed');
                                that.connectionStatus = Status.State.DISCONNECTED;
                            }
                        }
                    );
                }

            } else {
                logger.debug('error in getting settings', error, 'response.statusCode=', response && response.statusCode);
                that.connectionStatus = Status.State.DISCONNECTED;
                //todo: raise event?
            }
        });
};

Octoprint.prototype.upload = function (file) {
    logger.debug('in upload, file=', file);
    var deferred = new Promise();
    var error = {'error' : 'failed to upload file to printer: ' + this.name };

    try {
        var f = fs.createReadStream(file.path);
        var formData = {};
        formData.filename =  file.name;
        formData[this.API().UPLOAD_NAME] = f;
        var uploadurl = this.address + this.API().UPLOAD;
        //use request without timeout
        srequest.post({ 
                url : uploadurl, 
                    formData : formData }, 
            function (err, response, body) {
                if (err) {
                    //logger.debug('err', err);
                    deferred.reject(error);
                } else {
                    //logger.debug('body=', body);
                    //logger.debug('upload successful to type A (octoprint)');
                    deferred.resolve({ success : true, 'msg' : 'upload successful'});
                } 
            }
        );
        //logger.debug('file open successful');
    }
    catch (e) {
        deferred.reject(e && e.message);
        logger.debug('file open failed, error :', e);
    }

    return deferred;
};

Octoprint.prototype.loadFile = function (filename) {
    logger.debug('in Octoprint.prototype.load, filename=', filename);
    var deferred = new Promise();
    var error = {'error' : 'failed to load file: ' + filename };
    var req = { url : this.address + this.API().LOAD };
    var that = this; 

    if (this.API().VERSION.indexOf('typea') !== -1) {
        req.formData = { filename :  filename };
    } else {
        req.url += filename;
        req.json = {
            'command' : 'select',
            'print' : false
        };
    }
    logger.debug('in Octoprint.prototype.load, request=', req);

    request.post(req, function (err, response, body) {
            if (err) {
                logger.debug('error in loading file on ', that.__name, 'err=', err);
                deferred.reject({success : false, message : 'file could not be loaded'});
            } else {
                when(that.getLoadedFile(), function(name) {
                        if (name === filename) {
                            deferred.resolve({ success : true, msg : 'loaded file ' + name + ' successfully' });
                        } else {
                            deferred.reject({ success : false, message : 'file was not uploaded' });
                        }
                    });
            }
        });

    return deferred;
};

Octoprint.prototype.job = function (command) {
    var deferred = new Promise();
    var that = this;
    var cmd = (command === Command.RESUME) ? Command.PAUSE : command;
    var req = {
        'url' : this.address + this.API().JOB,
        'method': "POST"
    };

    if (this.API().VERSION.indexOf('typea') !== -1) {
        req.form = {"command": cmd};
    } else {
        req.json = {"command":cmd};
    }

    //we need to avoid putting timeout for now on job api
    //cancel, for example, takes 15 seconds to execute sometimes. 
    //we better not timeout this API. 
    //i would rather have 
    srequest(req, function(error, response, body) {
            if (error) {
                logger.debug('octoprint.job failed to execute command ', command, ' due to error : ', error);
                logger.debug('request was: ', req);
                deferred.reject({ error : 'failed to execute command ' + command });
            } else {
                logger.debug('octoprint.job seccessfully executed command', command);
                deferred.resolve({ success : true });
            }
        }); 
    return deferred;
};


Octoprint.prototype.state = function() {
    var that = this;
    var deferred = new Promise();
    var stateurl = that.address + that.API().STATE + '?apikey=' + that.API().KEY;
    logger.debug('Octoprint.state url = ', stateurl);

    request(stateurl, function (err, response, body) {
            if (err) {
                deferred.reject({success : false, error : err});
            } else {     
                try {
                    var s = JSON.parse(body);
                    logger.debug('s.state', s.state);
                    deferred.resolve(s);
                } catch (e) {
                    deferred.reject({success : false, error : e});
                }
            }
        });

    return deferred;
};

Octoprint.prototype.parseState = function(s) {
    
    var status;
    var state;
    var flags = s.state.flags;
    var job = {};
    
    if (!flags.operational) {
        state = Status.State.ERROR;
    } else {
        if (flags.printing) {
            state = Status.State.PRINTING;
            job.state = JobStatus.State.PRINTING;
        } else if (flags.paused) {
            state = Status.State.PAUSED;
            job.state = JobStatus.State.PAUSED;
        } else if (flags.ready) {
            //todo: based on file name, infer job status as received.
            state = Status.State.READY;
        } else if (flags.error || flags.closedOrError) {
            state = Status.State.ERROR;
        }  
    }

    status = new Status(state);
    status.job = job;
    var t = s.temperatures;
    var tools = _.keys(t);

    //jsonrpc does not like arrays. cant serialize them. so objects here.
    status.sensors = {};
    status.tools = {};

    _.each(tools, function (toolName) {
            var name = toolName.replace(/tool/, 'extruder');
            var sensor = {};
            sensor.type = 'temperature';
            sensor.description = name + ' temperature sensor';
            sensor.temperature = t[toolName].actual || t[toolName].current;
            status.sensors[name] = sensor;

            var tool = {};
            tool.type = name.replace(/[0-9]+$/, '');
            status.tools[name] = tool;

    });

    status.job.name = s.job && s.job.filename;


    var pc = 0;
    if(s.progress) {
        pc = 100.0 * (s.progress.progress || s.progress.completion/100.0);
        logger.debug('job progress in octoprint = ', s.progress.progress);
        
        if(pc == 100.0){
            status.job.state = JobStatus.State.COMPLETED;
        }
    }

    status.job.percentComplete = pc;

    return JSON.parse(JSON.stringify(status));
};


/*
 * Verifies that a command is valid before executing
 * Resuming a paused printer or starting a ready printer results in satisfied precondition
 * Pausing a paused print or resuming a printing print results in idempotent precondition
 *
 * @param {string} command - string of the command to be executed
 *
 * Returns a json object with boolean declarations for precondition being 'satisfied' and 'idempotent'
 */
Octoprint.prototype.precondition = function(command) {
    logger.debug('calling getStatus() from precondition for command ', command);
    return when(this.getStatus(), function (status) {
            logger.info('status=', status, 'state=', status.state);
            if (((command === Command.RESUME) && (status.state === Status.State.PRINTING)) ||
                ((command === Command.PAUSE) && (status.state === Status.State.PAUSED))) {
                logger.info('idempotent command. status.state=', status.state);
                return { satisfied: true, idempotent: true };
            }
            else if (((command === Command.START) && (status.state !== Status.State.READY)) ||
                ((command === Command.RESUME) && (status.state !== Status.State.PAUSED)) ||
                ((command === Command.PAUSE) && (status.state !== Status.State.PRINTING))) {
                logger.info('precondition unmet. status.state=', status.state);
                return { satisfied: false, idempotent: false };
            }
            logger.info('preconditions met');
            return { satisfied: true, idempotent: false };
        });
};

/*****************************************************************************/

/** cleanup() API */
/** The printer should clean the state. */
Octoprint.prototype.cleanup = function() {
    logger.debug('Cleaning up octoprint');
    return {success : true};
};

Octoprint.prototype.getLoadedFile = function() {
    return when(this.state(), function (state) {  
            logger.debug('in Octoprint.prototype.load, state=', state);
            var filename = state.job && ( (state.job.file && state.job.file.name) || state.job.filename );
            return filename;
        });
};

//** Load model API */
Octoprint.prototype.loadmodel = function(modeldata) {
    var file = _.extend({}, modeldata);
    var that = this;
    if (file.type !== 'file') {
        file.path  = ""; //todo: download file and create url
    }

    file.name = path.basename(file.path); 
    when(this.upload(file), function(result) {
            logger.debug('upload result=', result);

            return when(that.loadFile(file.name), function (result) {
                    logger.debug('load result=', result);
                    if (result.success) {
                        return when(that.getLoadedFile(), function(filename) {
                                if (filename === file.name) {
                                    that.heartbeater.start();
                                    var status = new Status(Status.State.MODEL_LOADED);
                                    that.emit('event', 'status', status);
                                    return {success : true};
                                } else {
                                    return {success : false, error : 'file upload successful. Load failed. printer might be busy'};
                                }
                            });
                    } else {
                        return {success : false, error : 'file could not be loaded'};
                    }
                }, function (){
                    return {success : false, error : 'file could not be loaded'};
                });
        });
    return DriverResponse.Success(Status.State.LOADING_MODEL);
};

//** Command API*/
Octoprint.prototype.command = function(data) {
    var command = data.command;
    var that = this;

    //we should not need to do this, but we need to as
    //ember needs Command.START to actually start the print
    //and Command.PRINT to require user to go to the printer.

    if (command === Command.PRINT) {
        command = Command.START;
    }
    logger.debug(this.name, 'received command: ', command);
    
    return when(this.precondition(command), function (precondition) {
    
            logger.info('precondition was satisfied? : ', precondition.satisfied);
            if (precondition.satisfied) {
    
                if(precondition.idempotent){
                    return {success : true };
                } else {
                    return when(that.job(command), function(result) {
                        logger.debug('job returned with result: ', result);
                        return result;
                    }, function (reason){
                        logger.debug('job errored with reason :', reason);
                        return { success : false, error : reason };
                    });
                }
            } else {
                return {success : false };

            }
        });
};

/** getStatus API*/
Octoprint.prototype.getStatus = function(args) {
    logger.debug('in Octoprint.prototype.getStatus');
    var that = this;
    var status = new Status();
    status.state = this.connectionStatus;

    if ((this.connectionStatus === Status.State.CONNECTING) ||
        (this.connectionStatus === Status.State.DISCONNECTED)) {
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

var createOctoprint = function (data) {
    return new Octoprint(data);
};

module.exports = createOctoprint;
