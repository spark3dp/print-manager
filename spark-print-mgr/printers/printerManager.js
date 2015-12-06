var _ = require('underscore'),
    url = require('url'),
    Errors = require('../error/Errors'),
    printertypes = require('../printertypes'),
    validator = require('../utils/validator'),
    Datastore = require('nedb'),
    appSettings = require('../config').appSettings,
    path = require('path'),
    logger = require('../logging/PrintManagerLogger'),
    deviceMonitor = require('./deviceMonitor'),
    PrinterUtil = require('./printerUtil'),
    ConnectionFactory = require('./connectionFactory'),
    Printer = require('./printer'),
    Promise = require('node-promise').Promise,
    all = require('node-promise').all,
    when = require('node-promise').when,
    router = require('express').Router(),
    Commmand = require('./command');
//todo: write PrinterManager class and move things under it


var printers = {};
var db;

function onDeviceUp(deviceData) {
    logger.debug("printer manager got event Device up");
    var s = validateDeviceData(deviceData);
    if(!s.success){
        logger.warn(s.error);
        return;
    }

    var type = PrinterUtil.getPrinterType(deviceData);
    var printerTypeId = type && type.id;
    if (printerTypeId) {
        db.find({type_id: printerTypeId}, function (err, docs) { // TODO: match printer-specific data
            var doc = (docs && 0 < docs.length) ? docs[0] : null,
                printerName;

            if (doc) {
                printerName = doc.printer_name;
            } else {
                var printerType = printertypes.find(printerTypeId);
                printerName = printerType && printerType.name;
            }
            when(createPrinter(deviceData, printerTypeId), function (p) {
                if (p) {
                    logger.debug('discovered printer: ', p.id, ' successfully!');
                    addPrinter(p, !doc);
                    if (doc) {
                        db.update({_id: doc._id}, {$set: {printer_id: p.id}});
                    }
                }
            }, function () {
                logger.debug('cannot add printer');
            });

        });
    }
}

function deletePrinter (p){
    if(p){
        p.__connection.disconnect();
        delete printers[p.id];        
    }
}

function onDeviceDown(deviceData) {
    logger.debug("Device down: ", deviceData);
    var p = getPrinterFromDeviceData(deviceData);
    if (p) {
        deletePrinter(p);
    }
}

function initializeDeviceMonitor () {
    deviceMonitor.init();
    deviceMonitor.on('deviceUp', onDeviceUp);
    deviceMonitor.on('deviceDown', onDeviceDown);
    deviceMonitor.start();
}

var gNRetries = 10; // Retry registering saved printers 10 times
var gRetryDuration = 10000; // Wait 10 seconds between each attempt

function initialize() {
    db = new Datastore({filename: path.join(appSettings.APP_DB_FOLDER, 'printers.db'), autoload: true});
    db.persistence.setAutocompactionInterval(1000*60*60*24); // Once per day (ms)
    registerSavedPrinters(function(){
        logger.info('All database printers have been initialized');
        initializeDeviceMonitor();
    });

    for (var i = 1; i <= gNRetries; i++) { 
        setTimeout(function () {
            registerSavedPrinters();
        }, i * gRetryDuration);
    }
}

function registerSavedPrinters(initializeFunc) {
    var promiseArray = [];
    db.find({}, function (err, docs) {
        if (docs && 0 < docs.length) {
            docs.forEach(function (doc) {
                var deviceData = doc.deviceData;
                if (deviceData && deviceData.address) {
                    var params = {
                        type_id: doc.type_id,
                        printer_name: createPrinterName(doc.printer_name),
                        address: deviceData.address
                    };
                    var promise = when(registerLocalPrinter(params, {save: false}), 
                                       function (printer) {
                                           logger.info('reconnected to the saved printer', printer.name);
                                           db.update({_id: doc._id}, {$set: {printer_id: printer.id}});
                                           return true;
                                       },
                                       function(reason) {
                                           logger.warn(reason);
                                           return true;
                                       });
                    promiseArray.push(promise);
                }
            });
        }
    });
    all(promiseArray).then(function() {
        if(initializeFunc){
            initializeFunc();
        }
    });
}

function getPrinters(filter) {
    return _.where(printers, filter);
}

function getPrinter(id) {
    logger.debug('getPrinters of id ' + id);
    var p = printers[id];
    return p;
}

