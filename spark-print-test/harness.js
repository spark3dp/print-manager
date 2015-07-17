// a helper function for runTests()
var path = require('path')
, _ = require('underscore')
, config = require('./config.js')

function getCallerFile() {
    try {
        var err = new Error();
        var callerfile;
        var currentfile;

        Error.prepareStackTrace = function (err, stack) { return stack; };

        currentfile = err.stack.shift().getFileName();

        while (err.stack.length) {
            callerfile = err.stack.shift().getFileName();

            if(currentfile !== callerfile) return callerfile;
        }
    } catch (err) {}
    return undefined;
}

function canRun(callerPath){
    var name = path.basename(callerPath);
    if(name && _.contains(config.excluded_tests, name)){
        console.log('not running tests from: ', name);
        return false;
    } else {
        console.log('running tests from: ', name);
        return true;    
    }
}

function runTestsHelper( tests, index, data1, last )
{
    // make a function that proceeds after the first test
    var next = function( data2 ) {
        var nextIndex = index + 1;
        if( nextIndex < tests.length )
        {
            runTestsHelper( tests, nextIndex, data2, last );
        }
        else if( last )
        {
            last( data2 );
        }
    };

    // run the first test
    tests[index]( data1, next );
}


// Run a list of tests in sequence.
function runTests( allTests )
{
    if(canRun(getCallerFile())) {
        var data = {};
        runTestsHelper( allTests, 0, data, null );
    }
}


// Wrap a list of tests into a function.
function wrap( tests )
{
    return function( data, next ) {
        runTestsHelper( tests, 0, data, next );
    };
}


module.exports = exports = {
    'runTests' : runTests,
    'wrap' : wrap
};
