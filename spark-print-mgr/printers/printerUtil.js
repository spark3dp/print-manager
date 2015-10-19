var _ = require('underscore'),
    driverConfig = require('./drivers/driverConfig'),
    logger = require('../logging/PrintManagerLogger'),
    printerTypes = require('../printertypes');

function getDriverInfo(deviceData) {
    // locate and return driver
    if (!deviceData)
        return;

    switch (deviceData.type) {
    case 'octoprint':
        return { driverPath : './drivers/octoprint'};
    case 'ember':
        return { driverPath : './drivers/ember'};
    case 'virtual':
        return { driverPath : './drivers/virtualPrinter' };

        // USB and Serial get their device data from deviceConfig.json
        // If the device has an arbitrary PID, set it to -1 in driverConfig
    case 'usb':
    case 'serial':
        var driver = _.find(
            driverConfig.devices,
            function(device) {
                return (
                    deviceData.VID === device.VID &&
                    (deviceData.PID === device.PID || deviceData.PID === -1)
                );
            });
        if (driver && driver.driverPath) {
            return { driverPath : driver.driverPath };
        } else {
            break;
        }
    case 'conveyor':
        return { driverPath : './drivers/conveyor'};
    default:
        break;
    }
}

function getPrinterType(deviceData) {
    // magically figure out which printertype is to be picked up.
    // may be we can keep a map somewhere
    var typeId;
    switch (deviceData.type) {
    case 'octoprint':
        if (deviceData.serviceName.toLowerCase().indexOf('series') !== -1) {
            typeId = 'F2F4B9B6-1D54-4A16-883E-B0385F27380C';
        } 
        /*
        else if (deviceData.serviceName.toLowerCase().indexOf('printrbot') !== -1) {
            typeId = 'F2F4B9B6-1D54-4A16-883E-B0385F27380C'; //using reprap as printrbot is not defined
        } else {
            typeId = 'F2F4B9B6-1D54-4A16-883E-B0385F27380C';
        }
        */
        break;

        // USB and Serial look up the printerType value in the driverConfig.json
    case 'usb':
    case 'serial':
        var device = _.find(driverConfig.devices, function(device) {
                return ((deviceData.type === device.type) &&
                        (deviceData.VID === device.VID) &&
                        (deviceData.PID === device.PID));
            });
        if (device) {
            typeId = device.printerType;
        }
        break;
    case 'ember':
        typeId = '7FAF097F-DB2E-45DC-9395-A30210E789AA';
        break;
    
    case 'conveyor':
        if (deviceData.serviceName.toLowerCase().indexOf('replicator 2x') !== -1) {
            typeId = '367012CF-2533-44C7-AD11-9FCD1ED9F2FC';
        } else if (deviceData.serviceName.toLowerCase().indexOf('replicator 2') !== -1) {
            typeId = 'F2F4B9B6-1D54-4A16-883E-B0385F27380D';
        }
        break;
    
    default:
        logger.warn('Unknown printer:', deviceData);
    }

    return (typeId && printerTypes.find(typeId));
}

module.exports.getDriverInfo = getDriverInfo;module.exports.getPrinterType = getPrinterType;