var express = require('express'),
    resources = require('./resource'),
    path = require('path'),
    util = require('util'),
    files = require('./files'),
    meshes = require('./meshes'),
    printerTypes = require('./printertypes'),
    profiles = require('./profiles'),
    materials = require('./materials'),
    roopa = require('./roopa'),
    tasks = require('./tasks'),
    validator = require('./utils/validator'),
    Errors = require('./error/Errors'),
    logger = require('./logging/PrintManagerLogger'),
    config = require('./config').config,
    TranslatorFactory = require('./printableTranslation/TranslatorFactory');

var router = null;
var trays = {};

// Load the translators from the directory specified in the config.
//
TranslatorFactory.registerTranslators(config.translators_directory);

var fields = { 'id': true,
    'printer_type_id': true,
    'profile_id': true,
    'default_material_id': true,
    'meshes': true,
    'mesh_attrs': true,
    'ready': true,
    'state': true,
    'internal_file_id': true
};

function Tray( data )
{
    // call the base class
    resources.Resource.call( this );

    // set the members
    for( var key in data )
    {
        if( data.hasOwnProperty(key) && fields[key] ) {
            this[key] = data[key];
        }
    }

    // install in our collection
    trays[this.getID()] = this;
}

util.inherits( Tray, resources.Resource );


function findTray( id )
{
    if (!(typeof(id) === 'string' || id instanceof String)) {
        return undefined;
    }

    // Keeps server from crashing when '__proto__' is passed in as the tray id
    return trays.hasOwnProperty(id) ? trays[id] : undefined;
}


function getTray( req, res, next )
{
    var err;
    var id = req.params.id;

    if( !validator.isUUID(id) )
    {
        err = new Errors.Request.NotFoundError('id should be a UUID', 100800);
        return next(err);
    }

    var tray = findTray(id);

    if( tray )
    {
        res.send( tray.asJSON() );
    }
    else
    {
        err = new Errors.Request.NotFoundError('Tray ' + id + ' cannot be found', 100801);
        return next(err);
    }
}


