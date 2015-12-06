var Promise = require("node-promise").Promise,
    when = require("node-promise").when,
    _ = require('underscore'),
    events = require('events'),
    util = require('util'),
    jrs = require('jsonrpc-serializer'),
    logger = require('../logging/PrintManagerLogger')


// todo: make rpc accept stream instead of process.
//todo: split RPC into client and server

var RPC = function (proc, name) {
    events.EventEmitter.call(this);
    this.proc = proc;
    this.name = name;

    this.map = {};
    this.MAX_ID = 1;
};

util.inherits(RPC, events.EventEmitter);

RPC.prototype.DELIMTER = "\n";

RPC.prototype.handle = function(data){
    logger.error('RPC base class cannot handle data');
};

RPC.prototype.onData = function (data) {

    var that = this;
    var items = data;

    if(typeof data !== 'string') {
        items = data.toString("utf8");
    }

    //separate concatanated json blobs with delimeter
    items = data.toString("utf8").replace(/\}\s*\{/g, '}' + this.DELIMTER +'{');

    //split the data into separate packets
    items = items.split(this.DELIMTER);
    
    if(items.length > 1){
        logger.debug('rpc received multiple json packets: ', items);
    }

    //invoke handle on each json packet
    items.forEach(function(item) {
        var message;
        try {
            message = JSON.parse(item);
            if (message) {   
               that.handle(message);
            }
        } catch (e){
            logger.error('RPC message parsing failed, error:', e);
            logger.error('Message:', item);
        }
    });
};

RPC.prototype.encoderpc = function (method, params) {
  var packet = jrs.request(this.MAX_ID++, method, params);
  return packet;
};

RPC.prototype.encoderesult = function (id, result) {
  var packet = jrs.success(id, result);
  return packet;
};

// decode JSON RPC
RPC.prototype.decoderpc = function (packet) {
  //return jrs.deserialize(packet);
  return _.omit(jrs.deserialize(packet).payload, 'id', 'jsonrpc');
};

RPC.prototype.send = function(packet){
    try {
        this.proc.send(packet);
    } catch (e) {
        logger.error('could not send the RPC packet');
    }
};

RPC.Client = function (proc, name){
    RPC.call(this, proc, name);
    proc.on("message", _.bind(this.onData, this));
};

util.inherits(RPC.Client, RPC);

RPC.Client.prototype.handle = function(data){
    this.handleResponse(data);
};

RPC.Client.prototype.handleResponse = function(message) {
    logger.debug('Handle Response:', this.name, '=', message);
    if (message.method) {
        //looks like notification
        if(message.id){
            logger.warn('RPC client received notification that contains id. unexpected notification');
        }
        this.emit('notify', message.method, message.params);
    
    } else if (message.id) {
        var promise = this.map[message.id];
        if (promise) {
            if(message.error){
                promise.resolve({ error : message.error });
            } else {
                promise.resolve(message.result);
            }
            this.map[message.id] = undefined;

        } else {
            logger.warn('RPC client could not locate id for the response');
        }
    
    } else {
        //Client method
        // this is notification? should we be here?
        logger.warn('RPC client received notification without method or id, message=', message);
        this.emit('notify', message);
    }

};

RPC.Server = function (proc, handler, name){
    RPC.call(this, proc, name);
    var that = this;
    this.handler = handler;
    proc.on("message", _.bind(this.onData, this));
    
    if (this.handler) {
        this.handler.on('event', function (methodString, params) {
            that.notify(methodString, params);
        });
    }
};

util.inherits(RPC.Server, RPC);

RPC.Server.prototype.handle = function(data){
    this.handleMethod(data);
};

RPC.Server.prototype.handleMethod = function(m) {
    var that = this;
    logger.debug('handleMethod:', this.name, '=', m);
    var message = typeof(m) === 'string' ? JSON.parse(m) : m;
    if (!message) {
        logger.warn('RPC Server received call without a message');
        return;
    }

    if (!message.method) {
        logger.warn('RPC Server received message without a method name');
        return;
    }
    if (!message.id) {
        logger.warn('RPC Server received method call without a request ID. Wont acknowledge method');
        //todo: do we want to continue the execution?
        return;
    }

    logger.debug('received call for', message.method);
    
    var path = message.method.split('.');
    var l = path.length;
    var index = 1;
    var target = this.handler;
    var methodName = path[0];
    var method = target[methodName];
    
    while(index < l && method && target){
        target = target[methodName];
        methodName = path[index++];
        method = target[methodName];
    }

    if (target && method && typeof(method) === "function") {
        logger.debug('calling method', methodName);
        when(method.call(target, message.params), function (result) {
                logger.debug('method ', methodName , ' returned result');
                that.reply(message.id, result || { 'success' : true });
            }
        );
    }
};
/**
*  Client API
*/
RPC.Client.prototype.invoke = function(method, args) {
    var promise = new Promise();
    var packet = jrs.requestObject(this.MAX_ID++, method, args);
    this.map[packet.id] = promise;
    packet = JSON.stringify(packet);
    logger.debug('Invoke:', this.name, '=', packet);
    this.send(packet);
    return promise;
};

/**
*  Server API
*/
RPC.Server.prototype.notify = function(method, params) {
    var packet = jrs.notification(method, params);
    logger.debug('Notify:', this.name, '=', packet);
    this.send(packet);
};

/**
*  Server API
*/
RPC.Server.prototype.reply = function(id, result) {
    var packet = this.encoderesult(id, result);
    logger.debug('Reply:', this.name, '=', packet);
    this.send(packet);
};

module.exports = RPC;