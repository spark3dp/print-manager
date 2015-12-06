var child_process = require('child_process'),
    _ = require('underscore'),
    util = require('util'),
    events = require("events"),
    jrs = require('jsonrpc-serializer'),
    RPC = require('./rpc'),
    Promise = require("node-promise"),
    MAX_ID = 0,
    Jobs = require('../jobs'),
    Job = Jobs.Job,
    JobStatus = require('./jobStatus'),
    Files = require('../files'),
    Status = require('./status'),
    Command = require('./command'),
    PrinterUtil = require('./printerUtil'),
    logger = require('../logging/PrintManagerLogger');

var CONNECT_TIMEOUT = 2000;

var disconnectedMsg = { 
    success : false,
    reason : 'Printer is not connected'
};

var Connection = function (inDeviceData){
    logger.debug('in Connection constructor, \n deviceData=', inDeviceData);
    events.EventEmitter.call(this);

    this.deviceData = inDeviceData;

    this.fileLoading = false;
    this.fileLoaded = false;
    this.printParams = undefined;
    this.job_id = undefined;
    this.driver = undefined;
    this.path = undefined;

    this.rpc = undefined;
};

util.inherits(Connection, events.EventEmitter);

//todo add process exit handlers
//destroy this.driver on disconnect

//EVENT HANDLERS for child driver

Connection.prototype.updateJob = function(printerState, params){
    var job = this.job_id && Jobs.find(this.job_id);

    if(job && job.status) {
        //map the printerstate to job state. it may not map for some values. that is ok.
        var jobState;
        if(params && params.job && params.job.state){
            jobState = JobStatus.State[_.invert(JobStatus.State)[params.job.state]];
            logger.debug('job.state =', params.job.state);
        
        } else {
            jobState = JobStatus.State[_.invert(JobStatus.State)[printerState]];
        }
        
        logger.debug('jobState =', jobState);

        //when printer is ready, we dont want to set job state to ready or canceled.
        if(printerState === Status.State.READY) {
            jobState = undefined;
        }

        logger.debug('printer state =', printerState);
        logger.debug('inferred job state =', jobState);
        
        //set the progress and complete the job if progress is 100%
        //handle the case when the notification is sent only after the job got completed.
        if ((job.status.state === JobStatus.State.PRINTING) ||
            (job.status.state === JobStatus.State.COMPLETED) ||
            (job.status.state === JobStatus.State.LOADING_MODEL)) {
            if (params && params.job) {
                var pc = params.job.percentComplete;
                if (!pc && (pc !== 0.0)) {
                    pc = 0.0;
                }

                logger.debug('setting progress on job: ', pc);
                job.setProgress(pc);
                // Transition the state only if done and printing
                if ((pc >= 100) && (job.status.state === JobStatus.State.PRINTING)){
                    jobState = JobStatus.State.COMPLETED;
                    logger.info('job finished');
                    //let go of the job
                    delete this.job_id;
                }
                logger.debug('params.job=', params.job);
                _.extend(job.status, _.omit(params.job, 'percent_complete'));
            }
            
        } else if (job.status.state === JobStatus.State.READY && 
            jobState === JobStatus.State.PRINTING) {
            job && job.start();
        }

        if(printerState === Status.State.DISCONNECTED ||
            printerState === Status.State.READY){
            if ((job.status.state === JobStatus.State.PRINTING) ||
                (job.status.state === JobStatus.State.PAUSED) ||
                (job.status.state === JobStatus.State.LOADING_MODEL)) {
                logger.debug('the job was pobably canceled');
                //todo: decide what state we want to set the job to if the 
                //printer disconnects.
                jobState = JobStatus.State.CANCELED;
                
            }
        }
        

        if(jobState && jobState !== job.status.state){   
            //todo: handler ERROR status by adding error info
            if(jobState === JobStatus.State.CANCELED){
                //let go of the job
                delete this.job_id;
            }
            logger.debug('setting new state on the job');  
            job.setState(jobState);
        }
   }
};

Connection.prototype.onNotification = function (notification, params) {
    logger.debug('Connection received notification from driver ');
    logger.debug('driver name : ', this.deviceData.serviceName);
    logger.debug('notification : ', notification);
    logger.debug('job_id : ', this.job_id);
    if(params){
        logger.debug('params : ', params);
    }

    if (notification === 'ready') {
        logger.info(this.deviceData.serviceName, 'connection is ready');
        if (params && params.serialNumber) {
            this.deviceData.serialNumber = params.serialNumber;
        }
        this.emit(Status.State.READY, {});
    
    } else if (notification === 'status') {
        // Check for model loaded transition
        if ((params.state === Status.State.MODEL_LOADED) && this.fileLoading) {
            if (this.fileLoaded) {
                // this.fileLoaded should always be false when this.fileLoading is true
                logger.error('Should never receive MODEL_LOADED if it has already been loaded');
            }
            this.fileLoading = false;
            this.fileLoaded = true;
            this.command(Command.PRINT, this.printParams);
            this.printParams = undefined;
        }
        if (this.job_id) {
            this.updateJob(params.state, params);
        }

    } else if (notification === 'error') {
        logger.error('Error in VPD:', params );
        this.disconnect();
    }
};

