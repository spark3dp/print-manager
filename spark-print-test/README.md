SparkPrintTest
==============

Unit Testing module for sparkPrint Server.
#How to Run
    npm install
    npm install -g jasmine-node
    create empty localConfig.json containing: {}
    start print manager server in another shell: (cd ../spark-print-mgr; node server.js)
    load printer database into server: (cd ../spark-print-client; spark.py uploadDB ../spark-print-data)
    jasmine-node .

#How to add a test
    create a file <name>_spec.js
    write test using frisby
    run test using "jasmine-node <name>_spec.js"
    or if print manager server is not runing use: "bash test.sh <name>_spec.js"
