var Logger = require('./Logger'),
    config = require('../config').config;

module.exports = new Logger(config.logger_options);
