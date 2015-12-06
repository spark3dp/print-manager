/**
 * commandQueueSpec.js
 *
 * Tests for the commandQueue object
 */
var _ = require('underscore'),
    should = require('should'),
    assert = require('assert'),
    CommandQueue = require('../../../printers/drivers/commandQueue');

describe('CommandQueue', function() {
        var okData = 'ok';
        var newExecutorFunc = function () {
            return {
                mOpen : undefined,
                mExecutedCommands : [],
                // open() and close() call the done function immediately.  This
                // allows us to call nextCommand() and have it continue to the 
                // following commands synchronously, which is important for our
                // test flow.
                open    : function (inDoneFunc) {
                    this.mOpen = true;
                    inDoneFunc(this.mOpen);
                },
                close   : function (inDoneFunc) {
                    this.mOpen = false;
                    inDoneFunc(true);
                },
                execute : function (inRawCommand, inDataFunc, inDoneFunc) {
                    this.mExecutedCommands.push(inRawCommand);
                    inDataFunc(okData);
                }
            };
        };

        var expandCodeFunc        = function (inCode) { return '~' + inCode + '\r\n'; };
        var responseFunc          = function (inData) { return true; };
        var commandString         = 'M29';
        var expandedCommandString = expandCodeFunc(commandString);
        var simpleCommand         = { code : commandString };
        var expandedCommand       = { code : commandString, rawCode : expandedCommandString };
        var command2              = { rawCode : 'Mads' };
        var command3              = { rawCode : 'Ram' };
        var command4              = { rawCode : 'Matt' };
        var openCommand           = { open : true };
        var closeCommand          = { close : true };
        var newQueueFunc = function () {
            return new CommandQueue(newExecutorFunc(), expandCodeFunc, responseFunc);
        };

        describe('Construction and access', function() {
                it('should construct with proper defaults', function(done) {
                        var commandQueue = newQueueFunc();
                        commandQueue.isOpen().should.be.false;
                        should.not.exist(commandQueue.mCurrentCommand);
                        commandQueue.mQueue.length.should.equal(0);
                        commandQueue.mCommandId.should.equal(0);
                        commandQueue.mExpandCodeFunc.should.equal(expandCodeFunc);
                        commandQueue.mResponseFunc.should.equal(responseFunc);
                        done();
                    });

                it('should set the proper code expand function', function (done) {
                        var func = function(inCode) { return 'a' + inCode + 'b'; };
                        var commandQueue = new CommandQueue({}, func, undefined);
                        commandQueue.mExpandCodeFunc.should.equal(func);
                        done();
                    });

                it('should set the proper default response function', function (done) {
                        var func = function(inData) { return true; };
                        var commandQueue = new CommandQueue({}, undefined, func);
                        commandQueue.mResponseFunc.should.equal(func);
                        done();
                    });
            });

        describe('Command expansion', function () {
                it('should expand a simple command', function (done) {
                        var prefix = '^';
                        var suffix = '$';
                        var expandFunc = function (inCode) { return prefix + inCode + suffix; };
                        var commandQueue = new CommandQueue({}, expandFunc, undefined);
                        var code = 'code';
                        var expanded = commandQueue.expandCommands(code)[0];
                        expanded.code.should.equal(code);
                        expanded.rawCode.should.equal(prefix + code + suffix);
                        done();
                    });

                it('should expand a simple command to an array containing it', function (done) {
                        var commandQueue = newQueueFunc();
                        var commands = commandQueue.expandCommands(simpleCommand);
                        should.exist(commands);
                        commands.length.should.equal(1);
                        commands[0].should.equal(simpleCommand);
                        done();
                    });

                it('should expand a few simple commands to an array containing them', function (done) {
                        var commandQueue = newQueueFunc();
                        var commands = commandQueue.expandCommands(simpleCommand, command2, command3);
                        should.exist(commands);
                        commands.length.should.equal(3);
                        commands[0].should.equal(simpleCommand);
                        commands[1].should.equal(command2);
                        commands[2].should.equal(command3);
                        done();
                    });

                it('should expand an array of simple commands to an array containing them', function (done) {
                        var commandQueue = newQueueFunc();
                        var commands = commandQueue.expandCommands([simpleCommand, command2, command3]);
                        should.exist(commands);
                        commands.length.should.equal(3);
                        commands[0].should.equal(simpleCommand);
                        commands[1].should.equal(command2);
                        commands[2].should.equal(command3);
                        done();
                    });

                it('should expand a recursive array of commands to a flattened array', function (done) {
                        var commandQueue = newQueueFunc();
                        var subArray = [ command2, command3 ];
                        var commands = commandQueue.expandCommands([simpleCommand, subArray, command4]);
                        should.exist(commands);
                        commands.length.should.equal(4);
                        commands[0].should.equal(simpleCommand);
                        commands[1].should.equal(command2);
                        commands[2].should.equal(command3);
                        commands[3].should.equal(command4);
                        done();
                    });

                it('should expand a simple string to a full command', function (done) {
                        var commandQueue = newQueueFunc();
                        var commands = commandQueue.expandCommands(commandString);
                        should.exist(commands);
                        commands.length.should.equal(1);
                        assert.deepEqual(commands[0], expandedCommand);
                        done();
                    });
            });

        describe('Queueing', function () {
                it('queueCommands should append to the command array', function (done) {
                        var commandQueue = newQueueFunc();
                        commandQueue.mQueue = [ 1, 2 ];
                        commandQueue.queueCommands(command2, command3);
                        commandQueue.mQueue.length.should.equal(4);
                        assert.deepEqual(commandQueue.mQueue, [ 1, 2, command2, command3 ]);
                        done();
                    });

                it('prependCommands() should prepend to the command array', function (done) {
                        var commandQueue = newQueueFunc();
                        commandQueue.mQueue = [ 1, 2 ];
                        commandQueue.prependCommands(command2, command3);
                        commandQueue.mQueue.length.should.equal(4);
                        assert.deepEqual(commandQueue.mQueue, [ command2, command3, 1, 2 ]);
                        done();
                    });
            });


        describe('Queue processing', function () {
                // No tests for start, pause, resume as these just pass through
                // to the heartbeater functions directly.  For tests, we simulate
                // the mCommandProcessor by manually calling nextCommand() as we
                // desire for the test situation.

                it('should dump commands on clear', function(done) {
                        var commandQueue = newQueueFunc();
                        var executor = commandQueue.getExecutor();
                        commandQueue.queueCommands(command2, command3);
                        commandQueue.clear();
                        commandQueue.nextCommand();
                        executor.mExecutedCommands.length.should.equal(0);
                        done();
                    });

                it('should require a current command to send', function (done) {
                        var commandQueue = newQueueFunc();
                        var executor = commandQueue.getExecutor();
                        executor.mExecutedCommands.length.should.equal(0);
                        commandQueue.mCurrentCommand = undefined;
                        commandQueue.mOpen = true;
                        commandQueue.sendCommand();
                        executor.mExecutedCommands.length.should.equal(0);
                        done();
                    });

                it('should require an open before a command can be sent', function (done) {
                        var commandQueue = newQueueFunc();
                        var executor = commandQueue.getExecutor();
                        executor.mExecutedCommands.length.should.equal(0);
                        commandQueue.isOpen().should.be.false;
                        commandQueue.mCurrentCommand = expandedCommand;
                        commandQueue.sendCommand();
                        executor.mExecutedCommands.length.should.equal(0);
                        done();
                    });
            });


        describe('Executor calls', function () {
                it('should open when sending an open command', function (done) {
                        var commandQueue = newQueueFunc();
                        var executor = commandQueue.getExecutor();
                        executor.mOpen = false;
                        commandQueue.queueCommands(openCommand);
                        commandQueue.nextCommand();
                        commandQueue.isOpen().should.be.true;
                        executor.mOpen.should.be.true;
                        done();
                    });

                it('should close when sending a close command', function (done) {
                        var commandQueue = newQueueFunc();
                        var executor = commandQueue.getExecutor();
                        commandQueue.mOpen = executor.mOpen = true;
                        commandQueue.queueCommands(closeCommand);
                        commandQueue.nextCommand();
                        commandQueue.isOpen().should.be.false;
                        executor.mOpen.should.be.false;
                        done();
                    });

                it('should execute a simple command', function (done) {
                        var commandQueue = newQueueFunc();
                        var executor = commandQueue.getExecutor();
                        executor.mExecutedCommands.length.should.equal(0);
                        commandQueue.queueCommands(openCommand, expandedCommand);
                        commandQueue.nextCommand();
                        executor.mExecutedCommands.length.should.equal(1);
                        executor.mExecutedCommands[0].should.equal(expandedCommandString);
                        done();
                    });
                it('should execute a sequence of commands', function (done) {
                        var commandQueue = newQueueFunc();
                        var executor = commandQueue.getExecutor();
                        executor.mExecutedCommands.length.should.equal(0);
                        var commands = [openCommand, expandedCommand, command2, command3];
                        commandQueue.queueCommands(commands);
                        commandQueue.nextCommand();
                        executor.mExecutedCommands.length.should.equal(commands.length - 1);
                        assert.deepEqual(executor.mExecutedCommands,
                                         [ expandedCommandString, command2.rawCode, command3.rawCode ]);
                        done();
                    });
            });


        describe('Delay', function () {
                var delayTime = 357; // there is no significance to this number
                var deltaTolerance = 15; // +- 15ms from our expected delay is tolerable on windows
                it('should delay for ' + delayTime + ' (+-' + deltaTolerance +
                   ') ms before the next command', function (done) {
                        var commandQueue = newQueueFunc();
                        var executor = commandQueue.getExecutor();
                        var startTime;
                        var commands = [{
                                open: true,
                                postCallback : function(inCommand) {
                                    startTime = Date.now();
                                }
                            },{
                                delay : delayTime,
                                postCallback : function(inCommand) {
                                    var deltaTime = Date.now() - startTime;
                                    // Oddly this sometimes fires a bit earlier than the
                                    // requested ms.  Make sure it is within a reasonable
                                    // absolute tolerance, not just greater
                                    var deltaExpectation = Math.abs(deltaTime - delayTime);
                                    (deltaExpectation < deltaTolerance).should.be.true;
                                    done();
                                }
                            }
                        ];
                        commandQueue.queueCommands(commands);
                        commandQueue.nextCommand();
                    });
            });


        describe('Callbacks', function () {
                it('should call the preCallback before sending the command', function (done) {
                        var commandQueue = newQueueFunc();
                        var executor = commandQueue.getExecutor();
                        var executedCommandsAtPreCallback = undefined;
                        var commandId = undefined;
                        var preCallbackCommand = { rawCode : expandedCommandString, preCallback : function (inCommand) {
                                executedCommandsAtPreCallback = executor.mExecutedCommands.length;
                                commandId = inCommand.commandId;
                            }
                        }
                        commandQueue.queueCommands(openCommand, preCallbackCommand);
                        commandQueue.nextCommand();
                        should.exist(executedCommandsAtPreCallback);
                        executedCommandsAtPreCallback.should.equal(0);
                        should.exist(commandId);
                        commandId.should.equal(2); // preCallbackCommand follows 'open' (command #1)
                        executor.mExecutedCommands.length.should.equal(1);
                        done();
                    });

                it('should call the postCallback after sending the command', function (done) {
                        var commandQueue = newQueueFunc();
                        var executor = commandQueue.getExecutor();
                        var commandExecuted = undefined;
                        var commandId = undefined;
                        var postCallbackCommand = { rawCode : expandedCommandString, postCallback : function (inCommand) {
                                commandExecuted = executor.mExecutedCommands[0];
                                commandId = inCommand.commandId;
                            }
                        }
                        commandQueue.queueCommands(openCommand, postCallbackCommand);
                        commandQueue.nextCommand();
                        should.exist(commandExecuted);
                        should.exist(commandId);
                        commandId.should.equal(2); // postCallbackCommand follows 'open' (command #1)
                        commandExecuted.should.equal(expandedCommandString);
                        done();
                    });

                it('should call the processData func', function (done) {
                        var commandQueue = newQueueFunc();
                        var executor = commandQueue.getExecutor();
                        var dataPassed = undefined;
                        var commandId = undefined;
                        var processDataCommand = { rawCode : expandedCommandString,
                                                   processData : function (inCommand, inData) {
                                dataPassed = inData;
                                commandId = inCommand.commandId;
                                return true;
                            }
                        };
                        commandQueue.queueCommands(openCommand, processDataCommand);
                        commandQueue.nextCommand();
                        should.exist(dataPassed);
                        dataPassed.should.equal(okData);
                        should.exist(commandId);
                        commandId.should.equal(2); // processDataCommand follows 'open' (command #1)
                        done();
                    });

                it('should continue processing data until processData returns true', function (done) {
                        var dataArray = ['abc', 'def', 'ghi'];
                        var dataSeen = [];
                        var executor = {
                            open    : function (inDoneFunc) { inDoneFunc(true); },
                            execute : function (inRawCommand, inDataFunc, inDoneFunc) {
                                _.each(dataArray, function (inData) {
                                        inDataFunc(inData)
                                    });
                            }
                        };
                        var processDataCommand = { rawCode : expandedCommandString,
                                                   processData : function (inCommand, inData) {
                                dataSeen.push(inData);
                                return (inData === dataArray[1]); // end on the second batch
                            }
                        };

                        var commandQueue = new CommandQueue(executor);
                        commandQueue.queueCommands(openCommand, processDataCommand);
                        commandQueue.nextCommand();
                        assert.deepEqual(dataSeen, dataArray.slice(0,2));
                        done();
                    });
            });
    });
