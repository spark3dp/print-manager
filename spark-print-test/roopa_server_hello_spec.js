var frisby = require('frisby')
, config = require('./config.js')

frisby.create('GET /roopa/hello')
.get(config.URL + '/roopa/hello')
.expectStatus( 200 )
.expectHeaderContains('content-type', 'application/json')
.expectJSONTypes({
	"greeting" : Array
})
.afterJSON(function (json){
    var greeting = json.greeting;
    expect(greeting[0]).toEqual("hello");
})
.toss();
