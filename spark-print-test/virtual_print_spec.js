var frisby = require('frisby')
, fs = require('fs')
, path = require('path')
, FormData = require('form-data')
, form = new FormData()
, URL = 'http://localhost:9998'
, testpath = path.resolve(__dirname + '/files/temp3.gcode')
, printer_id
, file_id
, harness = require('./harness.js')
, job_id;

form.append('file_1', fs.createReadStream(testpath), {
  knownLength: fs.statSync(testpath).size         // we need to set the knownLength so we can call  form.getLengthSync()
});

var tests = [
             addPrinter,
             getPrinters,
             uploadFile,
             createJob,
             setFileToJob,
             uploadJobToPrinter,  //uploadJobToPrinter does the same thing as start print
             delay,
             getStatus //, startPrint
];

function recursiveTests(){
  if(tests.length > 0){
    tests[0]();
    tests.splice(0, 1);//remove first element from array
  }
}

harness.runTests( [function (data, next){
  recursiveTests(tests);
}]);

function delay() {
  waits(1000);
  frisby.create('delay 1000ms')
  .get(URL + '/print/printers')
  .afterJSON(function(json) {
    recursiveTests();
  })
  .toss();
}

function addPrinter() {
    var printer = {
        "name" : "My virtualPrinter",
            "type_id" : "7FAF097F-DB2E-45DC-9395-A30210E789AA",
            "deviceData" : {
            "type" : "virtual"
                }
    };
    frisby.create('addPrinter')
        .post(URL + '/print/printers/local', printer)
        .afterJSON(function(json){
                recursiveTests();
            })
        .toss();
}
function getPrinters(){
    console.log("\n\n\ninside getPrinters");
  frisby.create('getprinters')
  .get(URL + '/print/printers?name=My%20virtualPrinter')
  .afterJSON(function (json){
    printer_id = json.printers[0].id;
    recursiveTests(json);
  })
  .toss();
}


function uploadFile(){
  //Upload file to print manager
  frisby.create('upload file')
  .post(URL + '/files/upload', form, { json: false,
    headers: {
      'content-type': 'multipart/form-data; boundary=' + form.getBoundary(),
      'content-length': form.getLengthSync()
    }
  })
  .expectStatus(200)
  .expectHeaderContains('content-type', 'application/json')
  .expectJSONTypes({
    files : Array
  })
  .afterJSON(function(json) {
    file_id =  json.files[0].file_id;
    console.log('file_id', file_id);
    recursiveTests();
  })
  .toss();
}

function createJob(){
  // create job with file that was uploaded
  frisby.create('create job')
  .post(URL +'/print/jobs', {file_id : file_id, printer_id : printer_id})
  .expectStatus(201)
  .afterJSON(function(json){
    job_id = json.job_id;
    console.log('job_id:', job_id);
    recursiveTests();
  })
  .toss();
}

function setFileToJob(){
  //  set file to job
  frisby.create('assign file to job')
  .post(URL + '/print/jobs/' + job_id + '/setPrintable', {
    'file_id' :  file_id
  })
  .expectStatus(200)
  .afterJSON(function (json) {
    recursiveTests();
  })
  .toss();
}

function uploadJobToPrinter(){
  console.log("printer_id here",printer_id);
  frisby.create('upload a job to virtual ember')
  .post(URL + '/print/printers/' + printer_id + '/command', {
    'command' : 'print',
    'job_id' : job_id
  })
  .expectStatus(200)
  .afterJSON(function(json){
    console.log('command: print', json);
    recursiveTests();
  })
  .toss();
}

function startPrint(){
  // Disclaimer: This test is unnecessary and bad form for standard virtual ember use.
  // During normal use should inspect printer and manually start print.
  frisby.create('Start virtual ember print')
  .post(URL + '/print/printers/' + printer_id + '/command', {
    'command' : 'start',
    'job_id' : job_id
  })
  .afterJSON(function(json){
    console.log("starting print:", json);
    recursiveTests();
  })
  .toss();
}

function getStatus(){
  // Disclaimer: This test is unnecessary and bad form for standard virtual ember use.
  // During normal use should inspect printer and manually start print.
  frisby.create('Start virtual ember print')
  .post(URL + '/print/printers/' + printer_id + '/command', {
    'command' : 'getstatus',
  })
  .expectStatus(200)
  .afterJSON(function(json){
    console.log("printer status: \n", json);
    recursiveTests();
  })
  .toss();
}


function cancelPrint(){
  frisby.create('Cancel virtual ember print')
  .post(URL + '/print/printers/' + printer_id + '/command', {
    'command' : 'reset',
    'job_id' : job_id
  })
  .afterJSON(function(json){
    console.log("Cancelling print:", json);
    recursiveTests();
 })
  .toss();
}

function getStatus(){
  frisby.create('Get Status')
  .post(URL + '/print/printers/' + printer_id + '/command', {
    'command' : 'getstatus',
    'job_id' : job_id
  })
  .afterJSON(function(json){
    console.log(json);
    recursiveTests();
  })
  .toss();
}

