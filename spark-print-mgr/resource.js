var uuid = require('node-uuid'),
    logger = require('./logging/PrintManagerLogger');

function Resource()
{
    this.id = uuid.v4();
    this.__refCount = 0;
    this.__timeStamp = new Date();
    this.__children = {};
}


Resource.prototype.getID = function()
{
    return this.id;
};


Resource.prototype.getRefCount = function()
{
    return this.__refCount;
};


Resource.prototype.getTimeStamp = function()
{
    return this.__timeStamp;
};


Resource.prototype.addChild = function( child )
{
    if (this.__children[child.getID()] === undefined )
    {
        child.__refCount = child.__refCount + 1;
        this.__children[child.getID()] = child;
        logger.debug('adding child ' + child);
    }
};


Resource.prototype.removeChild = function( child )
{
    if (this.__children[child.getID()] !== undefined )
    {
        child.__refCount = child.__refCount - 1;
        delete this.__children[child.getID()];
    }
};


Resource.prototype.removeAllChildren = function()
{
    for (var childId in this.__children)
    {
        var childToRemove = this.__children[childId];
        this.removeChild(childToRemove);
    }
}

// Not the best solution but Javascript types are rather screwy:
function simpleClone(obj)
{
    // Assumes that obj will not contain another resource type.
    if( obj instanceof Array || ( obj instanceof Object && !(obj instanceof Function) ) )
        return JSON.parse( JSON.stringify( obj ) );

    return obj;
}


Resource.prototype.asJSON = function()
{
    // This method returns the JSON form of the resource.  Any keys
    // that aren't strings are skipped, and any string keys that don't
    // start with a double underscore are skipped.  So, if you are
    // storing data in your resource that you don't want sent as the
    // JSON form of the resource, keep it in key names that start with
    // a double underscore.
    
    var data = {};
    
    for( var key in this )
    {
        if( typeof key != 'string' )
            continue;

        if( key.substring(0,2) == '__' )
            continue;

        var val = this[key];

        if( !(val instanceof Function) )
            data[key] = (val && val.asJSON) ? val.asJSON() : simpleClone(val);
    }

    return data;
};


module.exports = exports = {
    'Resource' : Resource
};
