var frisby = require('frisby');
var config = require('./config.js')

require('jasmine-expect');


function findEmber( data, next )
{
    frisby.create( "GET printerTypes" )
    .get( config.URL + '/printdb/printertypes' )
    .expectStatus( 200 )
    .afterJSON( function(json) {
        expect(json).toBeObject();
        
        var printerTypes = json.printerTypes;
        expect(printerTypes).toBeArray();
        
        var ember = null;
        for( i = 0; i < printerTypes.length; ++i )
        {
            var id = printerTypes[i].id;
            expect(id).toBeString();

            if( printerTypes[i].name == "Ember" )
            {
                ember = printerTypes[i];
                break;
            }
        }

        expect(ember).toBeObject();
        
        data.printerType = ember;
        next( data );
    } )
    .toss();
}


module.exports = exports = {
    'findEmber' : findEmber
};
