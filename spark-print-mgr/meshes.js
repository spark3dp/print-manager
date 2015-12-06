var express = require('express'),
    resources = require('./resource'),
    path = require('path'),
    util = require('util'),
    files = require('./files'),
    roopa = require('./roopa'),
    tasks = require('./tasks'),
    validator = require('./utils/validator'),
    Errors = require('./error/Errors'),
    logger = require('./logging/PrintManagerLogger');

var router = null;
var meshes = {};

var fields = { 'id' : true,
               'name' : true, 
               'internal_file_id' : true,
               'visual_file_id' : true,
               'transform' : true,
               'geom' : true,
               'problems' : true,
               'analyzed' : true };

function Mesh( internalFile, data )
{
    // call the base class
    resources.Resource.call(this);

    // initialize the members
    this.internal_file_id = internalFile.getID();
    this.addChild( internalFile );

    for( var key in data )
    { 
        if( fields[key] )
            this[key] = data[key];
    }
    // install in our collection
    meshes[this.getID()] = this;
}

util.inherits(Mesh, resources.Resource);

function getMesh( req, res, next )
{
    var id = req.params.id;
    var mesh, err;

    if( !validator.isUUID(id) )
    {
        err = new Errors.Request.NotFoundError('id should be a UUID', 120000);
        return next(err);
    }

    mesh = findMesh(id);

    if( mesh )
    {
        res.send( mesh.asJSON() );
    }
    else
    {
        err = new Errors.Request.NotFoundError('Mesh ' + id + ' cannot be found', 120001);
        next(err);
    }
}


function findMesh( id )
{
    if (!(typeof(id) === 'string' || id instanceof String)) {
        return undefined;
    }

    // Keeps server from crashing when '__proto__' is passed in as the mesh id
    return meshes.hasOwnProperty(id) ? meshes[id] : undefined;
}


function importMesh( req, res, next )
{
    if( !req.body.hasOwnProperty('file_id') ) {
        var err = new Errors.Request.BadRequestError('file_id is missing', 100100);
        return next(err);
    }

    if (!validator.isUUID(req.body.file_id)) {
        var err = new Errors.Request.BadRequestError('file_id should be a UUID', 100101);
        return next(err);
    }

    // get the file
    var inputFile = files.find( req.body.file_id );
    if( !inputFile )
    {
        var err = new Errors.Request.BadRequestError('File ' + req.body.file_id + ' cannot be found', 100102);
        return next(err);
    }
    
    var outputFile = new files.File();

    // get the name
    var name = req.body.name;
    if( !name )
        name = "unknown";

    // get the transform
    var transform = req.body.transform;
    if( !transform )
        transform = [ [ 1, 0, 0, 0 ],
                      [ 0, 1, 0, 0 ],
                      [ 0, 0, 1, 0 ] ];
        
    var roopaInput = {
        "inputFile" : inputFile.path,
        "outputFile" : outputFile.path,
        "name" : name,
        "transform" : transform };

    var visualFileID;
    // check if a visual file is requested:
    if( req.body.generate_visual )
    {
        var visualFile = new files.File(null, path.basename(name) + ".blt");
        roopaInput.visualFile = visualFile.path;
        visualFileID = visualFile.getID();
    }

    var task = new tasks.Task();
    logger.info( 'importMesh: creating task ' + task.getID() );

    // run roopa server
    var p = roopa.run( "importMesh.lua", roopaInput, task );
    p.then( function(data)
            {
                if( data.error )
                {
                    var msg = data.error.code + " " + data.error.message;
                    logger.error( 'importMesh failed: ' + msg );
                    task.setError( new Errors.General.OperationError(msg, 300104) );
                    return;
                }
                logger.info( 'importMesh worked!' );

                // set 'analyzed' field to default
                data.analyzed = false;
                
                if( data.visual_file_id )
                {
                    // Convert path to file id:
                    logger.info("Visual file generated: " + data.visual_file_id);
                    data.visual_file_id = visualFileID;
                }
                var mesh = new Mesh( outputFile, data );
                var result = mesh.asJSON();
                task.setResult( result );

                if (data.visual_file_id)
                {
                    // Add the visual file as a reference to a new mesh.
                    var visualFile = files.find( visualFileID );
                    if (visualFile !== undefined)
                    {
                        mesh.addChild( visualFile );
                    }
                }

                logger.info( 'created mesh: ' + mesh.getID() );
            },
            function( data )
            {
                logger.error( 'importMesh failed!' );
                task.setError( new Errors.General.OperationError('Operation failed: ' + data, 300104) );
            } );

    // send the result
    res.status( 202 );
    res.send( task.asJSON() );
}


