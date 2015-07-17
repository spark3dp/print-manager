var util = require('util'),
    EventEmitter = require('events').EventEmitter
    _ = require('underscore'),
    net = require('net'),
    RPC = require('./rpc'),
    os = require('os'),
    DeviceData = require('./deviceData'),
    logger = require('../logging/PrintManagerLogger')

var SocketWrapper = function (socket){
    EventEmitter.call(this);
    this.socket = socket;
    var that = this;
    socket.on('data', function (data) {
            that.emit('message', data);
        });
    socket.on('close', function (){
            logger.debug('wrapper received close');
            this.emit('exit');
        });
};

util.inherits(SocketWrapper, EventEmitter);

SocketWrapper.prototype.send = function(data) {
    this.socket.write(data);
}

var ConveyorDiscovery = function () {
    EventEmitter.call(this);

    this.devices = {};
};

util.inherits(ConveyorDiscovery, EventEmitter);


//handler function to RPC
ConveyorDiscovery.prototype.onNotification = function (notification, params) {
    if (params) {
        if(notification === 'port_attached'){
            var deviceData = new DeviceData(params.machine_type, params.machine_name, 'conveyor');
            deviceData.model = params.machine_type;
            this.devices[deviceData.identifier.iserial] = deviceData;

            this.emit('deviceUp', deviceData);


        } else if(notification === 'port_detached') {
            var identifier = params.machine_name && params.machine_name.iserial;
            if (identifier) {
                var deviceData = this.devices[identifier];

                if (deviceData) {
                    this.emit('deviceDown', deviceData);
                }
            }
        }
    }
};

ConveyorDiscovery.prototype.init = function (){
    var that = this;

    this.client = new SocketWrapper(this.socket);
    this.rpc = new RPC.Client(this.client, 'conveyor');
    this.rpc.on('notify', _.bind(this.onNotification, this));

    logger.debug('initiating handshake; invoking hello on conveyor... waiting');

    this.rpc.invoke('hello', { username : 'ram'})
    .then(function (reply) {
            logger.debug('in CoveyorDiscovery. reply from conveyor for method hello "', reply);
            if (reply ==='world') {
                logger.info('conveyor discovery service started');
                that.ready = true;

                that.rpc.invoke('getports')
                    .then(function (reply) {
                        logger.debug('in ConveyorDiscovery. reply from conveyor for method getports "', reply);
                        for (var i = 0; i < reply.length; ++i) {
                            var printer = reply[i];

                            logger.debug('Found connected printer: ' + printer.display_name);
                            var deviceData = new DeviceData(printer.machine_type, printer.machine_name, 'conveyor');
                            deviceData.model = printer.machine_type;
                            that.devices[deviceData.identifier.iserial] = deviceData;

                            that.emit('deviceUp', deviceData);
                        }
                    });
            }
        });
};

ConveyorDiscovery.prototype.start = function () {
    logger.info('starting conveyor discovery');
    var socket = new net.Socket();
    socket.setEncoding('utf8');
    socket.on('close', function () {
        logger.debug('could not connect to conveyor, connection closed');
    });
    socket.on('error', function (e) {
        logger.debug('could not connect to conveyor, error =', e);
    });

    try {
        var platform = os.platform();
        var address;
        if ( platform == "darwin" || platform == "linux") {
            address = '/var/tmp/conveyord.socket';
        } else {
            address = 9999;
        }
        socket.connect(address, _.bind(this.init, this));
        this.socket = socket;
    } catch (e) {
        logger.debug('could not connect to conveyor, error =', e);
    }

};

module.exports = new ConveyorDiscovery();