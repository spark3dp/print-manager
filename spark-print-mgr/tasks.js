var express = require('express'),
    resource = require('./resource'),
    logger = require('./logging/PrintManagerLogger'),
    Errors = require('./error/Errors'),
    validator = require('./utils/validator'),
    APIError = require('./error/APIError.js'),
    util = require('util');

var router = null;
var tasks = {};

function Task()
{
    // call the base class
    resource.Resource.call( this );

    // initialize members
    this.status = 'running';
    this.progress = 0;

    // install in our collection
    tasks[this.getID()] = this;
}

util.inherits( Task, resource.Resource );

Task.prototype.setResult = function( result )
{
    this.status = 'done';
    this.progress = 1;
    this.result = result;
};

Task.prototype.setError = function (error)
{
    this.status = 'error';
    this.progress = 1;
    if (error instanceof APIError) {
        this.error = {
            error_id: error.errorId,
            code: error.code,
            message: error.message
        }
    } else {
        this.error = { 'message': error }
    }
};

Task.prototype.asJSON = function()
{
    var js = {};

    js.id = this.id;
    js.status = this.status;
    js.progress = this.progress;

    if( this.result )
        js.result = this.result;

    if( this.error )
        js.error = this.error;

    return js;
};

function getTask( req, res, next )
{
    var id = req.params.id;

    if (!validator.isUUID(id)) {
        return next(new Errors.Request.NotFoundError('id should be a UUID', 122000));
    }

    var task = findTask(id);

    if( task instanceof Task )
    {
        res.send( task.asJSON() );
    }
    else
    {
        return next(new Errors.Request.NotFoundError('Task ' + id + ' cannot be found', 122001));
    }
}


function findTask( id )
{
    if (!(typeof(id) === 'string' || id instanceof String)) {
        return undefined;
    }

    return tasks.hasOwnProperty(id) ? tasks[id] : undefined;
}


function getRouter()
{
    if( router )
        return router;

    // configure the router
    router = express.Router();
    router.get('/:id', getTask );

    return router;
}


function prune( pruneOlderThan )
{
    if (pruneOlderThan === undefined ) {
        pruneOlderThan = 5;
    }

    var dateUtils = require('./utils/dateUtils');

    logger.info('Pruning tasks older than: ' + pruneOlderThan + ' days');

    var nowDate = new Date();

    // Prune any task that has zero references.
    for (var taskId in tasks)
    {
        var task = tasks[taskId];
        if (dateUtils.daysBetween(task.__timeStamp, nowDate) >= pruneOlderThan )
        {
            // Unref the children
            task.removeAllChildren();
            delete tasks[taskId];

            logger.info( '   - deleted task:' + taskId );
        }
    }
}


module.exports = exports = {
    'Router' : getRouter,
    'Task' : Task,
    'find' : findTask,
    'prune': prune
};
