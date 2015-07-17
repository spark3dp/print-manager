/*******************************************************************************
 * status.js
 *
 * The Status object encapsulates a state and printer specific details
 ******************************************************************************/

var Status = function (inState) {
    this.state = inState || Status.State.ERROR;
    this.errors = undefined;   // array of error strings
    this.warnings = undefined; // array of warning strings

    this.job = {};

    this.percentComplete = undefined;

    this.tools = {};
    this.sensors = {};
    this.materials = {};
};

Status.State = {
    ERROR         : 'error',
    CONNECTING    : 'connecting',
    CONNECTED     : 'connected',
    DISCONNECTING : 'disconnecting',
    DISCONNECTED  : 'disconnected',
    READY         : 'ready',
    PRINTING      : 'printing',
    PAUSED        : 'paused',
    MAINTENANCE   : 'maintenance',
    BUSY          : 'busy',
    LOADING_MODEL : 'loadingmodel',
    MODEL_LOADED  : 'modelloaded'
};

module.exports = Status;