function createTray( req, res, next )
{
    var err;

    // validate the input
    var printerTypeID = req.body.printer_type_id;
    if( !printerTypeID )
    {
        err = new Errors.Request.BadRequestError('printer_type_id is missing', 100900);
        return next(err);
    }

    if( !validator.isUUID(printerTypeID) )
    {
        err = new Errors.Request.BadRequestError('printer_type_id should be a UUID', 100901);
        return next(err);
    }

    var printerType = printerTypes.find( printerTypeID );
    if( !printerType )
    {
        err = new Errors.Request.BadRequestError('Printer type ' + printerTypeID + ' cannot be found', 100902);
        return next(err);
    }

    var profileID = req.body.profile_id;
    if( !profileID )
    {
        err = new Errors.Request.BadRequestError('profile_id is missing', 100900);
        return next(err);
    }

    if( !validator.isUUID(profileID) )
    {
        err = new Errors.Request.BadRequestError('profile_id should be a UUID', 100901);
        return next(err);
    }

    var profile = profiles.find( profileID );
    if( !profile )
    {
        err = new Errors.Request.BadRequestError('Profile ' + profileID + ' cannot be found', 100902);
        return next(err);
    }

    var defaultMaterialID = req.body.default_material_id;
    if( defaultMaterialID )
    {
        if( !validator.isUUID(defaultMaterialID) ) {
            return next(new Errors.Request.BadRequestError('default_material_id should be a UUID when provided', 100901));
        }

        var material = materials.find(defaultMaterialID);
        if( !material ) {
            return next(new Errors.Request.BadRequestError('Material ' + defaultMaterialID + ' cannot be found', 100902));
        }

        if( material.printer_types.indexOf(printerTypeID) === -1 )
        {
            return next(new Errors.Request.BadRequestError('Material ' + defaultMaterialID +
                ' is not compatible with printer type ' + printerTypeID, 100907))
        }
    } else {
        defaultMaterialID = printerType.default_material_id;
    }

    if( profile.printer_types.indexOf(printerTypeID) === -1 )
    {
        return next(new Errors.Request.BadRequestError('Profile ' + profileID +
            ' is not compatible with printer type ' + printerTypeID, 100907))
    }

    var meshIDs = req.body.mesh_ids;
    if( !meshIDs )
    {
        err = new Errors.Request.BadRequestError('mesh_ids is missing', 100900);
        return next(err);
    }
    if( !(meshIDs instanceof Array) )
    {
        err = new Errors.Request.BadRequestError('mesh_ids should be an array', 100901);
        return next(err);
    }
    if( meshIDs.length === 0) {
        err = new Errors.Request.BadRequestError('mesh_ids cannot be empty', 100901);
        return next(err);
    }
    var meshPaths = [];
    var meshList = [];
    var meshListJSON = [];
    var meshAttrs = {};

    var meshAttrParams = req.body.mesh_attrs;
    if( !meshAttrParams )
        meshAttrParams = {};

    for( var i = 0; i < meshIDs.length; ++i )
    {
        var id = meshIDs[i];
        var mesh = meshes.find( id );
        if( !mesh )
        {
            err = new Errors.Request.BadRequestError('Mesh ' + id + ' cannot be found', 100902);
            return next(err);
        }
        meshList.push( mesh );
        meshListJSON.push( mesh.asJSON() );

        var fileID = mesh.internal_file_id;
        var file = files.find( fileID );
        meshPaths.push( file.path );

        var attributes = { "reposition" : true, "reorient" : true, "support" : true };
        var param = meshAttrParams[id];
        if( param && param.hasOwnProperty("reposition") )
            attributes["reposition"] = !!param["reposition"];
        if( param && param.hasOwnProperty("reorient") )
            attributes["reorient"] = !!param["reorient"];
        if( param && param.hasOwnProperty("support") )
            attributes["support"] = !!param["support"];

        meshAttrs[mesh.getID()] = attributes; // Index by the mesh's actual ID to ensure the case matches
    }
    // set up the output file
    var output = new files.File( null, "tray.rpa" );

    var typeInfo = printerType.asJSON();
    printerType.mapFileResources(typeInfo);

    var material = materials.find(defaultMaterialID);
    
    var task = new tasks.Task();
    logger.info( 'createTray: creating task ' + task.getID() );

    // call RoopaServer
    var roopaInput = {
        "meshes" : meshPaths,
        "printerType" : typeInfo,
        "profile" : profile.asJSON(),
        "defaultMaterial" : material.asJSON(),
        "output" : output.path };
    
    var p = roopa.run( 'createTray.lua', roopaInput, task );
    p.then( function(data)
            {
                if( data.error )
                {
                    var msg = data.error.code + " " + data.error.message;
                    logger.error( 'createTray failed: ' + msg );
                    task.setError( new Errors.General.OperationError(msg, 300904) );
                    return;
                }
                logger.info( 'createTray worked!' );
                data = { 'printer_type_id' : printerTypeID,
                         'profile_id' : profileID,
                         'default_material_id' : defaultMaterialID,
                         'meshes' : meshListJSON,
                         'mesh_attrs' : meshAttrs,
                         'ready' : false,
                         'state' : "created",
                         'internal_file_id' : output.getID() };
                var tray = new Tray( data );
                var result = tray.asJSON();
                task.setResult( result );

                // Add the meshes as children of the tray:
                for( var i = 0; i < meshList.length; ++i )
                    tray.addChild(meshList[i]);

                logger.info( 'created tray: ' + tray.getID() );
            },
            function( data )
            {
                logger.error( 'createTray failed!' );
                task.setError( new Errors.General.OperationError('Operation failed: ' + data, 300904) );
            } );

    // send the result
    res.status( 202 );
    res.send( task.asJSON() );
}