function addPrinter (printer, save) {
    logger.debug('adding printer:' + printer.id);
    printers[printer.id] = printer;
    if (save) {
        db.insert({
            type_id: printer.type_id,
            printer_name: printer.name,
            deviceData: printer.__deviceData,
            printer_id: printer.id
        });
    }
}

function createPrinter(deviceData, printerType, name, data) {
    var promise = new Promise();

    var type_id = printerType;
    var printername = name;

    logger.debug('no duplicate for devicedata. proceed to add...');
    //create a connection.
    var connection = ConnectionFactory.getConnection(deviceData);
    logger.info('connecting to:' + connection.deviceData.serviceName);
            
    when(connection.connect(), function (result) {
            logger.debug('command connect result=', result);

            if (result.success) {
                var printer = getPrinterFromDeviceData(connection.deviceData);
                if (printer) {
                    logger.debug('printer already exists!');
                    promise.reject({reason : 'printer already exists', printer : printer.id});
                } else {
                    logger.debug('connection connected. proceed to add the printer');

                    //get printer type
                    type_id = type_id || PrinterUtil.getPrinterType(deviceData);

                    //create a unique name
                    //todo: send printerinfo.name that you get from getPrinterInfo.
                    var printerData = printertypes.find(printerType);
                    if (!printername) {
                        printername = printerData.name;
                    }
                    printername = createPrinterName(printername);

                    if (connection && type_id && printername) {
                        logger.debug('in createprinter, calling new Printer', printername);
                        //create printer.
                        var p = new Printer(printername, type_id, connection, undefined, data);
                        p.__deviceData = deviceData;

                        // Verify that new printer has a default profile and material
                        if (p.default_material_id && p.default_profile_id) {
                            promise.resolve(p);
                        } else {
                            promise.reject("Invalid printer data for " + printername);
                        }

                    } else {
                        logger.warn('missing information: type_id, printername', type_id, printername);
                        promise.reject(result);
                    }
                }
            } else {
                promise.reject({error : result.error || 'could not connect to the device.'});
            }
        });

    return promise;
}

/**
 * Returns a unique printer name, which if there are conflicts, has the form "some name (2)"
 * @param {string} name - printer name
 * @returns {string} new unique printer name
 */
function createPrinterName(name) {
    var i = 1,
        basename = name;

    while (true) {
        if (_.every(printers, function (printer) {
            return printer.name !== name;
        })) {
            return name;
        }

        i++;
        name = basename + ' (' + i + ')';
    }
}

function getPrinterFromDeviceData(deviceData) {
    var printers = getPrinters();
    if (deviceData && printers) {
        var p = _.find(printers, function (printer) {
            return  printer.__deviceData                            && 
                    printer.__deviceData.type === deviceData.type   &&
                    printer.__deviceData.identifier                 && 
                    printer.__deviceData.identifier === deviceData.identifier;
        });


        if(p) {
            logger.debug('found printer', p.id, 'from devicedata', deviceData);
        } else {
            logger.debug('did not find printer from deviceData', deviceData);
        }
        return p;
    } 
}


function validatePrinterTypeData(type_id) {
     if (!type_id) {
        return { success : false, error : 'No printer type'};
    }

    var printerType = printertypes.find(type_id);
    if (!printerType) {
        return { success : false, error : 'Unknown printer type ' + type_id};
    }

    // For now, only allow Ember and Type A Series 1 printers to be registered.
    // We hardcode the printer type ids here, not the nicest solution.
    //
    if (printerType.id.toUpperCase() !== '7FAF097F-DB2E-45DC-9395-A30210E789AA' &&
        printerType.id.toUpperCase() !== 'F2F4B9B6-1D54-4A16-883E-B0385F27380C') {
        logger.debug('not octoprint or ember, reject');
        return { success : false, error : 'Unsupported printer type'};
    } else {
        logger.debug('octoprint or ember, select');
    }
    return printerType;
}


function validateDeviceData(deviceData) {

    logger.debug('validating deviceData');
    if(getPrinterFromDeviceData(deviceData)) {
        return { success : false, error : 'Printer already exists' };
    }
    return { success : true };  
}

