/*******************************************************************************
 * jobStatus.js
 *
 * The JobStatus object encapsulates a job state and other job specific details
 ******************************************************************************/

JobStatus = function (inState) {
    this.state = inState || JobStatus.State.CREATED;
    this.progress = undefined;
    this.error = undefined;
};

JobStatus.State = {
    CREATED         : 'created',
    READY           : 'ready',
    SENT            : 'sent',
    RECEIVED        : 'received',
    LOADING_MODEL   : 'loadingmodel',
    MODEL_LOADED    : 'modelloaded',
    PRINTING        : 'printing',
    PAUSED          : 'paused',
    CANCELED        : 'canceled',
    COMPLETED       : 'completed',
    ERROR           : 'error' //todo: set to Failed to align with cloud APIs?
};

module.exports = JobStatus;
