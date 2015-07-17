var util = require('util'),
    events = require('events'),
    _ = require('underscore'),
    logger = require('../logging/PrintManagerLogger'),
    when = require('node-promise').when,
    Promise = require('node-promise').Promise,
    request = require('request'),
    DeviceData = require('./deviceData')

try { var mdns = require('mdns'); }
catch (ex){ logger.error("cannot find mdns"); }

try { var mdnsjs = require('mdns-js'); } 
catch (ex){ logger.error("cannot find mdns-js"); }


var devices = {};

function BonjourDiscovery () {
    events.EventEmitter.call(this);
    var that = this;

    this.on('serviceUp', function(service) {
        logger.debug("service: " + service);
        logger.debug("service.addresses: " + service.addresses);
        var data = that.getDeviceData(service);

        when(data, function (deviceData) {
                if (deviceData) {
                    if(_.contains(devices, deviceData.address)) {
                         logger.debug(service.name, 'has already been added as:', _.find(devices, deviceData.address));
                    } else {
                        devices[deviceData.address] = deviceData;
                        that.emit('deviceUp', deviceData);
                    } 
                } else {
                    logger.debug('deviceData not found for', service.name);
                    logger.debug(service.name, 'is not a 3D printer');
                }
            });
    });

    this.on('serviceDown', function(service) {
        logger.debug("service: " + service);
        var deviceData = that.getDeviceData(service);

        when(deviceData, function (deviceData) {
                if (deviceData) {
                    that.emit('deviceDown', deviceData);
                }
            });
    });

    this.on('start', function (){
        logger.info('started BonjourDiscovery');
    });

    this.on('error', function (e){
        logger.debug('bonjour discovery error : ', e);
        logger.error('BonjourDiscovery could not be started');
    });
}

util.inherits(BonjourDiscovery, events.EventEmitter);

BonjourDiscovery.prototype.getDeviceData = function(service) {
    //todo: allow ember discovery as well
    return this.getOctoprintData(service);
};

BonjourDiscovery.prototype.getOctoprintData = function(service) {
    logger.debug('getoctoprintdata, service=', service);
    var promise = new Promise();
    if (service.port === 5000) {
        var serviceName = service.name;
        var apipath = 'api';
        if (service.fullname.substr(0,6) === "series") {  
            if (!serviceName) {
                serviceName = "Type A S" + service.fullname.substr(1,11);
            }
            apipath = 'ajax';
        } else {
            if (!serviceName) {
                serviceName = service.fullname.substr(0,service.fullname.indexOf(" "));
            }
        }

        //if still dont have serviceName, just copy fullname
        if(!serviceName){
            serviceName = service.fullname;
        } 

        var address = 'http://' + retrieveIPV4(service.addresses) + ':' + service.port;
        
        var deviceData = new DeviceData(serviceName, address, 'octoprint');

        deviceData.address = address;

        var url = deviceData.address + '/' + apipath + '/settings';
        request.get({ url : url, timeout : 1000}, function (err, response, body) {
                if (!err && response.statusCode === 200) {
                    var settings = JSON.parse(body);
                    logger.debug('got settings=', settings);
                    logger.debug('got api', settings.api);

                    var apikey = settings.api && settings.api.enabled && settings.api.key;
                    var url = deviceData.address + '/api/state';
                    if (apikey) {
                        url+='?apikey=' + apikey;
                    }

                    logger.debug('state ulr=', url);
                    request.get(url, function (err, response, body) {
                            logger.debug('state api, err=', err);
                            logger.debug('state api, response.statusCode=', response.statusCode);
                           
                            if (!err && response.statusCode === 200) {
                                promise.resolve(deviceData);
                            } else {
                                promise.resolve();
                            }
                        });
                } else {
                    //no device data
                    promise.resolve();
                }
            });
    } else {
        //no device data
        promise.resolve();
    }

    return promise;
};