function validatePrinterParams(params) {
    logger.debug('in validatePrinterParams, params=', params);
    
    if (!params) {
        return { success : false, error : 'No parameters specified'};
    }

    // Make sure the printer type is valid.
    //
    var printerType = validatePrinterTypeData(params.type_id);
    if(!printerType){
        error = 'cannot get printer type from id';
        logger.warn(error);
        return { success : false, error : error };
    }
    
    // If no printer name specified, use printer type name.
    // Make sure name is unique.
    //
    if (!params.printer_name) {
        params.printer_name = createPrinterName(printerType.name);
    }


    if (!_.every(printers, function (printer) {
        return printer.name !== params.printer_name;
    })) {
        return { success : false, error : 'Name already exists'};
    }

    var deviceDataType;
    params.deviceData = params.deviceData || {};


    // Make sure the address is specified and unique.
    // address is currently unvalidated.
    //
    var printerType;
    if (params.deviceData && (params.deviceData.type === 'virtual')) {
        
        deviceDataType = 'virtual';
        if (params.name) {
            params.printer_name = params.name;
        }
        printerType = 'virtual';
        params.deviceData.identifier = params.printer_name;
        
    } else {
        if (!params.address) {
            return {success: false, error: 'No printer address'};
        }
        // Make sure it starts with http
        if (params.address.indexOf('http') !== 0) {
            params.address = 'http://' + params.address;
        }
        printerType = printertypes.find(params.type_id);
        if (printerType.id.toUpperCase() === '7FAF097F-DB2E-45DC-9395-A30210E789AA') {
            deviceDataType = 'ember';
        } else if (printerType.id.toUpperCase() === 'F2F4B9B6-1D54-4A16-883E-B0385F27380C') {
            deviceDataType = 'octoprint';
        }
        
        params.deviceData.address = params.address;
        params.deviceData.identifier = params.address;
    }

    params.deviceData.type = deviceDataType;
    params.deviceData.serviceName = printerType.name;
    
    var s = validateDeviceData(params.deviceData);
    if(!s.success){
        logger.debug(s.error);
        return s;
    }

    delete params.address;
    logger.debug('leaving validatePrinterParams, params=', params);
    return { success : true};
}

function registerLocalPrinter(params, options) {
    logger.debug('in registerLocalPrinter');
    var promise = new Promise();
    var result = validatePrinterParams(params);
    logger.debug('validatePrinterParams result=', result);
    
    if (result.success) {
        logger.debug('printer passed params validation:', result);

        var deviceData = params.deviceData;
        logger.debug('calling createPrinter with deviceData=', deviceData, 'params=', params);

        when(createPrinter(deviceData, params.type_id, params.printer_name, _.omit(params, ['type_id', 'deviceData', 'printer_name'])),
             function (p) {
                 logger.info('created printer: ', p && p.name, ' successfully!');
                 addPrinter(p, options.save);
                 promise.resolve(p);
             },
             function(error) {
                 logger.warn("could not create printer, ", error);
                 promise.reject(error);
             });
    } else {
        promise.reject(result.error);
    }
    
    return promise;
}

/**
 * This endpoint POST /print/printers/local adds a printer (Ember or Type A only)
 * to Print Manager. It is a workaround if Bonjour is not enabled on the network.
 *
 * This api is for use by Print Manager Console only. It should be undocumented
 * and not added to cloud services.
 */
router.post('/local', function(req, res, next) {
    var params = req.body;
    delete params.id; // Don't allow endpoint to set printer id

    when(registerLocalPrinter(req.body, {save: true}), function (printer) {
        if (printer) {
            res.status(200);
            res.send({registered: true, printer_id: printer.id});
        } else {
            res.status(422);
            res.send({registered: false});
        }    
    }, function (reason) {
        res.status(400);
        res.send({registered: false, error: reason});
    });

});

router.get('/status/:id', function (req, res, next) {
    var id = req.params.id;

    if (!id) {
        return next(new Errors.Request.BadRequestError('id is missing', 400));
    }

    if (!validator.isUUID(id)) {
        return next(new Errors.Request.BadRequestError('id must be a UUID', 400));
    }

    var p = getPrinter(req.params.id);

    if (!p) {
        return next(new Errors.Request.NotFoundError('Printer is not found', 401));
    }

    logger.debug(' in /status/:id with printer' + p.id);
    var promise = p.__connection.getStatus();
    promise.then(
        function (data) {
            res.status(200);
            res.send(data);
        },
        function(reason) {
            logger.error('get status failed with reason: ' + reason);
            res.status(422);
            res.send(reason);
        }
    );
});

