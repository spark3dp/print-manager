var frisby = require('frisby');
var config = require('./config.js')
var util = require('util')

require('jasmine-expect');


var JSONTypes = {
    "id" : String,
    "status" : String,
    "progress" : Number,
};


function wait( data, next )
{
    frisby.create( "GET task" )
    .get( config.URL + '/print/tasks/' + data.task_id )
    .expectStatus( 200 )
    .afterJSON( function(json) {
        if( json.status === "done" )
        {
            data.result = json.result;
            next( data );
        }
        else if( json.status === "error" )
        {
            delete data.result;
            next( data );
        }
        else if( json.status === "running" )
        {
            wait( data, next );
        }
        else 
        {
            console.log("Unexpected response from task: " + util.inspect(json));
            next( data );
        }
    } )
    .toss();
}


module.exports = exports = {
    'JSONTypes' : JSONTypes,
    'wait' : wait
};
