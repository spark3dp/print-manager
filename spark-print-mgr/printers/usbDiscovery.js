var util = require('util'),
    events = require('events'),
    _ = require('underscore'),
    DeviceData = require('./deviceData'),
    logger = require('../logging/PrintManagerLogger');


var monitor, usb;
try {
    monitor = require('usb-detection');
    usb = require('usb');
} catch (ex) {
    logger.error('cannot find or initialize usb or usb-detection module');
}

var USBDiscovery = function () {
    this.mDevices = {};
};

util.inherits( USBDiscovery, events.EventEmitter );

USBDiscovery.prototype.scanForNewDevices = function() {
    var that = this;
    // USB device list takes a few milliseconds to populate after usb-detection event
    setTimeout(function() {
        var libusbDevices = usb.getDeviceList();
        //Scan through each usb device connected to the computer
        for (var i = 0; i < libusbDevices.length; i++) {
            var scanDevices = _.find(that.mDevices, function(device){
                return libusbDevices[i].deviceAddress === device.deviceAddress; 
            });

            //If there is a new usb device
            if (scanDevices === undefined) {
                var vid = libusbDevices[i].deviceDescriptor.idVendor;
                var pid = libusbDevices[i].deviceDescriptor.idProduct;
                var identifier = libusbDevices[i].deviceAddress.toString();
                var deviceData = new DeviceData(identifier, identifier, 'usb');
                deviceData.VID = vid;
                deviceData.PID = pid;
                deviceData.deviceAddress = libusbDevices[i].deviceAddress;
                that.mDevices[deviceData.deviceAddress] = deviceData;
                that.emit('deviceUp', deviceData);
            }
        }
    }, 100);
};

USBDiscovery.prototype.scanForRemovedDevices = function() {
    var that = this;
    // USB device list takes a few milliseconds to populate after usb-detection event
    setTimeout(function() {
        var libusbDevices = usb.getDeviceList();
        _.each(that.mDevices, function(device) {
            var scanDevices = _.find(libusbDevices, function(libusbDevice){
                    return device.deviceAddress === libusbDevice.deviceAddress; 
                });
            if (scanDevices === undefined) {
                if (that.mDevices[device.deviceAddress]) {
                    that.emit('deviceDown', that.mDevices[device.deviceAddress]);
                    delete that.mDevices[device.deviceAddress];
                }
            }
        });
    }, 100);
};

USBDiscovery.prototype.start = function(){
    if (!usb) return;

    var that = this;
    if (!monitor) {
        logger.info('No usb present, USBDiscovery canceled');
        return;
    }
    logger.info('started USBDiscovery');
    this.monitor = monitor;
    this.monitor.on('add', function(device, err) {
        if(err || !device){
            logger.error("add usb device error\n", err);
        } else {
            that.scanForNewDevices();
        }
    });
    
    this.monitor.on('remove', function(device, err) {
        if(err){
            logger.error("remove usb device error\n", err);
        } else {
            that.scanForRemovedDevices();
        } 
    });
    
    // Use this to detect usb devices on initial load
    // 
    this.monitor.find(function(err, devices){
        if(err){
            logger.debug('initial usb scan error:', err);
        }else{
            that.scanForNewDevices();
        }
    });
};

USBDiscovery.prototype.cleanup = function() {
    // Hooray for undocumented necessary functions!
    if (this.monitor) {
        this.monitor.stopMonitoring();
    }
};

var usbDiscovery = new USBDiscovery();

process.on('exit', _.bind(usbDiscovery.cleanup, usbDiscovery));
process.on('uncaughtException', _.bind(usbDiscovery.cleanup, usbDiscovery));

// Catches Ctrl+C event and explicitly ends the process, which we need to do
// now that we've overridden the default handlers.  Calling exit explicitly
// will cause the 'exit' event to be sent, and the USBDiscovery.cleanup()
// method to be called.
//
process.on('SIGINT', function () { process.exit(); });
process.on('SIGTERM', function () { process.exit(); });

module.exports = usbDiscovery;