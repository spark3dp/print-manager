print-manager
===========

Print Manager is a desktop utility which identifies and connects 3D printers and converts files for delivery to a particular model of 3D printer. The utility is used by Print Studio.

On supported 3D printers, Print Manager converts a set of native 3D printer commands into a format recognized by the supported printer models, allowing a "printable" file to be sent to a specific printer model.


This repository has further information at [Print Manager 1.1](https://spark.autodesk.com/developers/showcase/d0716b0d-5cb4-4959-9f10-032be8591c2a) 
and at [adding your printer] (https://spark.autodesk.com/developers/reference/introduction/printer-manufacturers-2/integrate-your-printer-model). 
Please note that accessing this information requires a login.

<b>To see full documentation of print-manager and download print studio, please request access to the developer portal at
 <a href="https://spark.autodesk.com/developers/" target="_blank">https://spark.autodesk.com/developers/</a>.</b>
 

For Print Manager to start you must download the geometry processor that is attached to the releases see [Print Manager Releases](https://github.com/spark3dp/print-manager/releases)

When unzipped please edit the localConfig.json file to use this.


## Quick Start  
1. Install node version 0.10.35 (not the latest) found here:
   http://blog.nodejs.org/2014/12/23/node-v0-10-35-stable/
   NOTE: You must have platform C++ tools to be able to build some modules.
2. cd spark-print-mgr 
3. Add localConfig.json to the spark-print-mgr directory with the following content (it contains the location to the prep server)

{
         "roopaServerPath" : "C:/SPARK/Release/runTime/RoopaServer.app/Contents/MacOS/RoopaServer"
}

   The above will work for Mac OS*.

4. npm install   
5. node Server.js (will start server on localhost:9998)  
6. Go to: http://localhost:9998/printdb/printertypes to see normal execution

You can fork this project and if you want submit contributions back you must complete the contributers agreement.
 
If see any issues please use the github issue mechanism. 
 
If Building on Windows make sure to install Bonjour SDK from the Apple Store and make sure the variable  BONJOUR_SDK_HOME is set to the location.   

*Here is an example of localConfig.json for Windows. 

{
         "roopaServerPath" : "C:\\Users\\joe\\Release\\runTime\\bin\\RoopaServer.exe",
}