BonjourDiscovery.prototype.example_typea = function() {
     //real printer type A 1194
     var service = {};
     service.type = 'octoprint';
     service.port = 5000;
     service.addresses = ["10.140.69.166"];
     service.name = 'series1 - 1194 [Series 1]';
     service.fullname = service.name;
     var that = this;
     //up a service to test. 
     this.emit('serviceUp', service);
 };

 BonjourDiscovery.prototype.example_octopi = function() {
     //real printer type A 1194
     var service = {};
     service.type = 'octoprint';
     service.port = 5000;
     service.addresses = ["localhost"];
     service.name = 'Octopi';
     service.fullname = "Printerbot (Octopi)";

     //up a service to test. 
     this.emit('serviceUp', service);
 };

BonjourDiscovery.prototype.examples = function() {
    this.example_typea();
    //this.example_octopi();
};

function MDNSDiscovery(){
    BonjourDiscovery.call(this);
    var that = this;
    try{
        this.browser = mdns && mdns.createBrowser(mdns.tcp('http'));
        if(this.browser){
            this.browser.on('serviceUp', function(service) {
                    that.emit('serviceUp', service);
                });

            this.browser.on('serviceDown', function(service) {
                    that.emit('serviceDown', service);
                });

            this.browser.on('error', function(error) {
                that.emit('error', error);
            });
        } else {
            this.emit('error', 'could not create Bonjour discovery');
        }
    } catch (e) {
         this.emit('error', e);
    }
}


util.inherits(MDNSDiscovery, BonjourDiscovery);

MDNSDiscovery.prototype.start = function() {
    try{
        if(this.browser){
            this.browser.start();
            this.emit('start');
            //this.examples();
        }
        
    } catch (e){
        this.emit('error', e);
    }
};


function MDNSJSDiscovery(){
    BonjourDiscovery.call(this);
   var that = this;

    this.ready = new Promise();
    
    when(this.ready, function (ready){
        that.ready = true;
    });

    try{
        this.browser = mdnsjs && mdnsjs.createBrowser(mdnsjs.tcp('http'));
        if(this.browser){
            this.browser.on('ready', function () {
                logger.debug('mdns js brower is ready');
                that.ready.resolve(true);
            });

            this.browser.on('error', function(error) {
                logger.debug('mdns js brower is errord');
                that.ready.resolve(false);
                that.emit('error', error);
            });

        } else {
            this.emit('error', 'could not create Bonjour discovery');
        }
    } catch (e) {
        logger.error('mdsnjs failed to start', e);
        this.emit('error', e);
    }
}


util.inherits(MDNSJSDiscovery, BonjourDiscovery);

MDNSJSDiscovery.prototype.start = function() {
    var that = this;
    try{
        if(this.browser){
            when(this.ready, function (ready){
                logger.debug('register for mdnsjs update');
                that.browser.on('update', function (service) {
                    if(service.query && service.query.length == 1 
                        && _.contains(service.query, '_http._tcp.local')
                        && service.type && service.type.length > 0 
                        && service.type[0].name === 'http'
                        && service.type[0].protocol === 'tcp'
                    ) {
                        logger.debug('service type=',service.type, 'typeof=', typeof(service.type));
                        logger.debug('mdnsjs service=', service);//todo:transform service data
                        var s = service;
                        that.emit('serviceUp', s);
                    }
                    //that.emit('serviceDown', s);
                });

                
                that.browser.discover();
                //that.examples();
                that.emit('start');

            }, function (reason){
                that.emit('error', 'could not start Bonjour discovery');
            });


        } else {
            this.emit('error', 'could not create Bonjour discovery');
        }
        
    } catch (e){
        this.emit('error', e);
    }
};

function createDiscovery(){
    if(mdns){
        logger.debug('creating MDNSDiscovery');
        return new MDNSDiscovery(); 
    } else {
        logger.debug('creating MDNSJSDiscovery');
        return new MDNSJSDiscovery(); 
    } 
}

//Input: An array of addresses (A bonjour service may have an array of two addresses, the IPV4 and IPV6 address)
//Output: The IPV4 address
//This funtion prevents bonjourDiscovery from using an IPV6 address
function retrieveIPV4(addresses){
    for(var i = 0; i < addresses.length; i++){
        if (/^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(addresses[i])){
            return addresses[i];
        }
    }
};

module.exports = createDiscovery();