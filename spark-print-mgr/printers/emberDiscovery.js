var util = require('util')
, events = require('events')
, _ = require('underscore')
, logger = require('../logging/PrintManagerLogger')
, deviceMonitor = require('./deviceMonitor')
, DeviceData = require('./deviceData');
var devices = {};
var EVENT_DELAY = 4000;

// Made an array in case we want to support future 
// Embers with a different vid pid pair
var EMBER_VID_PIDS = [
    { VID : 10883, PID : 2305 }
];

function EmberDiscovery () {
    events.EventEmitter.call(this);
}

util.inherits(EmberDiscovery, events.EventEmitter);

EmberDiscovery.prototype.start = function() {
    var that = this;
    logger.info('started EmberDiscovery');
    if (!deviceMonitor.discovery['usb']) {
        deviceMonitor.addDiscovery('usb');
        usb.start();
    }
    var usb = deviceMonitor.discovery['usb'];

    if (usb) {
        usb.on('deviceUp', function (inDeviceData) {
            logger.debug('Ember discovery got deviceUp: ', inDeviceData);
            if (isEmber(inDeviceData)) {
                logger.debug('looks like it is a USB attached ember printer');
                
                var newDeviceData = new DeviceData("Ember", 
                    inDeviceData.identifier, 'ember',  { address : "http://192.168.7.2"});
                devices[newDeviceData.identifier] = newDeviceData;
                
                //looks like EVENT_DELAY is enough time for the Ember printer to get ready
                //anything less, and the status query fails.

                setTimeout(function () {
                    that.emit('deviceUp', newDeviceData);
                }, EVENT_DELAY);
                
            }
        });

        usb.on('deviceDown', function (inDeviceData) {
            logger.debug('Ember discovery got deviceDown: ', inDeviceData);
            if(isEmber(inDeviceData)) {
                logger.debug('looks like it is a USB attached ember printer');
                if(devices[inDeviceData.identifier]) {
                    //be symmetric to deviceUp for the delay
                    setTimeout(function (){
                        that.emit('deviceDown', devices[inDeviceData.identifier]);
                    }, EVENT_DELAY);
                }
            }
        });
    }

};

/**
 * Returns true if deviceData matches ember's vid pid
 * @param {json object} inDeviceData - object with VID and PID parameters
 * @return {boolean}
 */
function isEmber(inDeviceData) {
    var vidPid = _.find(EMBER_VID_PIDS, function(inVidPid) {
        return inVidPid.VID === inDeviceData.VID && inVidPid.PID === inDeviceData.PID;
    });
    return vidPid !== undefined ? true : false;
}

function createDiscovery() {
    return new EmberDiscovery(); 
}

module.exports = createDiscovery();