var Q = require('q'),
    os = require('os'),
    spawn = require('child_process').spawn,
    fs = require('fs'),
    config = require('./config').config,
    logger = require('./logging/PrintManagerLogger');

var RoopaServer;
var ScriptsPath;

function stdio (process, progressCallback)
{
    // Return a promise that resolves to a buffer with RoopaServer's
    // response.
    var deferred = Q.defer();
    var buff = null;
    var tickTock = 0;

    function oneSecondTick()
    {
        tickTock = tickTock + 1;
        // console.log(((tickTock & 1) ? "tick" : "tock") + ": " + tickTock);

        if( tickTock >= config.roopa_server_timeout )
        {
            logger.debug("TIMEOUT Killing roopa after: " + tickTock + " seconds" );
            // This will trigger the "close" event which will reject the promise.
            process.kill();
        }
    }

    var timer = setInterval(oneSecondTick, 1000);


    process.stdout.on('data', 
                  function (data) 
                  {
                      if( buff == null )
                      {
                          buff = data;
                      }
                      else
                      {
                          buff = Buffer.concat( [buff, data] );
                      }
                  } );

    process.stderr.on( 'data',
                   function( data )
                   {
                       var lines = data.toString().split('\n');
                       for( var i = 0; i < lines.length; ++i )
                       {
                           var input = lines[i];
                           if( input )
                           {
                               logger.debug('update from roopa: ' + input);
                               var argv = input.split(' ');

                               if( argv[0] === "progress" )
                               {
                                   tickTock = 0;    // Reset timeout

                                   if (progressCallback) {
                                       progressCallback(parseFloat(argv[1]));
                                   }
                               }
                           }
                       }
                   } );

    process.on( 'close',
            function( code, signal )
            {
                clearInterval(timer);

                logger.debug('roopa exited with code: ' + code + " / " + signal);

                var str = "null";
                if( buff )
                {
                    str = buff.toString();
                    logger.debug('roopa stdout: ' + str);
                }

                if( code == 0 )
                {
                    try {
                        var response = JSON.parse(str);
                        if( (response instanceof Array) && response.length === 2 )
                            deferred.resolve( response[0] ? response[0] : { error: response[1] } );
                        else
                            deferred.resolve( response );
                    }
                    catch(ex) {
                        logger.error('Invalid server response:' + str);
                        deferred.reject( 500 );
                    }
                }
                else
                    deferred.reject( signal ? signal : code );
            } );

    return deferred.promise;
}


function initialize()
{
    RoopaServer = config.roopaServerPath;
	ScriptsPath = __dirname + '/roopaScripts/';
    logger.debug('scripts path=' + ScriptsPath);
    try {
        if (!fs.statSync(RoopaServer).isFile()) {
            logger.error('roopaServerPath does not point to a file:', RoopaServer);
            process.exit(1);
        }
    } catch (err) {
        logger.error('roopaServerPath is not set or a bad path', err);
        process.exit(1);
    }
}


function run( roopaScript, input, task, progressCallback )
{
	var script = ScriptsPath + roopaScript;
    var platform = os.platform();
    if( platform == "darwin" || platform == "linux" || platform == "win32")
    {
        // spawn the server
        var process = spawn( RoopaServer, ['-s', script, '-p'] );

        // write the input, if any
        if( input )
        {
            var str = JSON.stringify( input );
            logger.debug('roopa input: ' + str);
            process.stdin.end( str );
        }

        if(task && !progressCallback) {
            progressCallback = function(progress) {
                task.progress = progress;
            }
        }
        
        return stdio(process, progressCallback);
    } 
    else
    {
        logger.error("RoopaServer not yet supported on platform: " + platform);
        return null;
    }
}


function hello()
{
    return run( 'hello.lua' )
}


module.exports = exports = {
    "initialize" : initialize,
    "hello" : hello,
    "run" : run
};//noinspection JSUnresolvedFunction
