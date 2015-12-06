var _ = require('underscore')

function DeviceData(name, identifier, deviceType, data) {
	this.serviceName = name;
	this.identifier = identifier;
	this.type = deviceType;

    // Conventions
    // this.VID  = <decimal number>
    // this.PID  = <decimal number>

	//add all other data properties in self
	if(data){
		_.extend(this, data);
	}
}

module.exports = DeviceData;