router.use('/:id', function (req, res, next) {
    var id = req.params.id;

    if (!id) {
        return next(new Errors.Request.BadRequestError('id is missing', 400));
    }

    if (!validator.isUUID(id)) {
        return next(new Errors.Request.BadRequestError('id must be a UUID', 400));
    }

    var p = getPrinter(req.params.id);
    if (p && p.id === req.params.id) {
        req.printer = p;
        next();
    } else {
        return next(new Errors.Request.UnauthorizedError('Printer is not registered for the member', 401));
    }
});

/**
 * This endpoint PUT /print/printers/local edits a printer's name.
 * It is for use by Print Manager Console only.
 *
 * This api is for use by Print Manager Console only. It should be undocumented
 * and not added to cloud services.
 */
router.put('/:id/local', function (req, res, next) {
    var printer = req.printer,
        params = req.body;

    function fail(reason) {
        res.status(400);
        res.send(reason);
    }

    if (params.printer_name && params.printer_name !== printer.name) {
        if (!_.every(printers, function (p) {
            return p.id === printer.id || p.name !== params.printer_name;
        })) {
            fail('Name already exists');
            return;
        }

        printer.name = params.printer_name;
        db.update({printer_id: printer.id}, {$set: {printer_name: params.printer_name}});
    }

    res.status(204);
    res.send();
});

router.get('/', function (req, res, next) {
    var query = url.parse(req.url, true).query;
    var printers = getPrinters(query);

    res.status(200);
    res.send({printers: _.map(printers, function (printer) {
        var address = printer.__deviceData.address;
        if (address) {
            printer.address = address;
        }
        return printer.asJSON();
    })});
});

router.delete('/:id', function (req, res) {
    logger.debug('deleting printer', req.printer.id);
    deletePrinter(req.printer);
    db.remove({printer_id: req.printer.id});
    res.status(204);
    res.send();
});

router.get('/:id', function(req, res, next) {
    res.status(200);
    var address = req.printer.__deviceData.address;
    if (address) {
        req.printer.address = address;
    }
    res.send(req.printer.asJSON());
});


/**
* "/:id/jobs/:job_id" [PUT]
* Start a queued Print Job for a printer
*   
* Note: This API forwards calls to command API with {command : 'print', job_id : <id>}
*/
router.put('/:id/jobs/:job_id', function (req, res, next) {
    
    req.url = '/' + req.params.id + '/command';
    req.method = 'post';
    
    req.body = req.body || {};
    req.body.command = 'print';
    req.body.job_id = req.params.job_id;
    
    logger.debug('new url =', req.url);
    logger.debug('req.body=', req.body);
    next('route');
});

router.post('/:id/command', function (req, res, next) {
    var p = req.printer;
    var command = req.body && req.body.command;
    
    var promise = new Promise();
    if (!command) {
        logger.warn('command not specified for the printer', req.params.id);
        promise.reject({success : false, error : 'no command specified'});
    } else {
        logger.debug('execute command', command, 'for the printer', req.params.id);

        //handle getStatus/Status etc
        if(command.toLowerCase().indexOf('status') !== -1){
            logger.debug('changed command from ', command, 'to ', Command.GET_STATUS);
            command = Command.GET_STATUS;
        }

        switch (command) {
        case Command.STATUS:
        case Command.GET_STATUS:
            when(p.__connection.getStatus(_.omit(req.body, 'command')), function(result) {
                    promise.resolve(result);
                });
            break;
        case Command.CONNECT:
        case Command.DISCONNECT:
            when(p.__connection[command](), function(result) {
                    promise.resolve(result);
                });
            break;
        default:
            logger.debug("sending generic command", command);
            when(p.__connection.command(command, _.omit(req.body, 'command')), function(result) {
                    promise.resolve(result);
                }, function (reason){
                    promise.reject(reason);
                });
        }
    }

    promise.then(function (data) {
        res.status(200);
        res.send(data);
    },
    function (reason) {
        res.status(422);
        res.send(reason);
    });
});



function clearSavedPrintersDb() {
    if (db) {
        db.remove({}, {multi: true});
        db.persistence.compactDatafile();
    }
}

function cleanup(){
    _.each(printers, function(printer){
            logger.info("Disconnecting printer", printer.__deviceData.serviceName);
            printer.__connection.disconnect();
        }
    );
}

module.exports = {
    Router: function () {
        return router;
    },
    getPrinters: getPrinters,
    addPrinter: addPrinter,
    initialize: initialize,
    cleanup: cleanup,
    clearSavedPrintersDb: clearSavedPrintersDb
};
