/*******************************************************************************
 * serialDiscovery.js
 *
 * SerialDiscovery primarily relies on the node serialport library to track
 * what is or is not connected.
 * It uses the usb-detection library to be notified of additions and deletions
 * of devices that may be serial.
 *
 * ** NOTE **
 * Windows 10 is not supported.  It does not (currently) properly manage its
 * serialport list, listing all ports that ever had a device on them whether or
 * not they are currently plugged in.
 * This makes it impossible to tell what was plugged in or removed.
 *
 * *** DO NOT BE FOOLED ***
 * It may be extremely tempting to notice that (on all Windows platforms) the
 * usb notification object has a field called 'deviceName' that contains the
 * device followed by ' (COMx)'.
 * A whole implementation was written assuming this could be used to determine
 * the port of the device added/removed and not require serialport list
 * differencing on Windows (which then allowed us to avoid the Windows 10 bug).
 * But this is not always reliable.
 * When multiple devices are plugged in, unplugging one may yield a deviceName
 * of another, which is catastrophic when it comes to keeping track of what
 * devices are or are not plugged in.
 * So just don't trust it, as tempting as it may be.
 * It will only break your heart.
 *
 * ** OH YEAH, THAT OTHER THING **
 * Don't use usb-detection for finding out what is initially plugged in.
 * That works on OSX but on Windows if you have more than one device plugged in
 * it will only list one single device, not all of them.
 *
 * This is why we use usb-detection only for the dynamic events telling us
 * something changed.  At that point we take over and use serialport to be the
 * only reliable source of truth.
 *******************************************************************************/
var _ = require('underscore'),
    events = require('events'),
    util = require('util'),
    Heartbeat = require('heartbeater'),
    driverConfig = require('./drivers/driverConfig'),
    DeviceData = require('./deviceData'),
    logger = require('../logging/PrintManagerLogger'),
    deviceMonitor = require('./deviceMonitor');


// loading serialport and usb-detection may fail on unit tests, so surround it
// with a try
var SerialPort, monitor;
try {
    SerialPort = require('serialport');     // NEEDS LIBUSB Binaries to work
    monitor = require('usb-detection');
} catch (ex) {
    logger.warn('cannot find serialport or usb-detection modules');
}

var SerialDiscovery = function() {
    events.EventEmitter.call(this); // superclass constructor

    // Map of serial devices (for which we have config info) currently connected
    // index by com name
    this.mDevices = {};

    // Array of com names returned by SerialPort.list, used for differencing
    this.mPortList = [];
    this.baudrate = this.determineOsBaudrate();
};


util.inherits(SerialDiscovery, events.EventEmitter);


/**
 * start()
 *
 * Like USB discovery (as all supported serial devices are usb-serial) we use
 * usb-detection to detect add and remove events.
 * See the file header for why we don't trust usb-detection beyond this.
 *
 * All events (add, remove, initialize) use diffs of the list of devices from
 * the node serialport lib.
 */
SerialDiscovery.prototype.start = function(){
    var that = this;
    logger.info('started SerialDiscovery');

    if (!monitor) {
        return; // logger already errored above in this case
    }

    monitor.on('add', function (inUsbDevice, inError) {
            if (inError || !inUsbDevice) {
                logger.warn('usb-detection add error', inError);
            } else {
                setTimeout(function() {
                    that.refreshDeviceList(inUsbDevice);
                }, 250);
            }
        });

    monitor.on('remove', function(inUsbDevice, inError) {
            if (inError || !inUsbDevice) {
                logger.warn('usb-detection remove error', inError);
            } else {
                that.refreshDeviceList(inUsbDevice);
            }
        });

    // Our list starts as an empty array.  So refreshing now will generate
    // additions for each already plugged in device
    this.refreshDeviceList(undefined);
};


/**
 * recanDeviceList()
 *
 * Scan our list and diff against the previous list to determine what was added
 * or removed.
 * Process additions and deletions if they match a device configuration associated
 * with a serial device.
 *
 * Args:   inUsbDevice - *only* to be used if El Capitan fails to give us vid/pid
 *                       info in the SerialPort data
 */
