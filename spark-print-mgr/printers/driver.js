var extend = require('util')._extend,
    logger = require('../logging/PrintManagerLogger'),
    vm = require('vm'),
    fs = require('fs'),
    jrs = require('jsonrpc-serializer'),
    _ = require('underscore'),
    RPC = require('./rpc'),
    when = require('node-promise').when;

var MAX_ID = 0;

var args = process.argv.slice(2);
var path = args && args[0];
var data = args && args.slice(1);

// Allow one second for cleanup before killing the child process
process.on('SIGINT', function (){
    setTimeout(function (){
        process.exit();
    }, 1000);
    logger.debug('SIGINT called in driver process');
});

var Wrapper = function (path, dataString){
    logger.debug('in Wrapper, path=', path, ', dataString=', dataString);
    if(path) {
        try {
            var Driver = this.safe_require(path, []);
            this.driver = Driver(JSON.parse(dataString));
            if(this.driver){
                logger.debug('created driver: ', this.driver && this.driver.name);
                this._init_driver(this.driver); 
            } else {
                throw new Exception("could not load the driver");
            }
        } catch (e) {
            logger.error('rogue driver. instantiation prohibited. ', e.stack);
        }
    } else {
        this.rpc.notify( "information", { message : 'failed to install driver' });
    }
};

Wrapper.prototype._init_driver = function(driver){
    if(driver){
        logger.debug('initializing rpc with the driver');
        this.rpc = new RPC.Server(process, driver, 'child');
        logger.debug('rpc=', this.rpc.name);

    //dont need to emit ready as the driver constructor is doing the same.
    // when(this.driver.status(), function (result){
    //   if(result.status){
    //    this.driver.emit('event', Status.State.READY);
    //   }
    // }, function (){});
    }
};

Wrapper.prototype.safe_require = function(mod, modules) {
    var code    = fs.readFileSync(require.resolve(mod));
    var sandbox = {
        console : console,
        module  : {},
        require : function(mod) {
            logger.debug('driver script requires ', arguments[0]);
            return require.apply(this, arguments);
        }
    };

    vm.runInNewContext(code, sandbox, __filename);
    return sandbox.module.exports;
};

var wrapper = new Wrapper(path, data);
