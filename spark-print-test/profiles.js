var frisby = require('frisby');
var config = require('./config.js')

require('jasmine-expect');


function findEmber( data, next )
{
    frisby.create( "GET profiles" )
    .get( config.URL + '/printdb/profiles' )
    .expectStatus( 200 )
    .afterJSON( function(json) {
        expect(json).toBeObject();
        
        var profiles = json.profiles;
        expect(profiles).toBeArray();
        
        var ember = null;
        for( i = 0; i < profiles.length; ++i )
        {
            var id = profiles[i].id;
            expect(id).toBeString();
            if( profiles[i].name == "Ember High Quality" )
            {
                ember = profiles[i];
                break;
            }
        }
        
        data.profile = ember;
        next( data );
    } )
    .toss();
}


module.exports = exports = {
    'findEmber' : findEmber
};