SerialDiscovery.prototype.refreshDeviceList = function (inUsbDevice) {
    var that = this;

    // List all of our current ports
    SerialPort.list(function (inError, inPortDescriptorList) {
            // Build a list of comNames for differencing
            var current = inPortDescriptorList.map(function (inPortDescriptor) {
                    return inPortDescriptor.comName;
                });

            // Process any additions
            var added = _.difference(current, that.mPortList);
            added.forEach(function(inComName) {
                    var portDescriptor = _.find(inPortDescriptorList,
                                                function (inPortDescriptor) {
                            return (inPortDescriptor.comName === inComName);
                        });
                    that.portAdded(portDescriptor, inUsbDevice);
                });

            // Process any removals
            var removed = _.difference(that.mPortList, current);
            removed.forEach(function(inComName) {
                    that.comNameRemoved(inComName);
                });

            // Now update our list
            that.mPortList = current;
        });
};


/**
 * portAdded()
 *
 * A port was added.  Check to see if it matches any device type in our driver
 * config, and confirm it is not already in our list of connected devices.
 * Add it to our list of connected devices and emit a deviceUp.
 *
 * Args:   inPortDescriptor - descriptor to add
 *         inUsbDevice      - *only* to be used if El Capitan doesn't provide
 *                            vid/pid data
 */
SerialDiscovery.prototype.portAdded = function (inPortDescriptor, inUsbDevice) {
    var that = this;
    var comName = inPortDescriptor.comName;
    var device = findDeviceFromPortDescriptor(inPortDescriptor, inUsbDevice);

    // If we match a device config and are com name is not in use, add us
    if (device && !that.mDevices[inPortDescriptor.comName]) {
        device.baudrate = that.baudrate;
        if (device.blackBox) {
            that.discoverBlackBoxPrinter (inPortDescriptor, comName, device, that);
        } else {
            // Add to our list of devices
            var deviceData = makeDeviceData(inPortDescriptor, device);
            that.mDevices[comName] = deviceData;
            that.emit('deviceUp', deviceData);
        }
    }
};

/**
 * determineBaudrate()
 *
 * Choose baudrate based on the os
 *
 * returns an integer value for the baudrate
 */
SerialDiscovery.prototype.determineOsBaudrate = function() {
    var baudrate = undefined;
    switch(process.platform){
        case 'darwin':
        case 'win32':
            baudrate = 250000;
            break;
        case 'linux':
            baudrate = 230400;
            break;
        default:
            break;
    }
    return baudrate;
};

/**
 * discoverBlackBoxPrinter()
 *
 * For printer models with identical vid/pids an M501 is issued
 * to determine the build volume
 *
 * TODO: Abstract the GCode commands issued and the way the responses
 * are parsed to be writted by 3rd party
 */
SerialDiscovery.prototype.discoverBlackBoxPrinter = function (inPortDescriptor, comName, device, that) {
    var that = this;
    var deviceData;

    var portParams = {
        baudrate : that.baudrate,
        parser: SerialPort.parsers.readline('\n')
    };

    var port = new SerialPort.SerialPort(comName, portParams, false);
    port.open(function(error) {
        if (error) {
            logger.warn('Failed to open com port:', error);
        } else {
            port.on('data', function (inData) {
                    if (inData.indexOf("M211") !== -1) {
                        var x = Number(inData.split("X")[1].split(" ")[0]);
                        var y = Number(inData.split("Y")[1].split(" ")[0]);
                        var z = Number(inData.split("Z")[1].split(" ")[0]);
                        for (var i = 0; i < device.blackBoxTypes.length; i++) {
                            var bbType = device.blackBoxTypes[i];
                            if (
                                x <= bbType.dimensions[0] &&
                                y <= bbType.dimensions[1] &&
                                z <= bbType.dimensions[2]
                            ) {
                                device.description = bbType.description;
                                device.printerType = bbType.printerType;
                                device.baudrate = that.baudrate;
                                deviceData = makeDeviceData(inPortDescriptor, device);
                                that.mDevices[comName] = deviceData;
                                that.emit('deviceUp', deviceData);
                                port.close();
                                break;
                            }
                        }
                    }
                });

            port.on('close', function () {
                    logger.info(device.description + " initialization complete");
                });

            port.on('error', function (error) {
                    logger.warn("Serial discovery serialport error", error);
                });

            port.write('M501\n');
        }
    });

};

/**
 * findDeviceFromPortDescriptor()
 *
 * Pull our vid/pid from the passed in device and see if it matches anything
 * in our driver configurations.
 *
 * Args:   inPortDescriptor - a port descriptor returned by serialport
 *         inUsbDevice      - *only* to be used if El Capitan doesn't provide
 *                            vid/pid
 * Return: a driverConfig entry, if found
*/
function findDeviceFromPortDescriptor(inPortDescriptor, inUsbDevice) {
    var device = undefined;
    var vidPid = getVidPidFromPortDescriptor(inPortDescriptor, inUsbDevice);

    if (vidPid) {
        device = findDeviceFromVIDPID(vidPid.VID, vidPid.PID);
    }

    return device;
}


