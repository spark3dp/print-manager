var _ = require('underscore');
var localConfig = require('./localConfig.json')

var config = {
    'URL' : 'http://localhost:9998',
    'excluded_tests' : [ 
	    'dremel_print_spec.js',
	    'reprap_print_spec.js', 
        'type_a_print_spec.js'
    ]

};

config = _.extend( config, localConfig );


module.exports = exports = config;
