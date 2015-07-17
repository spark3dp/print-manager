var frisby = require('frisby')
, fs = require('fs')
, path = require('path')
, FormData = require('form-data')
, form = new FormData()
, URL = 'http://localhost:9998'
, testpathfail = path.resolve(__dirname + '/files/cube.tar.gz')
, testpath = path.resolve(__dirname + '/../spark-print-mgr/test_hardware/test_files/cube_ember.tar.gz')
, harness = require('./harness.js')
, printer_id
, file_id
, job_id;

form.append('file_1', fs.createReadStream(testpath), {
  knownLength: fs.statSync(testpath).size         // we need to set the knownLength so we can call  form.getLengthSync()
});

var tests = [
    getPrinter          // find our printer
    , getStatusInitial    // get printer's initial status
    , uploadFile          // upload a file to printmanager
    , createJob           // create a job on printmanager
    , setFileToJob        // assign file to job
    , uploadJobToPrinter  // send file to printer
    , getStatusJobReady   // get printer's status with job sent
    , startPrint          // start job
    /*, getStatusPrinting   // get printer's status with job started
    , pausePrint          // pause print
    , getStatusPaused     // get printer's status with job paused
    , resumePrint         // resume print
    , getStatusResumed    // get printer's status with job resumed
    , cancelPrint         // cancel print
    , getStatusCancelled  // get status with print job cancelled */
];

//recursiveTests();
function recursiveTests(){
  if(tests.length > 0){
    tests[0]();
    tests.splice(0, 1);//remove first element from array
  }
}


harness.runTests( [function (data, next){
   recursiveTests(tests);
}]);


/*
function testFunction(){
  frisby.create('Test description')
  .post('http://someurl', {
    'key1' : 'value1',
    'key2' : 'value2'
  })
  .expectSomething
  .afterJSON(function(json){
    process(json);
    recursiveTests();
  })
  .toss();
}
*/



function getPrinter(){
  frisby.create('get printer')
  .get(URL + '/print/printers?type_id=7FAF097F-DB2E-45DC-9395-A30210E789AA')
  .afterJSON(function (json){
    console.log('printer_id', json.printers[0].id);
    printer_id = json.printers[0].id;
    recursiveTests(json);
  })
  .toss();
}

function getStatusInitial(){
  frisby.create('Get Initial Status')
  .post(URL + '/print/printers/' + printer_id + '/command', {
    'command' : 'getStatus',
    'job_id' : job_id
  })
  .afterJSON(function(json){
    expect(json.state === 'Ready');
    recursiveTests();
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
  .post(URL +'/print/jobs', {
    'printer_id' : printer_id
  })
  .expectStatus(201)
  .afterJSON(function(json){
    expect(Object.keys(json)[0] === 'job_id');
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
    expect(json.status === 'OK');
    recursiveTests();
  })
  .toss();
}

function uploadJobToPrinter(){
  frisby.create('upload a job to ember')
  .post(URL + '/print/printers/' + printer_id + '/command', {
    'command' : 'print',
    'job_id' : job_id
  })
  .expectStatus(200)
  .afterJSON(function(json){
    expect(json.result === 'upload successful');
    recursiveTests();
  })
  .toss();
}

function getStatusJobReady(){
  frisby.create('Get Status of printer with job file ready')
  .post(URL + '/print/printers/' + printer_id + '/command', {
    'command' : 'getStatus',
    'job_id' : job_id
  })
  .afterJSON(function(json){
    console.log(json.job);
    // expect(Object.keys(json.job)[0] === 'id');
    // expect(Number(json.job.id) === job_id);
    recursiveTests();
  })
  .toss();
}

function startPrint(){
  // Disclaimer: This test is unnecessary and bad form for standard ember use.
  // During normal use should inspect printer and manually start print.
  waits(15000);
  frisby.create('Start ember print')
  .post(URL + '/print/printers/' + printer_id + '/command', {
    'command' : 'start',
    'job_id' : job_id
  })
  .afterJSON(function(json){
    expect(json.command === 'start');
    console.log("starting print:", json);
    recursiveTests();
  })
  .toss();
}

function getStatusPrinting(){
  waits(55000);
  frisby.create('Get Status of printer while printing')
  .post(URL + '/print/printers/' + printer_id + '/command', {
    'command' : 'getStatus',
    'job_id' : job_id
  })
  .afterJSON(function(json){
    expect(Number(json.job.elapsed_time > 0));
    recursiveTests();
  })
  .toss();
}

function pausePrint(){
  waits(5000);
  frisby.create('pause ember print')
  .post(URL + '/print/printers/' + printer_id + '/command', {
    'command' : 'pause',
    'job_id' : job_id
  })
  .afterJSON(function(json){
    expect(json.command === 'pause');
    recursiveTests();
  })
  .toss();
}

function getStatusPaused(){
  waits(5000);
  frisby.create('Get Status of printer while paused')
  .post(URL + '/print/printers/' + printer_id + '/command', {
    'command' : 'getStatus',
    'job_id' : job_id
  })
  .afterJSON(function(json){
    expect(json.state.state === 'Paused');
    recursiveTests();
  })
  .toss();
}

function resumePrint(){
  waits(5000);
  frisby.create('pause ember print')
  .post(URL + '/print/printers/' + printer_id + '/command', {
    'command' : 'resume',
    'job_id' : job_id
  })
  .afterJSON(function(json){
    console.log(json);
    expect(json.command === 'resume');
    recursiveTests();
  })
  .toss();
}

function getStatusResumed(){
  waits(10000);
  frisby.create('Get status of printer after paused print is resumed')
  .post(URL + '/print/printers/' + printer_id + '/command', {
    'command' : 'getStatus',
    'job_id' : job_id
  })
  .afterJSON(function(json){
    expect(json.state.state === 'Printing');
    recursiveTests();
  })
  .toss();
}

function cancelPrint(){
  waits(5000);
  frisby.create('Cancel ember print')
  .post(URL + '/print/printers/' + printer_id + '/command', {
    'command' : 'cancel',
    'job_id' : job_id
  })
  .afterJSON(function(json){
    console.log("Cancelling print:", json);
    recursiveTests();
  })
  .toss();
}
function getStatusCancelled(){
  waits(55000);
  frisby.create('Get status of printer after print is cancelled')
  .post(URL + '/print/printers/' + printer_id + '/command', {
    'command' : 'getStatus',
    'job_id' : job_id
  })
  .afterJSON(function(json){
    expect(json.state.state === 'Ready');
    recursiveTests();
  })
  .toss();
}

function getStatus(){
  waits(55000);
  frisby.create('Get Status')
  .post(URL + '/print/printers/' + printer_id + '/command', {
    'command' : 'getStatus',
    'job_id' : job_id
  })
  .afterJSON(function(json){
    console.log(json);
    recursiveTests();
  })
  .toss();
}
