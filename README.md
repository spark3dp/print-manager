print-manager
===========

## This project is no longer being maintained or updated.

Print Manager is a desktop utility which identifies and connects 3D printers and converts files for delivery to a particular model of 3D printer. The utility is used by Print Studio.

On supported 3D printers, Print Manager converts a set of native 3D printer commands into a format recognized by the supported printer models, allowing a "printable" file to be sent to a specific printer model.

<b>To download print studio, please see installer attached to [Print Manager Releases](https://github.com/spark3dp/print-manager/releases)</b>
 
If you are a printer manufacturer interested in integrating your printer with Print Manager then read the PDF  "Adding a printer to Spark PrintManager"

For Print Manager to start you must download the geometry processor that is attached to the releases see [Print Manager Releases](https://github.com/spark3dp/print-manager/releases)

When unzipped please edit the localConfig.json file to use this.


## Quick Start  
1. Install node version 0.11.16 (not the latest) found here:
   https://nodejs.org/download/release/v0.11.16/
   NOTE: C++ platform tools are required to build some of the modules.
2. CD spark-print-mgr 
3. Add localConfig.json to the spark-print-mgr directory with the following content (it contains the location to the prep server)

{
         "roopaServerPath" : "/Users/bob/Documents/RoopaServer.app/Contents/MacOS/RoopaServer"
}

   The above will work for Mac OS*.

4. npm install   
5. node Server.js (will start server on localhost:9998)  
6. Go to: http://localhost:9998/printdb/printertypes to see normal execution

You can fork this project. If you want to submit contributions, please complete the contributers agreement.
 
If you see any issues please use the github issue mechanism. 
 
If you are building on Windows, install Bonjour SDK from the Apple Store and make sure the variable  BONJOUR_SDK_HOME is set to the location.   

*Here is an example of localConfig.json for Windows. 

{
         "roopaServerPath" : "C:\\\Users\\\joe\\\Release\\\runTime\\\bin\\\RoopaServer.exe",
}