function prepareTray( req, res, next )
{
    var id = req.body.id;
    if( !id )
    {
        return next(new Errors.Request.BadRequestError('id is missing', 101000));
    }

    if( !validator.isUUID(id) )
    {
        return next(new Errors.Request.BadRequestError('id should be a UUID', 101001));
    }

    var inputTray = findTray(id);

    if( !inputTray )
    {
        return next(new Errors.Request.BadRequestError('Tray ' + id + ' cannot be found', 101002));
    }
    var printerTypeId = inputTray.printer_type_id;
    var profileId = inputTray.profile_id;
    var materialId = inputTray.default_material_id;
    var inputMeshesJSON = inputTray.meshes;
    var inputMeshes = [];
	
	var printerType = printerTypes.find( printerTypeId );
	var profile = profiles.find( profileId );
	var material = materials.find( materialId );
    var typeInfo = printerType.asJSON();
    printerType.mapFileResources(typeInfo);
    
    var visuals = req.body.generate_visual || false;

    // set up the output file
    var inputFileID = inputTray.internal_file_id;
    var inputFile = files.find( inputFileID );
    // TODO: check inputFile

    var outputFile = new files.File( null, "prepared.rpa" );
    var attributes = inputTray.mesh_attrs;
    // console.log( 'prepareTray: outputFile ', outputFile.getID() );

    var task = new tasks.Task();
    logger.info( 'prepareTray: creating task ' + task.getID() );

    // Prepare will attempt to fix bad meshes and thus create new ones
    // that will need new Mesh resources. At this point we don't know
    // which meshes will get modified so we have to prepare an output
    // file for each one just in case. We also have to convert the mesh
    // attribute dictionary into an array for roopa server.
    var meshFiles = [];
    var meshFilePaths = [];
    var meshAttrs = [];
    var vizPaths = [];
    var vizFiles = [];
    for( var i = 0; i < inputMeshesJSON.length; ++i )
    {
        meshFiles[i] = new files.File();
        meshFilePaths[i] = meshFiles[i].path;

        var meshID = inputMeshesJSON[i].id;
        var mesh = meshes.find( meshID );
        // console.log("CONFIRM MESH: " + meshID);
        inputMeshes.push(mesh);
        meshAttrs.push(attributes[meshID]);

        // If visual files are requested create the corresponding file resource:
        if( visuals )
        {
            var visualFile = new files.File(null, path.basename(meshFilePaths[i]) + ".blt");
            vizFiles.push(visualFile);
            vizPaths.push(visualFile.path);
            // console.log("VIZ: " + visualFile.path);
        }
    }

    // call RoopaServer
    var roopaInput = {
        "inputFile" : inputFile.path,
		"printerType" : typeInfo,
        "profile" : profile.asJSON(),
        "defaultMaterial" : material.asJSON(),
        "mesh_attrs" : meshAttrs,
        "outputFile" : outputFile.path,
        "meshFiles" : meshFilePaths
    };
    if( visuals )
        roopaInput.visualFiles = vizPaths;
    
    var p = roopa.run( 'prepareTray.lua', roopaInput, task );
    p.then( function(data)
            {
                if( data.error )
                {
                    // Cleanup:
                    for( var i = 0; i < meshFiles.length; ++i )
                    {
                        meshFiles[i].remove();
                        if( visuals )
                            vizFiles[i].remove();
                    }
                    var msg = data.error.code + " " + data.error.message;
                    logger.error( 'prepareTray failed: ' + msg );
                    task.setError( new Errors.General.OperationError(msg, 301004) );
                    return;
                }
                logger.info( 'prepareTray succeeded! ' );

                // loop through results which should be:
                // [ { modified: true, path: "<path>", mesh: { <mesh data> } }, ... ]
                // and create a new mesh resource for each file:
                //
                // TODO: server must return repair status of each mesh. If problems
                // persist we should not set the repaired state or the ready flag.

                var outputMeshes = [];
                var outputMeshesJSON = [];
                var outputAttributes = {};
                for( var j = 0; j < inputTray.meshes.length; ++j )
                {
                    var meshResult = data[j];
                    if( meshResult.modified && meshResult.mesh )
                    {
                        // console.log("new mesh: " + util.inspect(meshResult.mesh));
                        var newMesh = new meshes.Mesh( meshFiles[j], meshResult.mesh );
                        if( visuals )
                        {
                            if( meshResult.visual_file_id )
                            {
                                // Convert path to file id:
                                // logger.debug("Mesh[" + j + "] viz file: " + meshResult.visual_file_id + " id: " + vizFiles[j].id);
                                newMesh.visual_file_id = vizFiles[j].id;

                                // Add the visual file as a reference from the new mesh.
                                newMesh.addChild( vizFiles[j] );
                            }
                            else
                            {
                                logger.error("Requested visual file not generated for mesh: " + newMesh.id);
                                vizFiles[j].remove();
                            }
                        }
                        outputMeshes.push( newMesh );
                        outputMeshesJSON.push( newMesh.asJSON() );
                    }
                    else
                    {
                        // Just reference the unmodified input mesh:
                        // console.log("old mesh: " + util.inspect(inputMeshes[j]));
                        outputMeshes.push( inputMeshes[j] );
                        outputMeshesJSON.push( inputMeshesJSON[j] );

                        // console.log("DELETE UNUSED FILE: " + meshFiles[j].getID());
                        meshFiles[j].remove();
                        if( visuals )
                            vizFiles[i].remove();
                    }
                    // Assume these are all done?
                    // TODO!!! Is this correct?
                    outputAttributes[outputMeshes[j].getID()] = {
                        'reposition' : false,
                        'reorient' : false,
                        'support' : false
                    };
                }
                // TODO: Tray "state" attribute is not well defined.
                // If a client twiddles the attribute flags on the meshes and then
                // does a prepare, how do we know what the tray state should be?
                data = { 'printer_type_id' : printerTypeId,
                         'profile_id' : profileId,
                         'default_material_id' : materialId,
                         'meshes' : outputMeshesJSON,
                         'mesh_attrs' : outputAttributes,
                         'ready' : true,
                         'state' : "supported",
                         'internal_file_id' : outputFile.getID() };
                var outputTray = new Tray( data );
                var result = outputTray.asJSON();

                // Add the meshes as children of the tray:
                for( var i = 0; i < outputMeshes.length; ++i )
                    outputTray.addChild(outputMeshes[i]);

                task.setResult( result );
            },
            function( data )
            {
                logger.error( 'prepareTray failed!' );
                task.setError( new Errors.General.OperationError('Operation failed: ' + data, 301004) );
                // TODO: cleanup mesh resources as done above
            } );

    // send the result
    res.status( 202 );
    res.send( task.asJSON() );
}

