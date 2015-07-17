var express = require('express'),
    resource = require('./resource'),
    util = require('util'),
    _ = require('underscore'),
    dateUtils = require('./utils/dateUtils'),
    logger = require('./logging/PrintManagerLogger'),
    JobStatus  = require('./printers/jobStatus'),
    Promise = require('node-promise').Promise,
    when = require('node-promise').when,
    trays  = require('./trays');

var jobs = {};

function getJobs(){
    return jobs;
}

function Job(p, tray, profile, printable){
    resource.Resource.call(this);
    this.printer_id = p;
    this.tray_id = tray;
    this.profile_id = profile;
    this.printable_id = printable;
    this.status = new JobStatus();
    this.date_time = Date.now();
    jobs[this.getID()] = this;
}

util.inherits(Job, resource.Resource);


Job.prototype.setState =function (state){
    if(this.status.state !== state && _.contains(_.values(JobStatus.State), state)) {
       var oldState = this.status.state;
       this.status.state = state;
       //reset the timers if the job has not been printing previously
       if(this.status.state ===JobStatus.State.PRINTING && 
          oldState !== JobStatus.State.PAUSED){
            this.start_time = Date.now();
       }
       this.status_time = Date.now();
       //todo: revise elapsed time etc
    }
};

Job.prototype.start = function (){
    this.setState(JobStatus.State.PRINTING);
};

Job.prototype.cancel = function (){
    this.setState(JobStatus.State.CANCELED);
};

Job.prototype.pause = function (){
    this.setState(JobStatus.State.PAUSED);
};

Job.prototype.resume = function (){
    this.setState(JobStatus.State.PRINTING);
};

Job.prototype.setProgress = function (percent){
    if ((this.status.state === JobStatus.State.PRINTING) ||
        (this.status.state === JobStatus.State.LOADING_MODEL)) {
        this.status.progress = percent;
    } else {
        logger.warn('job is not loading or printing. cannot set progress');
    }
};

Job.validate = function(data){
    logger.debug('job validate data=' + JSON.stringify(data));

    return !!(data.printer_id);
};

var router = express.Router();
router.get('/', function (req, res){
    res.send(_.map(jobs, function (job){
      return job.asJSON();
  }));
});

router.use('/:id', function (req, res, next){
    req.job = jobs[req.params.id];
    if(req.job){
        next();
    } else {
        res.send({"error" : "job not found"});
    }
});

router.get('/:id', function (req, res){
    res.send(req.job.asJSON());
});

router.get('/:id/status', function (req, res){
    res.send(_.pick(req.job, 'status'));
});

//get property paths e.g./:id/firmware.type
router.get('/:id/:path', function (req, res){
    var keys = req.params.path.split('.');
    logger.info('getting properties ' + keys);
    var data = _.reduce(keys, function(memo, key){ return memo && memo[key]; }, req.job);
    res.status(200);
    res.send(data);
});

function createJob(params) {
    var job;
    logger.debug('creating job with params ', params);
    var data = _.pick(params, 'printer_id', 'tray_id', 'profile_id', 'file_id');
    var other = _.omit(params, 'printer_id', 'tray_id', 'profile_id', 'file_id');
    if(Job.validate(data)) {
        var response = {};

        var p =  data.printer_id;
           var trayId = data.tray_id;
          var profile = data.profile_id;
          var printable = data.file_id;

        job = new Job(p, trayId, profile, printable);
        _.extend(job, other);

        if(printable){
            job.setState(JobStatus.State.READY);
        }

        if (trayId)
        {
            var tray = trays.find(trayId);
            job.addChild( tray );
        }
        logger.debug('created job with id:', job.id);

    } else {
        logger.debug('invalid job parameters');
    }
    return job;
}

function setPrintable(req, res){
    logger.debug('in set printable, id = ' + req.body.file_id);
    //todo: handle increment refs to resouces
    req.job.printable_id = req.body.file_id;
    req.job.setState(JobStatus.State.READY);
    res.status(200);
    res.send({});
}

router.post('/', function (req, res) {
    logger.debug('req.body=' + req.body);;
    when(createJob(req.body), function (job) {
        if (job){
            res.status(201);
            var response = { job_id : job.id };
            res.send(response);
        } else {
            var response = {};
            response.error = "invalid job parameters";

            res.status(422);
            res.send(response);
        }
    });
});

router.post('/:id/set-printable', setPrintable);
router.post('/:id/setPrintable', setPrintable);


function prune( pruneOlderThan )
{
    if (pruneOlderThan === undefined ) {
        pruneOlderThan = 5;
    }

    logger.info('Pruning jobs older than: ' + pruneOlderThan + ' days');

    var nowDate = new Date();

    // Prune any jobs that are older than 5 days.
    for (var jobId in jobs) {
        var job = jobs[jobId];
        if (dateUtils.daysBetween(job.__timeStamp, nowDate) >= pruneOlderThan )
        {
            // Unref all the children.
            job.removeAllChildren();
            delete jobs[jobId];

            logger.info( '   - deleted job:' + jobId );
        }
    }
}


module.exports = exports = {
    'Job' : Job,
    'find' : function (id){
        return jobs[id];
    },
    'Router' : function () { return router; },
    'prune': prune,
    'createJob' : createJob
};
