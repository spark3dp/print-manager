var util = require('util'),
    Promise = require('promise'),
    fs = require('fs'),
    path = require('path'),
    _ = require('underscore'),

    FDMTranslatorMarlin = require('./FDMTranslatorMarlin');

var FDMTranslatorDelta = function(printerType, printerProfile, material, config) {
    FDMTranslatorMarlin.call(this, printerType, printerProfile, material, config);
    
    this.bedOffset = this.printerType.build_volume.bed_offset;
    this.isDelta = (this.printerType.build_volume.type=="Cylindrical");
    this.isHome = false;
};

util.inherits(FDMTranslatorDelta, FDMTranslatorMarlin);

/**
 * Printrbot homing and start sequence will occur in the profile
 */
FDMTranslatorDelta.prototype.convertHomeAxes = function(command) {
    if(this.isHome == false){
        this.isHome = true;
        return "G28; home\n";
    }
    return "";
};

/**
 * In the case that a command contains an array of axes movements
 * Process each movement, but on the first movement,
 * append any necessary initial parameters
 *
 * If the first command's movement is negligable then make sure to 
 * append significant initial parameters to the next significant command
 *
 * @param {Object} command
 * @returns {string} line
 */
FDMTranslatorDelta.prototype.processAxesArray = function(command) {
    var self = this;
    var line = "";
    var axes = this.activeAxes(command);
    var commandArrayAxes = axes[0];
    var commandInitialAxes = axes[1];
    var n_commands = axes[2];

    var storeF = undefined; 
    // Hold on to significant feedrate changes in case initial movement is negligible 
    for(var i = 0; i < n_commands; i++) {

        var canceledEMove = false;
        var commandLine = "G1";

        if (typeof(command.x[i]) === 'number') {
            if(this.isDelta) command.x[i] += this.bedOffset[0]*10;
            commandLine += self.redundancyCheck(command, {'x': this.AXES[0].x}, i);
        }
        if (typeof(command.y[i]) === 'number') {
            if(this.isDelta) command.y[i] += this.bedOffset[1]*10;
            commandLine += self.redundancyCheck(command, {'y': this.AXES[1].y}, i);
        }
        if (typeof(command.z[i]) === 'number') {
            commandLine += self.redundancyCheck(command, {'z': this.AXES[2].z}, i);
        }
        if (typeof(command.e[i]) === 'number') {
            if (commandLine !== "G1" || command.type === 3) {
                commandLine += self.redundancyCheck(command, {'e': this.AXES[3].e}, i);
            } else {
                // If there is no movement or if movement is negligible
                canceledEMove = true;
            }
        }
        if (typeof(command.f[i]) === 'number') {
            var fValue = self.redundancyCheck(command, {'f': this.AXES[4].f}, i)
            if (!canceledEMove) {
                commandLine += fValue;
            } else {
                // Save the F value for the next significant movement
                storeF = fValue;
            }
        } else if (storeF !== undefined) {
            commandLine += storeF;
            storeF = undefined;
        }

        // Get rid of negligible lines
        if (commandLine === "G1") {
            commandLine = "";
        }
        line += this.postProcessLine(command, commandLine);
    }
    return line;
};

module.exports = FDMTranslatorDelta;