function renameMesh( req, res, next )
{
    var err;

    if( !req.body.hasOwnProperty('id') ) {
        err = new Errors.Request.BadRequestError('id is missing', 100300);
        return next(err);
    }

    if( !req.body.hasOwnProperty('name') ) {
        err = new Errors.Request.BadRequestError('name is missing', 100300);
        return next(err);
    }

    if( !validator.isUUID(req.body.id) ) {
        err = new Errors.Request.BadRequestError('id should be a UUID', 100301);
        return next(err);
    }

    if( !(req.body.name instanceof String || typeof(req.body.name) === 'string') ) {
        err = new Errors.Request.BadRequestError('name should be a string', 100301);
        return next(err);
    }

    // get the file
    var inputMesh = findMesh( req.body.id );

    if( !inputMesh ) {
        err = new Errors.Request.BadRequestError('Mesh ' + req.body.id + ' cannot be found', 100302);
        return next(err);
    }

    var inputFile = files.find( inputMesh.internal_file_id );
    var outputFile = new files.File();

    var roopaInput = {
        "inputFile" : inputFile.path,
        "outputFile" : outputFile.path,
        "name" : req.body.name
    };

    // run roopa server
    var p = roopa.run( "renameMesh.lua", roopaInput, null );
    p.then( function(data)
            {
                if( data.error )
                {
                    var msg = data.error.code + " " + data.error.message;
                    logger.error( 'renameMesh failed: ' + msg );
                    next( new Errors.General.OperationError(msg, 300303) );
                    return;
                }
                var mesh = new Mesh( outputFile, data );
                mesh.analyzed = inputMesh.analyzed;
                if( inputMesh.analyzed )
                {
                    mesh.problems = inputMesh.problems;
                }
                if( inputMesh.visual_file_id )
                {
                    mesh.visual_file_id = inputMesh.visual_file_id;

                    // Add the visual file as a reference to a new mesh.
                    var visualFile = files.find( inputMesh.visual_file_id );
                    if (visualFile !== undefined)
                    {
                        mesh.addChild( visualFile );
                    }
                }
                res.send( mesh.asJSON() );
            },
            function( data )
            {
                err = new Errors.General.OperationError('Operation failed: ' + data, 300303);
                next(err);
            } );
}


function transformMesh( req, res, next )
{
    var err;

    if( !req.body.hasOwnProperty('id') ) {
        err = new Errors.Request.BadRequestError('id is missing', 100500);
        return next(err);
    }

    if( !req.body.hasOwnProperty('transform') ) {
        err = new Errors.Request.BadRequestError('transform is missing', 100500);
        return next(err);
    }

    if( !validator.isUUID(req.body.id) ) {
        err = new Errors.Request.BadRequestError('id should be a UUID', 100501);
        return next(err);
    }

    if( !validator.isTransform(req.body.transform) ) {
        err = new Errors.Request.BadRequestError('transform should be a transform matrix, e.g. [ [ 1, 0, 0, 0 ], [ 0, 1, 0, 0 ], [ 0, 0, 1, 0 ] ]', 100501);
        return next(err);
    }

    // get the file
    var inputMesh = findMesh( req.body.id );

    if( !inputMesh ) {
        err = new Errors.Request.BadRequestError('Mesh ' + req.body.id + ' cannot be found', 100502);
        return next(err);
    }

    var inputFile = files.find( inputMesh.internal_file_id );
    var outputFile = new files.File();

    // get the name
    var transform = req.body.transform;
        
    var roopaInput = {
        "inputFile" : inputFile.path,
        "outputFile" : outputFile.path,
        "transform" : transform
    };

    // run roopa server
    var p = roopa.run( "transformMesh.lua", roopaInput, null );
    p.then( function(data)
            {
                if( data.error )
                {
                    var msg = data.error.code + " " + data.error.message;
                    logger.error( 'transformMesh failed: ' + msg );
                    next( new Errors.General.OperationError(msg, 300503) );
                    return;
                }
                var mesh = new Mesh( outputFile, data );
                mesh.analyzed = inputMesh.analyzed;
                if( inputMesh.analyzed )
                {
                    mesh.problems = inputMesh.problems;
                }
                if( inputMesh.visual_file_id )
                {
                    mesh.visual_file_id = inputMesh.visual_file_id;

                    // Add the visual file as a reference to a new mesh.
                    var visualFile = files.find( inputMesh.visual_file_id );
                    if (visualFile !== undefined)
                    {
                        mesh.addChild( visualFile );
                    }
                }
                res.send( mesh.asJSON() );
            },
            function( data )
            {
                err = new Errors.General.OperationError('Operation failed: ' + data, 300503);
                next(err);
            } );
}


