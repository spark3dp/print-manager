var app = require('./app'),
    config = require('./config').config;


if (config.localhost_only) {
    // Allow only requests from the local host. 
    app.listen(config.PORT, '127.0.0.1');
}
else {
    // Open the server to all other computers.
    app.listen(config.PORT, '0.0.0.0');
}