function translatePrintable(req, res, next) {
    var err;

    if (!req.body.hasOwnProperty('raw_file_id')) {
        var err = new Errors.Request.BadRequestError('raw_file_id is missing', 100100);
        return next(err);
    }

    if (!validator.isUUID(req.body.raw_file_id)) {
        var err = new Errors.Request.BadRequestError('raw_file_id should be a UUID', 100101);
        return next(err);
    }

    // get the file
    var rawFile = files.find(req.body.raw_file_id);
    if (!rawFile) {
        var err = new Errors.Request.BadRequestError('File ' + req.body.raw_file_id + ' cannot be found', 100102);
        return next(err);
    }

    var printerTypeID = req.body.printer_type_id;
    if (!printerTypeID) {
        err = new Errors.Request.BadRequestError('printer_type_id is missing', 100900);
        return next(err);
    }

    if (!validator.isUUID(printerTypeID)) {
        err = new Errors.Request.BadRequestError('printer_type_id should be a UUID', 100901);
        return next(err);
    }

    var printerType = printerTypes.find(printerTypeID);
    if (!printerType) {
        err = new Errors.Request.BadRequestError('Printer type ' + printerTypeID + ' cannot be found', 100902);
        return next(err);
    }

    var profile;
    if (req.body.hasOwnProperty('profile')) {
        profile = req.body.profile;
        if (profile === null || validator.isProfile(profile) !== true) {
            var err = new Errors.Request.BadRequestError('profile is invalid', 100101);
            return next(err);
        }
    }

    if (!profile) {
        var profileID = req.body.profile_id;
        if (!profileID) {
            err = new Errors.Request.BadRequestError('profile or profile_id is missing', 100900);
            return next(err);
        }

        if (!validator.isUUID(profileID)) {
            err = new Errors.Request.BadRequestError('profile_id should be a UUID', 100901);
            return next(err);
        }

        profile = profiles.find(profileID);
        if (!profile) {
            err = new Errors.Request.BadRequestError('Profile ' + profileID + ' cannot be found', 100902);
            return next(err);
        }

        if (profile.printer_types.indexOf(printerTypeID) === -1) {
            return next(new Errors.Request.BadRequestError('Profile ' + profileID +
                ' is not compatible with printer type ' + printerTypeID, 100907))
        }
    }

    var materialID = req.body.material_id;
    if (!materialID) {
        err = new Errors.Request.BadRequestError('material_id is missing', 100900);
        return next(err);
    }

    if (!validator.isUUID(materialID)) {
        return next(new Errors.Request.BadRequestError('material_id should be a UUID', 100901));
    }

    var material = materials.find(materialID);
    if (!material) {
        return next(new Errors.Request.BadRequestError('Material ' + materialID + ' cannot be found', 100902));
    }

    if (material.printer_types.indexOf(printerTypeID) === -1) {
        return next(new Errors.Request.BadRequestError('Material ' + materialID +
            ' is not compatible with printer type ' + printerTypeID, 100907))
    }

    var translator = TranslatorFactory.getTranslator(printerType, profile, material);

    if (!translator) {
        return next(new Errors.Request.BadRequestError('No translator found', 100902));
    }

    var task = new tasks.Task();
    logger.info('translate: creating task ' + task.getID());

    translator.on('progress', function (progress) {
        task.progress = progress;
    });

    var typeInfo = printerType.asJSON();
    printerType.mapFileResources(typeInfo);

    // set up the output file
    var printable = "printable";

    // create a file name for use with the correct printable extension
    if (typeInfo.printable) {
        printable = printable + "." + typeInfo.printable.extension;
    }

    var outputFile = new files.File(null, printable);

    translator.translate(rawFile.path, outputFile.path)
        .then(function () {
            // Create a new file resource and return it.
            //
            logger.info('translate worked! ' + outputFile);

            var result = { 'file_id': outputFile.getID() };
            task.setResult(result);
        })
        .catch(function (err) {
            logger.error('translate failed: ' + err);
            task.setError(new Errors.General.OperationError(err, 301204));
        });

    res.status(202);
    res.send(task.asJSON());
}