function exportMesh( req, res, next )
{
    var err;

    // get the mesh
    var id = req.body.id;
    if( !id )
    {
        err = new Errors.Request.BadRequestError('id is missing', 100400);
        return next(err);
    }

    if( !validator.isUUID(id) )
    {
        err = new Errors.Request.BadRequestError('id should be a UUID', 100401);
        return next(err);
    }
    
    var inputMesh = findMesh( id );
    if( !inputMesh )
    {
        err = new Errors.Request.BadRequestError('Mesh ' + id + ' cannot be found', 100402);
        return next(err);
    }

    var inputFile = files.find( inputMesh.internal_file_id );

    // get the type
    var file_type = req.body.file_type;
    if( !file_type )
    {
        err = new Errors.Request.BadRequestError('file_type is missing', 100400);
        return next(err);
    }
    
    if( file_type != "stl_binary" &&
        file_type != "stl_ascii" &&
        file_type != "obj" )
    {
        err = new Errors.Request.BadRequestError("file_type must be 'obj', 'stl_ascii', or 'stl_binary'", 100403);
        return next(err);
    }

    // allocate a file
    var outputFile = new files.File();
    
    // assemble the input
    var roopaInput = {
        "inputFile" : inputFile.path,
        "outputFile" : outputFile.path,
        "file_type" : file_type };

    // run roopa server
    var task = new tasks.Task();
    var p = roopa.run( "exportMesh.lua", roopaInput, task );
    p.then( function(data)
            {
                if( data.error )
                {
                    var msg = data.error.code + " " + data.error.message;
                    logger.error( 'exportMesh failed: ' + msg );
                    task.setError( new Errors.General.OperationError(msg, 300405) );
                    return;
                }
                logger.info( 'exportMesh worked!' );

                task.setResult( { "file_id" : outputFile.getID() } );
            },
            function( data )
            {
                task.setError( new Errors.General.OperationError('Operation failed: ' + data, 300405) );
            } );
    
    // send the result
    res.status( 202 );
    res.send( task.asJSON() );
}


function analyzeMesh( req, res, next )
{
    var err;

    // get the mesh
    var id = req.body.id;
    if( !id )
    {
        err = new Errors.Request.BadRequestError('id is missing', 100600);
        return next(err);
    }

    if( !validator.isUUID(id) )
    {
        err = new Errors.Request.BadRequestError('id should be a UUID', 100601);
        return next(err);
    }
    
    var inputMesh = findMesh( id );
    if( !inputMesh )
    {
        err = new Errors.Request.BadRequestError('Mesh ' + id + ' cannot be found', 100602);
        return next(err);
    }

    // if mesh has already been analyzed, return the resource
    if( inputMesh.analyzed ){
        res.status( 200 );
        res.send( inputMesh.asJSON() );
        return;
    }

    var inputFile = files.find( inputMesh.internal_file_id );

    // assemble the input
    var roopaInput = {
        "inputFile" : inputFile.path
    };

    // run roopa server
    var task = new tasks.Task();
    logger.info( 'analyzeMesh: creating task ' + task.getID() );
    var p = roopa.run( "analyzeMesh.lua", roopaInput, task );
    p.then( function(data)
            {
                if( data.error )
                {
                    var msg = data.error.code + " " + data.error.message;
                    logger.error( 'analyzeMesh failed: ' + msg );
                    task.setError( new Errors.General.OperationError(msg, 300606) );
                    return;
                }
                inputMesh.analyzed = true;
                inputMesh.problems = data.problems;

                task.setResult( inputMesh.asJSON() );
            },
            function( data )
            {
                task.setError( new Errors.General.OperationError('Operation failed: ' + data, 300603) );
            } );

    // send the result
    res.status( 202 );
    res.send( task.asJSON() );
}


