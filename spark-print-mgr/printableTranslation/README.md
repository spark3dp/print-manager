## Creating a new translator
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
  
For examples, see existing translators in the printableTranslation/translators directory.  
