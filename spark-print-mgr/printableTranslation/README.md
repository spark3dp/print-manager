## Spark Printable File Format Conversion and Translation for 3D Printers

#### Overview
- .MIC and .PB are files encoded using the ProtoBuf library to make a compressed binary version of an an array of JSON objects representing machine-specific headers, commands, and slices.

- There are 4 layers to establishing a new MIC translation for 3D Printers.  The following is an example for FDM style technology 3D Printers:
```
  1.  Reading Printable File:                         {Technology}Reader.js inherits PrintableReader.js
  2.  Translation of Printable File into Components:  {Technology}Translator.js inherits Translator.js
  3.  Printer Specific Translation:                   [{Technology}Translator{PrinterName.js} | {Technology}{PrinterFirmwareType.js}] inherits {Technology}Translator.js
  4.  Application Accessible Classes:                 ./translators/{PrinterName.js}
```
-------
#### 1. Structure of Reading Printable File: e.g. ```FDMReader.js``` & ```PrintableReader.js```

- Contains the top level objects callable functions from the Translation Module.

- Uses the ProtoBuf library to compress a JSON object containing machine instructions into a binary.
  - FDM technology specific ```FDMReader.js``` inherits from ```PrintableReader.js```
    - loads iterable ```header``` elements from printable .MIC file into data stream from ```ProtoBuf.loadProtoFile()```
    - loads iterable ```command``` elements from printable .MIC file into data stream from ```ProtoBuf.loadProtoFile()```
  - DLP technology specific ```DLPReader.js``` inherits from ```PrintableReader.js```
    - loads iterable ```header``` elements from printable .PB file into data stream from ```ProtoBuf.loadProtoFile()```
    - loads iterable ```slice``` elements from printable .PB file into data stream from ```ProtoBuf.loadProtoFile()```


-------
#### 2. Structure of Translation of Printable File into Components: e.g.  ```FDMTranslator.js``` & ```Translator.js```

- Ammends the top level objects callable functions from the Translation Module with Technology Specific Elements.

-  Here methods are instantiated where you perform the translation from the ```slice```, ```command```, or ```header``` elements in the printable file to the format that the printer understands.  Note, if a translation method defined is asynchronous (such as when writing to a file immediately), you can return a Promise, and resolve it when the asynchronous operation is complete.  Once the Promise is resolved, then the next next slice or command will be read and the translation continues.

- Getters:
```
Translator.getPrinterType()
Translator.getPrinterProfile()
Translator.getMaterial()
Translator.getProgress()
```

- Setters:
```
Translator.setProgress(progress)
Translator.setConfig(config)                          //inherits definition later
```

- Functions:
```
Translator.canTranslate(printerType, printerProfile, material)
Translator.translate(inputPath, outputPath, options)
Translator.endTranslation(outputPath)                  //inherits definition later (e.g. Dremel.js header)
Translator.startTranslation(inputPath, outputPath) 	//inherits definition later
```


- FDM technology specific translations ```FDMTranslator.js``` inherits from ```Translator.js```
  * enumerates printer configuration command specific machine code types and instantiates translation functions to act on for each (e.g. ```convertSetTempNozzle(inCommand)```)
  * parses out header elements from data stream for translation methods defined in ```FDMTranslatorMakerbot.js, FDMTranslatorMarlin.js, or Dremel.js, {PrinterName.js}, etc.```
  * parses out command elements from data stream for translation methods defined in ```FDMTranslatorMakerbot.js, FDMTranslatorMarlin.js, or Dremel.js, {PrinterName.js}, etc.```


- DLP technology specific translations ```DLPTranslator.js``` inherits from ```Translator.js```
  * parses out header elements from data stream for translation methods defined directly in ```./translators/Autodesk-Ember.js```
  * parses out slices elements from data stream for translation methods defined directly in ```./translators/Autodesk-Ember.js```


-------


#### 3. Structure of Printer Specific Translation: e.g. ```FDMTranslator[{PrinterName.js} | {PrinterFirmwareType.js}]```

- Defines detailed printer (e.g. "firmware") specific methods implemented on top of the ```{Technology}Translator``` Class instantiated methods.

- Example for FDMTranslatorMakerbot.js, if command is of enumerated type ```SET_TEMP_NOZZLE```:
  ```
  FDMTranslator.prototype.convertCommand = function(inCommand) {
	   case this.COMMAND_TYPE.SET_TEMP_NOZZLE:
        outCommand = this.convertSetTempNozzle(inCommand);
     break;

  }

  FDMTranslatorMakerbot.prototype.convertSetTempNozzle = function(command) {
     var line = "";
     line += "M104 S";
     line += this.numToString(command.nozzle_temp, this.precision.s) + " T0";
     if(command.nozzle_temp > 0) {
         line += this.verbose ? '; wait for nozzle to reach temperature\n' : '\n';

         line += "G130 X20 Y20 A20 B20";
         line += this.verbose ? '; lower stepper vrefs while heating\n' : '\n';

         line += "M133 T0";
         line += this.verbose ? '; wait for nozzle to reach temperature\n' : '\n';

         line += "G130 X127 Y127 A127 B127";
         line += this.verbose ? '; set stepper motor vref to defaults\n' : '\n';
     } else {
         line += this.verbose ? '; turn off the extruder\n' : '\n';
     }
     return line;
  };
  ```