function repairMesh( req, res, next )
{
    var err;

    // get the mesh
    var id = req.body.id;
    var all = req.body.all || false;    // Should default be true?
    if( !id )
    {
        err = new Errors.Request.BadRequestError('id is missing', 100700);
        return next(err);
    }

    if( !validator.isUUID(id) )
    {
        err = new Errors.Request.BadRequestError('id should be a UUID', 100701);
        return next(err);
    }
    
    var inputMesh = findMesh( id );
    if( !inputMesh )
    {
        err = new Errors.Request.BadRequestError('Mesh ' + id + ' cannot be found', 100702);
        return next(err);
    }

    var inputFile = files.find( inputMesh.internal_file_id );
    var outputFile = new files.File();

    // assemble the input
    var roopaInput = {
        "inputFile" : inputFile.path,
        "all": all,
        "outputFile" : outputFile.path
    };

    var visualFileID;
    // check if a visual file is requested:
    if( req.body.generate_visual )
    {
        var visualFile = new files.File(null, path.basename(inputFile.path) + ".blt");
        roopaInput.visualFile = visualFile.path;
        visualFileID = visualFile.getID();
    }

    // run roopa server
    var task = new tasks.Task();
    var p = roopa.run( "repairMesh.lua", roopaInput, task );
    p.then( function(data)
            {
                if( data.error )
                {
                    var msg = data.error.code + " " + data.error.message;
                    logger.error( 'repairMesh failed: ' + msg );
                    task.setError( new Errors.General.OperationError(msg, 300706) );
                    return;
                }
                logger.info( 'repairMesh worked!' );
                var mesh = new Mesh( outputFile, data );
                mesh.analyzed = true;

                // For consistency with analyze, the mesh is expected to have the 'problems'
                // property, whether or not problems exist.
                //
                // TODO:  Ask Roopa team if they're supposed to be including this in the data
                //        instead.
                //
                if (!mesh.hasOwnProperty('problems')) {
                    mesh.problems = [];
                }

                if( data.visual_file_id )
                {
                    // Convert path to file id:
                    logger.info("Visual file generated: " + data.visual_file_id + " id: " + visualFileID);
                    mesh.visual_file_id = visualFileID;

                    // Add the visual file as a reference to a new mesh.
                    var visualFile = files.find( visualFileID );
                    if (visualFile !== undefined)
                    {
                        mesh.addChild( visualFile );
                    }
                }
                var result = mesh.asJSON();
                task.setResult( result );
            },
            function( data )
            {
                logger.error( 'repairMesh failed!' );
                task.setError( new Errors.General.OperationError('Operation failed: ' + data, 300703) );
            } );
    
    // send the result
    res.status( 202 );
    res.send( task.asJSON() );
}


function generateVisual( req, res, next )
{
    var err;

    // get the mesh
    var id = req.body.id;
    if( !id )
    {
        err = new Errors.Request.BadRequestError('id is missing', 100200);
        return next(err);
    }

    if( !validator.isUUID(id) )
    {
        err = new Errors.Request.BadRequestError('id should be a UUID', 100201);
        return next(err);
    }
    
    var inputMesh = findMesh( id );
    if( !inputMesh )
    {
        err = new Errors.Request.BadRequestError('Mesh ' + id + ' cannot be found', 100202);
        return next(err);
    }

    logger.info( 'generateVisual for Id: ' + id );

    if( inputMesh.hasOwnProperty("visual_file_id") )
    {
        res.status( 200 );
        res.send( inputMesh.asJSON() );
        return;
    }

    var filename = path.basename(inputMesh.name) + ".blt";
    var inputFile = files.find( inputMesh.internal_file_id );
    var outputFile = new files.File(null, filename);

    var roopaInput = {
        "inputFile" : inputFile.path,
        "outputFile" : outputFile.path };

    var task = new tasks.Task();
    logger.info( 'generateVisual: creating task ' + task.getID() );

    // run roopa server
    var p = roopa.run( "generateVisual.lua", roopaInput, task );
    p.then( function(data)
            {
                if( data.error )
                {
                    var msg = data.error.code + " " + data.error.message;
                    logger.error( 'generateVisual failed: ' + msg );
                    task.setError( new Errors.General.OperationError(msg, 300204) );
                    return;
                }
                logger.info( 'generateVisual worked!' );
                inputMesh.visual_file_id = outputFile.getID();
                task.setResult( inputMesh.asJSON() );
            },
            function( data )
            {
                logger.error( 'generateVisual failed!' );
                task.setError( new Errors.General.OperationError('Operation failed: ' + data, 300204) );
            } );

    // send the result
    res.status( 202 );
    res.send( task.asJSON() );
}


function getRouter()
{
    if( router )
        return router;

    // configure the router
    router = express.Router();
    router.get( '/:id', getMesh );
    router.post( '/import', importMesh );
    router.post( '/rename', renameMesh );
    router.post( '/transform', transformMesh );
    router.post( '/export', exportMesh );
    router.post( '/analyze', analyzeMesh );
    router.post( '/repair', repairMesh );
    router.post( '/generate-visual', generateVisual );
    router.post( '/generateVisual', generateVisual );

    return router;
}


function prune()
{
    logger.info('Pruning old meshes.');

    // Prune any mesh that has zero references.
    for (var meshId in meshes)
    {
        var mesh = meshes[meshId];
        if (mesh.getRefCount() === 0)
        {
            // Unref all the children.
            mesh.removeAllChildren();
            delete meshes[meshId];

            logger.info('   - deleted mesh: ' + meshId );
        }
    }
}


module.exports = exports = {
    'Router' : getRouter, 
    'Mesh' : Mesh,
    'find' : findMesh,
    'prune' : prune
};
