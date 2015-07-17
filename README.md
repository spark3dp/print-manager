print-manager
===========

Provides desktop support for printer management and print preparation.

This Repository corresponds to Print Manager 1.1 which is available at. ....

For print-manager to start you must download the geometry processor from ....
When unzipped please edit the localConfig.json file to use this.


## Quick Start  
1. Install node version 0.10.35 (not the latest) found here:
   http://blog.nodejs.org/2014/12/23/node-v0-10-35-stable/
   NOTE: You must be have platform C++ tools to be able to build some modules.
2. cd spark-print-mgr 
3. Add localConfig.json to the spark-print-mgr directory with the following content (it contains the location to the prep server)
{
         "roopaServerPath" : "C:/SPARK/Release/runTime/RoopaServer.app/Contents/MacOS/RoopaServer"
}
   The above will work for macos.
4. npm install   
5. node Server.js (will start server on localhost:9998)  
6. Go to: http://localhost:9998/printdb/printertypes to see normal execution

<b>To see full documentation of print-manager and download print studio, please request access to the developer portal at
Spark APIs are current in beta: <a href="https://spark.autodesk.com/developers/" target="_blank">Request access</a>.</b>