/**
 * getVidPidFromPortDescriptor()
 *
 * Given a portDescriptor find the vendor and product ID.
 * This can be complicated as Windows and OSX place them in different fields
 * and both are in hex not decimal.
 *
 * Args:   inPortDescriptor - a serial port descriptor
 *         inUsbDevice      - *only* to be used if El Capitan doesn't provide
 *                            vid/pid
 * Return: { VID : <vid>, PID : <pid> } if found, or undefined
 */
function getVidPidFromPortDescriptor(inPortDescriptor, inUsbDevice) {
    // OSX supports 'vendorId' and 'productId'
    var vId = inPortDescriptor.vendorId;
    var pId = inPortDescriptor.productId;

    // If those are not defined, try the pnpId (Windows populates this)
    // The pnpId is of the form: 'USB\VID_1C34&PID_5A7 otherstuff'
    if (!vId && inPortDescriptor.pnpId) {
        vId = inPortDescriptor.pnpId.replace(/^USB\\VID_([\dA-Fa-f]+)&.*$/, "$1");
    }

    if (!pId && inPortDescriptor.pnpId) {
        pId = inPortDescriptor.pnpId.replace(/^USB\\VID_[\dA-Fa-f]+&PID_([\dA-Fa-f]+)\\.*$/, "$1");
    }

    // *** BIG HACK FOR EL CAPITAN ***
    // El Capitan doesn't populate the vendor and product ID like it used to and should.
    // In this situation we can possibly salvage things by using the USB monitor device
    // info.
    // In this case, the USB monitor version of these values are already in decimal, so
    // there is no need to convert them.
    if (inUsbDevice && !vId && !pId) {
    vId = inUsbDevice.vendorId;
    pId = inUsbDevice.productId;
    } else {
    // Serial port data is stored as hex, convert to decimal and treat as a number
    vId = vId && parseInt(vId, 16);
    pId = pId && parseInt(pId, 16);
    }

    return ((vId && pId) ? { VID : vId, PID : pId } : undefined);

}


/**
 * findDeviceFromVIDPID()
 *
 * See if we can find a device configuration given a VID/PID
 *
 * Args:   inVID - vendor ID
 *         inPID - productID
 * Return: a driverConfig entry, if found
*/
function findDeviceFromVIDPID(inVID, inPID) {
    var device = undefined;
    // We have matched the USB device to a serial device  Check if it is a known
    // device in our driverConfig
    // If the device has an arbitrary PID, set it to -1 in driverConfig
    if (driverConfig.devices) {
        device = _.find(
            driverConfig.devices,
            function(device) {
                return (
                    device.VID === inVID &&
                    (device.PID === inPID || device.PID === -1)
                );
            }
        );
    }
    return device;
}


/**
 * makeDeviceName()
 *
 * Our nam is our printer name with the com port appended in parenthesis.
 *
 * Args:   inDevice  - a device configuration
 *         inComName - a com name
 * Return: string name
 */
function makeDeviceName(inDevice, inComName) {
    return (inDevice.description + ' (' + inComName + ')');
}

/**
 * makeDeviceData()
 *
 * Use makeDeviceName to form our serviceName and identifier.
 * Our type is 'serial'.
 * We draw in other values from inDevice
 *
 * Args:   inPortDescriptor - a port descriptor from SerialPort.list()
 *         inDevice         - matching device configuration
 * Return: DeviceData
 */
function makeDeviceData(inPortDescriptor, inDevice) {
    var comName = inPortDescriptor.comName;
    var name = makeDeviceName(inDevice, comName);
    var deviceData = new DeviceData(name, comName, 'serial', inDevice);
    deviceData.comName = comName;
    return deviceData;
}


/**
 * comNameRemoved()
 *
 * A port was removed with the passed com name.  Check to see if it matches any
 * device type in our list of connected devices.  If so, emit a deviceDown.
 */
SerialDiscovery.prototype.comNameRemoved = function (inComName) {
    var device = this.mDevices[inComName];
    if (device) {
        this.emit('deviceDown', device);
        delete this.mDevices[inComName];
    }
};


module.exports = new SerialDiscovery();
