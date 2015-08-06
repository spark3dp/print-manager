/*******************************************************************************
 * command.js
 *
 * This is the enum of commands common to all printers.  Printer specific 
 * commands are strings just like these.
 ******************************************************************************/

Command = {
    CONNECT     : 'connect',
    DISCONNECT  : 'disconnect',
    START       : 'start',
    PRINT       : 'print',
    CANCEL      : 'cancel',
    PAUSE       : 'pause',
    RESUME      : 'resume',
    STATUS      : 'status',
    GET_STATUS  : 'getStatus', 
    EXIT        : 'exit',
    RESET       : 'reset',
    COMMAND     : 'command'
};

module.exports = Command;
