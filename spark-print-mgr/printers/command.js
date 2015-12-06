/*******************************************************************************
 * command.js
 *
 * This is the enum of commands common to all printers.  Printer specific 
 * commands are strings just like these.
 ******************************************************************************/

Command = {
    CONNECT     : 'connect',
    DISCONNECT  : 'disconnect',
    START       : 'start',  // This is in Ember.  Is it different from 'print'?
    PRINT       : 'print',
    CANCEL      : 'cancel',
    PAUSE       : 'pause',
    RESUME      : 'resume',
    STATUS      : 'status', // We should have only 'status','getStatus' or 'state'
    GET_STATUS  : 'getStatus', // not all three.  Deprecate 'getStatus' if we can
    EXIT        : 'exit',
    RESET       : 'reset',
    COMMAND     : 'command'
};

module.exports = Command;