function generatePrintable(req, res, next) {
    // validate the input
    var trayID = req.body.id;
    if (!trayID) {
        return next(new Errors.Request.BadRequestError('id is missing', 101200));
    }

    if (!validator.isUUID(trayID)) {
        return next(new Errors.Request.BadRequestError('id should be a UUID', 101201));
    }

    var tray = findTray(trayID);

    if (!tray) {
        return next(new Errors.Request.BadRequestError('Tray ' + trayID + ' cannot be found', 101202));
    }
    if (!tray.ready) {
        return next(new Errors.Request.BadRequestError('Tray ' + trayID + ' has not been prepared, or prepare failed', 101207));
    }

    var printerType = printerTypes.find(tray.printer_type_id);
    var profile = profiles.find(tray.profile_id);
    var material = materials.find(tray.default_material_id);
    var typeInfo = printerType.asJSON();
    printerType.mapFileResources(typeInfo);

    var generateRaw = req.body.hasOwnProperty('generate_raw') ? req.body.generate_raw : false;

    // If we're generating a raw file, we need to now check that a translator is
    // available to translate to the device-dependent printable file.
    //
    var translator;
    if (generateRaw) {
        translator = TranslatorFactory.getTranslator(printerType, profile, material);

        if (!translator) {
            return next(new Errors.Request.BadRequestError('No translator found', 100902));
        }
    }

    var inputFileID = tray.internal_file_id;

    var printable = "printable";
    if (generateRaw) {
        printable += ".pb";
    } else if (typeInfo.printable) {
        printable = printable + "." + typeInfo.printable.extension;
    }

    var inputFile = files.find(inputFileID);
    var roopaOutputFile = new files.File(null, printable);

    var roopaInput = {
        "inputFile": inputFile.path,
        "outputFile": roopaOutputFile.path,
        "printerType": typeInfo,
        "profile": profile.asJSON(),
        "defaultMaterial": material.asJSON(),
        "raw": generateRaw
    };

    var task = new tasks.Task();
    logger.info('generatePrintable: creating task ' + task.getID());

    // If we're generating a raw file, then there are two translations happening -
    // from tray to device independent printable (in Roopa), and then to device dependent printable.
    //
    // We'll split the progress as X% for the first stage, and (1-X)% for
    // the second stage.
    //
    // If we're not generating a raw file, then the Roopa operation takes 100% of the progress.
    //
    var roopaPercentage = generateRaw ? 0.75 : 1.0;
    var p = roopa.run('generatePrintable.lua', roopaInput, null, function onProgress(progress) {
        task.progress = progress * roopaPercentage;
    });

    // Generate the first output using Roopa.
    //
    var translatorOutputFile;
    p.then(function (data) {
            if (data.error) {
                var msg = data.error.code + " " + data.error.message;
                logger.error('generatePrintable failed: ' + msg);
                task.setError(new Errors.General.OperationError(msg, 301204));
                return;
            }

            if (generateRaw) {
                // If Roopa generated a raw file, then we need to now use a translator
                // to produce the device-dependent printable file.
                //
                var printable = "printable";
                if (typeInfo.printable) {
                    printable = printable + "." + typeInfo.printable.extension;
                }

                translatorOutputFile = new files.File(null, printable);

                translator.on('progress', function (progress) {
                    task.progress = roopaPercentage + progress * (1.0 - roopaPercentage);
                });

                translator.translate(roopaOutputFile.path, translatorOutputFile.path)
                    .then(function () {
                        logger.info('generatePrintable worked! ' + translatorOutputFile);

                        // Return both the device independent and dependent printable files.
                        //
                        var result = { 'raw_file_id': roopaOutputFile.getID(),
                            'file_id': translatorOutputFile.getID() };
                        task.setResult(result);
                    })
                    .catch(function (err) {
                        logger.error('generatePrintable failed: ' + err);
                        task.setError(new Errors.General.OperationError(err, 301204));
                    });
            }
            else {
                logger.info('generatePrintable worked! ' + roopaOutputFile);
                var result = { 'file_id': roopaOutputFile.getID() };
                task.setResult(result);
            }
        },
        function (data) {
            logger.error('generatePrintable failed!');
            task.setError(new Errors.General.OperationError('Operation failed: ' + data, 301204));
        });

    // send the result
    res.status(202);
    res.send(task.asJSON());
}


