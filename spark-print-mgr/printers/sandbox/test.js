var fs = require("fs");                    //imports filesystem module
var split = require("split");            //imports the split modulde

var serialport = require("serialport"); //imports serialport module
var SerialPort = serialport.SerialPort; //creates a local instance of serial

//global scope variables
var fileEncoding = "utf8";                //input gcode encoding
var gcodeLoaded = [];                    //array to store loaded gcode
var gcodeParsed = [];                    //array to store parsed gcode
var printerSerial = [];                    //array to store serial port connections
var filenameIn = "C:/Users/croketm/SparkPrint/SparkPrintnode/printers/sandbox/filename.gcode";
var filenameOut = "C:/Users/croketm/SparkPrint/SparkPrintnode/printers/sandbox/filenameParsed.gcode";

var fileLoaded = false;                    //initial state is file not loaded
var commandIndex = 0;                    //initial command index
var fileCommandIndex = 0;                //initial fileIndex
//global scope variables


/*
function usage:
1)connectSerialPrinter
2)listenSerialPrinter

1)connectSerialPrinter
2)printFileSerialPrinter

*/

//fileParser (filenameIn);

connectSerialPrinter(54, "COM8", 115200);
//listenSerialPrinter(54);
printFileSerialPrinter(54, filenameIn);
//disconnectSerialPrinter(54);

function disconnectSerialPrinter (ID) {
    printerSerial[ID].close(function(err){
        if(err) {
            logger.info(err);
        }
        else {
            logger.info("Serial Port Closed");
        }
    });
}

function pauseSerialPrinter (ID) {
//need to find some way to interrupt the printFileSerialPrinter() function
//e.g. use global variable "pause" and run condition within loop while(!pause) {}

}

function pauseSerialPrinterSDPrint (ID) {
    printerSerial[ID].write("M25\n");
}

function resumeSerialPrinterSDPrint (ID) {
    printerSerial[ID].write("M24\n");
}

function fileParser (filenameIn) //parses out the non-gcode lines
{
    gcodeLoaded = fs.readFileSync(filenameIn, "utf8").toString();
    gcodeLoaded = gcodeLoaded.split("\n");

    var j = 0;
    for (var i = 0; i < gcodeLoaded.length; i++) {
        if ((gcodeLoaded[i].charAt(0) != " ") && (gcodeLoaded[i].charAt(0) != "\r") && (gcodeLoaded[i].charAt(0) != ";")) {
            var semicolonIndex = gcodeLoaded[i].indexOf(";")
            if(semicolonIndex>-1) {
                gcodeParsed[j]=gcodeLoaded[i].substr(0, semicolonIndex);
                j++;
            }
            else {
                gcodeParsed[j]=gcodeLoaded[i];
                j++;
            }
        }
    }
    return gcodeParsed;
    //gcodeParsed = gcodeParsed.join("\n");
    //fs.writeFileSync(filenameOut, gcodeParsed);
}

function gcodeCheckSum (commandIndex, command) { //adds line number and checksum to command 
//put code here
    var checksumCommand = "";
    var cs = 0;

    command = "N" + commandIndex.toString() + " " + command.substr(0,command.length-1);
    for (var i = 0; command[i] != "\r", i < command.length-1; i++) {
        cs = cs ^ command[i];
    }
    cs &= 0xff;
    parsedCommand = command.toString() + "*" + cs.toString() + "\n";

    return checksumCommand;
}

function sendCommandSerialPrinter (ID, command) {
    //put code here
    printerSerial[ID].write(command + "\n");
}

function injectCommandSerialPrinter (ID, command) {//need to figure out how to inject command into printing sequence
    //all commands are 
    //if one of the allowable commands to inject: (fan speed,et etc,)
    printerSerial[ID].write(command + "\n");
}

function connectSerialPrinter (ID, port, baud) {
    printerSerial[ID] = new SerialPort(port, {baudrate: baud, 
        parser: serialport.parsers.readline("\n")});

    printerSerial[ID].on("open", function(){
        logger.info("Serial Port Opened");
    })
}

function listenSerialPrinter (ID) {
    printerSerial[ID].on("data", function(data){
        logger.info(data);
    });
}

//ID of Printer, port, baud, and filename inputs
function printFileSerialPrinter (ID, filenameIn) {
    
    gcodeParsed = fileParser(filenameIn);

    printerSerial[ID].on("data", function(data){
        logger.info(data);

        if (data.toString(fileEncoding,0,4)=="start" || data.toString(fileEncoding,0,1) === "ok") {
            parsedCommand = gcodeCheckSum (commandIndex, gcodeParsed[fileCommandIndex]);
            //printerSerial[ID].write(parsedCommand);
            printerSerial[ID].write(gcodeParsed[fileCommandIndex]+"\n");
            logger.info("file command: " + gcodeParsed[fileCommandIndex]);
            logger.info("checksum command: " + parsedCommand);
            commandIndex += 1;
            fileCommandIndex += 1;
        }

        else if (data.toString(fileEncoding,0,1) === "rs" || data.toString(fileEncoding,0,5)=="resend") {
            printerSerial[ID].write(gcodeParsed[fileCommandIndex]);
            //printerSerial[ID].write(parsedCommand +"\n");
            logger.info("file command: " + gcodeParsed[fileCommandIndex]);
            logger.info("checksum command: " + parsedCommand);
        }
            
        else if (data.toString(fileEncoding,0,1) === "!!" || data.toString(fileEncoding,0,4) === "Error") {
            disconnectSerialPrinter (ID);
            return;
        }
        else
            return;
    });
}


