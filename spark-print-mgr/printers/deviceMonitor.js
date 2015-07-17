var util = require('util'),
    events = require('events'),
    _ = require('underscore'),
    config = require('../config').config,
    DiscoveryFactory = require('./discoveryFactory'),
    logger = require('../logging/PrintManagerLogger');

var DeviceMonitor = function(list) {
    this.discovery = {};
};

util.inherits(DeviceMonitor, events.EventEmitter);

DeviceMonitor.prototype.addDiscovery = function(discovery) {
    logger.debug('adding discovery to DeviceMonitor: ', discovery);
    if(!this.discovery[discovery]){
        var d = DiscoveryFactory.create(discovery);
        if(d){
            d.on('deviceUp', _.bind(this.onDeviceUp, this));
            d.on('deviceDown', _.bind(this.onDeviceDown, this));
            this.discovery[discovery] = d;
        }
    }
};

DeviceMonitor.prototype.onDeviceUp = function(deviceData) {
    logger.debug('devicemonitor got deviceUp event:', deviceData);
    this.emit('deviceUp', deviceData);
};

DeviceMonitor.prototype.onDeviceDown = function(deviceData) {
    logger.debug('devicemonitor got deviceDown event:', deviceData);
    this.emit('deviceDown', deviceData);
};

DeviceMonitor.prototype.init = function(list) {
    logger.info('initialized device monitor');
    this.services = list || config.device_discovery_services;
    _.each(this.services, this.addDiscovery, this);
};

DeviceMonitor.prototype.start = function() {
    var that = this;
    _.each(this.discovery, function(value, key, list) { value.start(that)});
};

module.exports = new DeviceMonitor();

// Need to stop monitoring when exiting or the process refuses to die.