function exportSupports( req, res, next )
{
    var trayID = req.body.id;
    if( !trayID )
    {
        return next(new Errors.Request.BadRequestError('id is missing', 101100));
    }

    if( !validator.isUUID(trayID) )
    {
        return next(new Errors.Request.BadRequestError('id should be a UUID', 101101));
    }

    var inputTray = findTray(trayID);

    if( !inputTray )
    {
        return next(new Errors.Request.BadRequestError('Tray ' + trayID + ' cannot be found', 101102));
    }
    if( !inputTray.ready )
    {
        return next(new Errors.Request.BadRequestError('Tray ' + trayID + ' has not been prepared, or prepare failed', 101109));
    }

    var inputFileID = inputTray.internal_file_id;
    var inputFile = files.find( inputFileID );
    if( !inputFile )
    {
        return next(new Errors.Request.ServerError('Internal server error', 311110));
    }
    var inputMeshesJSON = inputTray.meshes;
    var trayMeshIDs = inputMeshesJSON.map(function(mesh){ return mesh.id });

    var meshIDs = req.body.mesh_ids;
    if( meshIDs )
    {
        if( !(meshIDs instanceof Array) )
        {
            return next(new Errors.Request.BadRequestError('meshes should be an array', 101101));
        }

        if( meshIDs.length === 0)
        {
            return next(new Errors.Request.BadRequestError('meshes cannot be empty', 101101));
        }

        for (var i = 0; i < meshIDs.length; i++)  {
            var meshID = meshIDs[i];
            if( !meshes.find(meshID) ) {
                return next(new Errors.Request.BadRequestError('Mesh ' + meshID + ' cannot be found', 101103));
            }
            if( trayMeshIDs.indexOf(meshID) === -1 )
            {
                return next(new Errors.Request.BadRequestError('Mesh ' + meshID + ' is not in tray ' + trayID, 101104));
            }
        }
    }

    // No mesh ID's given means export all
    if( !meshIDs )
        meshIDs = trayMeshIDs;

    var visuals = req.body.generate_visual || false;

    logger.debug("exportSupports meshIDs: " + util.inspect(meshIDs));
    logger.debug("exportSupports generate_visual: " + visuals);

    var meshPaths = [];
    var meshFiles = [];
    var vizPaths = [];
    var vizFiles = [];

    // The mesh IDs list must be converted into a list of output file paths
    // for roopa server. An empty entry in this list means don't export the
    // support for that mesh.
    //
    for( var i = 0; i < trayMeshIDs.length; ++i )
    {
        var id = trayMeshIDs[i];

        // Is this mesh one of the ones requested for export?
        if( meshIDs.indexOf(id) === -1 )
        {
            meshPaths.push("");
            meshFiles.push(null);
            if( visuals )
            {
                vizPaths.push("");
                vizFiles.push(null);
            }
            continue;
        }
        var outputFile = new files.File();
        meshFiles.push(outputFile);
        meshPaths.push(outputFile.path);

        // If visual files are requested create the corresponding file resource:
        if( visuals )
        {
            var visualFile = new files.File(null, path.basename(outputFile.path) + ".blt");
            vizFiles.push(visualFile);
            vizPaths.push(visualFile.path);
            // console.log("VIZ: " + visualFile.path);
        }
    }

    var task = new tasks.Task();
    logger.info( 'exportSupports: creating task ' + task.getID() );

    // call RoopaServer
    var roopaInput = {
        "inputFile" : inputFile.path,
        "outputFiles" : meshPaths
    };
    if( visuals )
        roopaInput.visualFiles = vizPaths;
    
    var p = roopa.run( 'exportSupports.lua', roopaInput, task );
    p.then( function(data)
            {
                if( data.error )
                {
                    var msg = data.error.code + " " + data.error.message;
                    logger.error( 'exportSupports failed: ' + msg );
                    task.setError( new Errors.General.OperationError(msg, 301106) );
                    return;
                }
                logger.info( 'exportSupports worked!' );

                // Loop through results which should have one entry for each
                // mesh in the tray as in:
                // [ { saved: <bool>, path: "<path>", mesh: { <mesh data> } }, ... ]
                // Create a new mesh resource for each file. If "saved" is false
                // either we didn't request it or the mesh had no supports and the
                // output file can be deleted. If the generate_visual option was
                // specified each result should have the additional "visual_file_id" 
                // property with the path of the saved file.
                //
                var outputMeshes = [];
                var outputMeshesJSON = {};
                for( var j = 0; j < trayMeshIDs.length; ++j )
                {
                    var newMesh;
                    var meshResult = data[j];
                    var meshData = meshResult.mesh;
                    if( meshResult.saved && meshData )
                    {
                        if( meshResult.visual_file_id && vizFiles[j] )
                        {
                            // Convert path to file id:
                            // logger.debug("Mesh[" + j + "] viz file: " + meshResult.visual_file_id + " id: " + vizFiles[j].id);
                            meshData.visual_file_id = vizFiles[j].id;
                        }
                        else if( vizFiles[j] )
                        {
                            if( visuals )
                                logger.error("Requested visual file not generated: " + vizFiles[j].id);

                            logger.debug("Delete unused visual file: " + vizFiles[j].id);
                            vizFiles[j].remove();
                            vizFiles[j] = null;
                        }
                        newMesh = new meshes.Mesh( meshFiles[j], meshData );
                        logger.debug("New mesh: " + newMesh.id);
                        outputMeshes.push( newMesh );
                        outputMeshesJSON[trayMeshIDs[j]] = newMesh.asJSON();

                        if( vizFiles[j] )
                        {
                            // Add the visual file as a reference from the new mesh.
                            newMesh.addChild( vizFiles[j] );
                        }
                    }
                    else if( meshFiles[j] ) // Did we ask for one?
                    {
                        logger.info("No supports found for mesh " + trayMeshIDs[j] + " in tray " + id);
                        logger.debug("Delete unused mesh: " + meshFiles[j].id);
                        meshFiles[j].remove();
                    }
                }
                // Add the new meshes as children of the input tray.
                // TODO: Is this what we want?
                for( var i = 0; i < outputMeshes.length; ++i )
                    inputTray.addChild(outputMeshes[i]);

                task.setResult( outputMeshesJSON );
            },
            function( data )
            {
                logger.error( 'exportSupports failed!' );
                task.setError( new Errors.General.OperationError('Operation failed: ' + data, 301106) );
            } );

    // send the result
    res.status( 202 );
    res.send( task.asJSON() );
}


function getRouter()
{
    if( router )
        return router;
    
    router = express.Router();

    router.get( '/:id', getTray );
    router.post( '/', createTray );
    router.post( '/prepare', prepareTray );
    router.post( '/generate-printable', generatePrintable );
    router.post( '/export-support', exportSupports );
    router.post( '/generatePrintable', generatePrintable );
    router.post( '/exportSupport', exportSupports );

    router.post( '/translate', translatePrintable );
    return router;
}


function prune()
{
    logger.info('Pruning old trays.');

    // Prune any tray that has zero references.
    for (var trayId in trays) {
        var tray = trays[trayId];
        if (tray.getRefCount() === 0)
        {
            // Unref the children
            tray.removeAllChildren();
            delete trays[trayId];

            logger.info('   - deleted tray: ' + trayId );
        }
    }
}


module.exports = exports = {
    'Tray'   : Tray,
	'Router' : getRouter,
    'find'   : findTray,
    'prune'  : prune
};