-------

#### 4. Structure of Application Accessible Classes: e.g. ```./translators/{PrinterName.js}```

- Contains more methods implemented on top of the ```{TechnologyTranslator``` Class defined in ```Translator.js```.

- Contains the application callable functions for a specific printer type translation.
- Accesses library of methods via top-level require statement:

- Set Top Level Printer Translator Inheritance Dependency:
```
Autodesk-Ember.js:   var DLPTranslator = require('../DLPTranslator')
Replicator2.js:      var FDMTranslatorMakerbot = require('../FDMTranslatorMakerbot')
Dremel.js:	       var FDMTranslatorMarlin = require('../FDMTranslatorMarlin')
TypeA.js:	        var FDMTranslatorMarlin = require('../FDMTranslatorMarlin')
Ultimaker.js:	    var FDMTranslatorMarlin = require('../FDMTranslatorMarlin')
...
```

- Expose Top Level Printer Translation Class with Methods callable by Print Manager: (e.g. ```Replicator2Translator.translate()```)
```
Autodesk-Ember.js:   EmberTranslator()        Class & Associated Methods
Replicator2.js:      Replicator2Translator()  Class & Associated Methods
Dremel.js:	       DremelTranslator()       Class & Associated Methods
TypeA.js:	        TypeATranslator()        Class & Associated Methods
Ultimaker.js:	    UltimakerTranslator()    Class & Associated Methods
...
```

- Ammend Top Level Printer Translation Class with printer specific UUID verification method ```canTranslate()``` method which returns boolean before translation is allowed:
```
e.g.
DremelTranslator.canTranslate = function (printerType, profile, material) {
    return printerType.id === "3F64F6EC-A1DF-44AB-A22E-58C036F2F474";
};
...
```

- Ammend Top Level Printer Translation Class with anything else: e.g. ```./translators/Dremel.js``` appends a binary header of proprietary format to the gcode commands at end
```
DremelTranslator.prototype.endTranslation(){
  fs.readFile(bitmapFilename, function (err, result) {
      if (err) {
          return reject(err);
      }
      var bmp = result;
      var header = createG3dremHeader(bmp.length, estimatedPrintTime, estimatedMaterialLength);
      var gcodeBuffer = new Buffer(gcode);
      var g3drem = Buffer.concat([header, bmp, gcodeBuffer]);
      fs.writeFileSync(outputPath, g3drem);

      resolve();
}
```

-------

#### Example: Creating a New Translator

1.  Derive a new class, say ```MyTranslator```, from one of these translators:
  - ```DLPTranslator``` for DLP printers
  - ```FDMTranslator``` for FDM printers

2.  Implement the ```MyTranslator.canTranslate(printerType, printerProfile, material)``` class method.  This should return true if this translator handles the given combination of printer, profile, and material; false otherwise.  
For example, the method might check that the printer type's id matches the printer for this translator.  Important - ensure ```prototype``` does not appear in the signature as it is a class method.

3.  Optionally, override the ```MyTranslator.prototype.startTranslation(inputFile, outputFile)``` instance method.  This could do operations like open an output file for write.  Be sure to call the base class ```startTranslation```, returning its value.  For example:
  ```
  MyTranslator.prototype.startTranslation = function(inputFile, outputFile) {
    ... do something ...
    return DLPTranslator.prototype.startTranslation.apply( this, [inputPath, outputPath] );
  }
  ```
4.  Override the ```MyTranslator.prototype.onHeader = function (header)``` instance method.  
  * For DLPTranslator-derived classes, implement the ```MyTranslator.prototype.onSlice = function (index, slice)`` instance method.
  * For FDMTranslator-derived classes, implement the ```MyTranslator.prototype.onCommand = function (command)`` instance method.

  These are the methods where you perform the translation from the slice or command to the format that the printer understands.  Note, if the translation is asynchronous (such as when writing to a file immediately), you can return a Promise, and resolve it when the asynchronous operation is complete.  Once the Promise is resolved, then the next next slice or command will be read and the translation continues.

5.  Override the ```MyTranslator.prototype.endTranslation = function (outputFile)``` instance method.  Here you can do operations such as:
  * open the output file for write (if you didn't already do so earlier)
  * write the translated contents to the output file (if you weren't doing so during the processing of the slices or commands)
  * finalize and close an output file that was opened earlier

6.  Add a unit test under test/printers/translators directory.  You can run the tests by going to the spark-print-mgr directory and typing:
  ```
  npm test
  ```
  Ensure all the unit tests are passing before making the check-in.

For more examples, see existing translators in the printableTranslation/translators directory.  

-------