Connection.prototype.onExit = function (code, signal) {
    logger.debug('driver exited with code :', code, ', signal : ', signal);
    logger.info('printer', this.deviceData.serviceName, ' disconnected!');
    this.driver = undefined;
    this.rpc = undefined;
    this.emit(Status.State.DISCONNECTED, { path : this.path });
};

Connection.prototype.onError = function (err) {
    logger.error('Connection received error from driver :', err);
    this.emit('error', {err : err});
};

//API 
Connection.prototype.connect = function () {
    var promise = new Promise.Promise();
    var that = this;
    
    if(!this.driver){
        var info = PrinterUtil.getDriverInfo(this.deviceData);
        if (info && info.driverPath) {
            this.path = info.driverPath;
            if(this.path){
                this.driver = child_process.fork('./printers/driver', 
                [this.path, JSON.stringify(this.deviceData)], 
                [{ stdio: 'inherit' }]);
            }
            if(this.driver){
                logger.debug('loaded driver script');
                this.rpc = new RPC.Client(this.driver, 'parent');
                this.rpc.on('notify', _.bind(this.onNotification, this));
                
                this.driver.on('exit', _.bind(this.onExit, this));
                this.driver.on('error', _.bind(this.onError, this));
                
                //see if the driver is already 'ready'
                //if yes, just resolve to success
                //if not, then subscribe to ready and wait.
                Promise.when(this.getStatus(), function (status) {
                    if (status.state === Status.State.CONNECTING) {
                        logger.debug('the driver is created, but not connected yet. register to the ready event');

                        var resolve = function (result) {
                            if (result &&  result.success) {
                                logger.debug('Connection.connect successful');
                                promise.resolve(result);
                            } else {
                                var reason = that.deviceData.serviceName + ' connect command timed out.';
                                logger.debug(reason);
                                promise.resolve({
                                    success : false, 
                                    reason : reason
                                });

                                that.cleanup();
                            }
                        };
                        
                        var onReady = function (){
                            var promise = new Promise.Promise();
                            that.once('ready', function() {
                                promise.resolve({success : true});
                            });
                            return promise;
                        };

                        Promise.first(Promise.delay(CONNECT_TIMEOUT), onReady())
                        .then(function (result) {
                            resolve(result);
                        });



                    } else {
                        if (status.state === Status.State.DISCONNECTED) {
                            promise.resolve({success : false});
                            that.cleanup();
                        } else {
                            promise.resolve({success : true});
                        }
                    }
                });
            } else {
                promise.resolve(disconnectedMsg);
            }
        }
    } else {
        logger.info('printer already connected!');
        promise.resolve({success : true});
    }
    return promise;
};

Connection.prototype.cleanup = function () {
    try {
        this.driver.kill('SIGINT');
    } catch (e){
        logger.warn('could not kill driver process');
        logger.debug(e);
    }
        //cancel the job:
    if(this.job_id){
        logger.debug('calling up updatejob after the cleanup');
        var state = Status.State.DISCONNECTED;
        logger.debug('set job state to ', state);
        this.updateJob(state);
    }
    this.driver = undefined;
    this.rpc = undefined;
};

Connection.prototype.disconnect = function () {
    if (!this.isConnected()) {
        var p = new Promise.Promise();
        p.resolve(disconnectedMsg);
        return p;
    }
    
    this.emit(Status.State.DISCONNECTING, {path : this.path});
    var that = this;
    var cleanupPromise = new Promise.Promise();
    this.rpc.invoke('cleanup');
    // Give the process one second to clean itself up before we kill it
    setTimeout(function (){
            that.cleanup();
            cleanupPromise.resolve({ success : true });
        }, 1000);
    return cleanupPromise;
};



