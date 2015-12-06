var files = require('./files'),
    logger = require('./logging/PrintManagerLogger');

// Resource that reference Files should have a "_files" key.  This key
// identifies the locations in the JSON representation of the file
// IDs.  For example, a Resource that looks like this:
//
// {
//     "small_icon_id" : "2342342",
//     "large_icon_id" : "9849584",
//     "print_bed" : {
//         "obj_file_id" : "5834953"
//     }
// }
//
// should additionally have a "_files" key like this:
//
// {
//     "_files" : [
//         "small_icon_id",
//         "large_icon_id",
//         "print_bed.obj_file_id" ]
// }
//
// This allows us and API clients to work with files associated with
// resources in a data-driven way.

function Metadata( res )
{
    this.res = res;
}


// Validate the the "_files" key is correct.  This method checks that
// all of the paths specified in the file metadata exist in the
// resource, and that they refer to real file IDs.
Metadata.prototype.validate = function()
{
    logger.debug( 'FileMetadata.validate()' );
    logger.debug( this.res );
    
    if( !this.res._files )
        return true;
    
    logger.debug( this.res._files );
    
    for( var i = 0; i < this.res._files.length; i++ )
    {
        var pathStr = this.res._files[i];
        logger.debug( '  pathStr: ' + pathStr );
        
        var path = pathStr.split( '.' );

        var value = this.res;
        for( var j = 0; j < path.length; j++ )
        {
            if( !value[path[j]] )
                return false;

            value = value[path[j]];
        }

        var file = files.find( value );
        if( !file )
            return false;
    }

    return true;
};


// Get the value of a specified path string.
Metadata.prototype.get = function( pathStr )
{
    logger.debug( 'FileMetadata.get(): ' + pathStr );
    var path = pathStr.split( '.' );

    var value = this.res;
    for( var i = 0; i < path.length; i++ )
    {
        logger.debug( '  path[i]: ' + path[i] );
        value = value[path[i]];
    }

    return value;
};


// Set the value of a specified path string.
Metadata.prototype.set = function( pathStr, newValue )
{
    var path = pathStr.split( '.' );

    var value = this.res;
    for( var i = 0; i < path.length - 1; i++ )
    {
        value = value[path[i]];
    }

    value[path[path.length - 1]] = newValue;

    return value;
};


// Look up the files in the metadata and add them as children of the
// resource.
Metadata.prototype.addChildren = function()
{
    if( !this.res._files )
        return;

    logger.debug( 'FileMetadata.addChildren()' );
    for( var i = 0; i < this.res._files.length; i++ )
    {
        var pathStr = this.res._files[i];
        var id = this.get( pathStr );
        logger.debug( '  id: ' + id );
        var file = files.find( id );
        this.res.addChild( file );
    }
};


module.exports = exports = {
    'FileMetadata' : Metadata
};