Connection.prototype.command = function (cmd, params){
    var that = this;
    var command = cmd;
    var job_id = params.job_id;
    var job = job_id && Jobs.find(job_id);

    if(!this.isConnected()){
        var p = new Promise.Promise();
        p.resolve(disconnectedMsg);
        return p;
    }

    // We really should purge the code of any 'start' references and get rid
    // of this code.  Map 'start' to 'print'.
    command = (command === Command.START) ? Command.PRINT : command;

    // If the command is print we check the current state.  If no file has been
    // loaded, we want to issue the 'loadmodel' rpc and wait for it to complete.
    // If a model has been loaded, then we can fall through to the normal
    // command processing below.
    if (command === Command.PRINT) {
        if (!this.fileLoaded && !this.fileLoading) {
            // Load the file or fail, but do not continue to command execution
            if (this.fileLoading) {
                // this.fileLoading should always be false when this.fileLoaded is true
                logger.error('Command.PRINT should never be sent when fileLoading');
            }
            var file = job && Files.find(job.printable_id);
            if (file) {
                this.printParams = params; // store for after file is loaded
                this.job_id = job_id;
                var response = this.loadModel({ type: 'file', path : file.path });
                this.fileLoading = true;
                return Promise.when(response, function (inResponse) {
                    
                    if (!inResponse.success) {
                        that.fileLoading = false;
                    }
                    return inResponse;
                        
                });
            } else {
                this.fileLoading = false;
                return { success : false, error : 'no job file specified' };
            }
        }
        // If we received a print with this.fileLoaded, fall through to the
        // actual command:print code below but we clear this.fileLoaded flag as
        // it has served its purpose.
        this.fileLoaded = false;
    }

    // fire the command when the result is available from previous step. 
    // the result could be a value or a promise
    var args = {};
    args[Command.COMMAND] = command;

    // If we are canceling, we need to ditch any file loading or loaded state
    if (command === Command.CANCEL) {
        this.fileLoading = this.fileLoaded = false;
    }

    return Promise.when(that.rpc.invoke('command', _.extend(args, params)), function (result) { 
            logger.debug('result in Connection.prototype.command =', result);
            if(result.success) {
                logger.debug('command', command, 'was successful');

                // the command was successful, but there could be subsequent
                // errors on the printer we need to get the status again before
                // updating the job.
                Promise.when(that.rpc.invoke('getStatus'), 
                             function(status) {
                                 var commandState;
                                 var successString = 'command ' + command + ' was successful';
                                 if (command === Command.PRINT) {
                                     //ember does not start print, but is shown ready   
                                     if (status.state === Status.State.PRINTING ) {
                                         commandState = Status.State.PRINTING;
                                     } else {
                                         logger.warn(successString + ', but the printer is not printing');
                                         //do not set error. ember does does not start printing right away, but needs
                                         //user intervention
                                         //commandState = Status.State.ERROR;
                                         //todo: set error string on the job
                                     }

                                 } else if (command === Command.PAUSE) {
                                     if(status.state === Status.State.PAUSED) {
                                         commandState = Status.State.PAUSED;                                  
                                     } else {
                                         logger.warn(successString + ', but printer did not pause');
                                     }
                                 } else if (command === Command.CANCEL) {
                                     //todo: check if status is canceled
                                     commandState = Status.State.READY;
                                     if (status.state !== Status.State.READY) {
                                         // debug only message.  Some drivers switch to BUSY state until
                                         // the cancel is complete and then back to READY
                                         logger.debug(successString + ', but printer is not ready yet');
                                     }
                                 } else if (command === Command.RESUME) {
                                     if(status.state === Status.State.PRINTING) {
                                         //todo: check if status is printing
                                         commandState = Status.State.PRINTING;
                                     } else {
                                         logger.warn(successString + ', but printer did not resume');
                                     }
                                 }
                                 if (commandState) {
                                     logger.debug('calling udpatejob', commandState);
                                     that.updateJob(commandState, status);
                                 }
                             }, 
                             function (error) {
                                 logger.debug('command was successful, but could not update job status');
                                 logger.debug(error);
                             });
            } else {
                logger.warn('command', command, 'failed');
            }
            return result;
        });
};


Connection.prototype.getStatus = function (params) {
    var that = this;
    if (!this.isConnected()) {
        var p = new Promise.Promise();
        p.resolve(disconnectedMsg);
        return p.promise;
    }
    var params2 = this.job_id ? _.omit(params, 'job_id') : params;
    
    return Promise.when(this.rpc.invoke('getStatus', params2), 
        function (status){
            //todo: replace job name here.

            status.job = _.extend(status.job, {job_id : that.job_id});

            logger.debug("connection status", status);
            return status;
        }, 
        function (e){
            logger.warn('error in getting status');
            return { success : false};
        }
    );
};

Connection.prototype.loadModel = function (modelData){
    logger.debug("in connection.prototype.loadmodel");
    if(!this.isConnected()){
        var p = new Promise.Promise();
        p.resolve(disconnectedMsg);
        return p.promise;
    }
    return this.rpc.invoke('loadmodel', modelData);
};

Connection.prototype.isConnected = function (status) {
    return this.driver !== undefined && this.driver !== null;
};

var getConnection = function (inDeviceData) {
    return new Connection(inDeviceData);
};

module.exports.getConnection = getConnection;
