var frisby = require('frisby')
, fs = require('fs')
, path = require('path')
, FormData = require('form-data')
, form = new FormData()
, URL = 'http://localhost:9998'
, testpath = path.resolve(__dirname + '/files/temp4.gcode')
, printer_id
, file_id
, harness = require('./harness.js')
, job_id;

form.append('file_1', fs.createReadStream(testpath), {
  knownLength: fs.statSync(testpath).size         // we need to set the knownLength so we can call  form.getLengthSync()
});

var tests = [
    getPrinters
  , getStatusInitial
  , uploadFile
  , createJob
  , setFileToJob
  //, uploadJobToPrinter
  , startPrint   //uploadJobToPrinter does same thing as startPrint for RepRap
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


function getPrinters(){
  frisby.create('getprinters')
  .get(URL + '/print/printers?name=serialprinter_COM8')
  .afterJSON(function (json){
    expect(json.printers[0].__connection.type === 'serialprinter');
    console.log('printer_id', json.printers[0].id);
    printer_id = json.printers[0].id
    recursiveTests(json);
  })
  .toss();
}


function getStatusInitial(){
  waits(500);
  frisby.create('Get Initial Status')
  .post(URL + '/print/printers/' + printer_id + '/command', {
    'command' : 'getstatus',
    'job_id' : job_id
  })
  .afterJSON(function(json){
    expect(json.state.state === 'Ready');
    recursiveTests();
  })
  .toss();
}


function uploadFile(){
  //Upload file to print manager
  waits(500);
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
  waits(500);
  frisby.create('create job')
  .post(URL +'/print/jobs', {file_id : file_id, printer_id : printer_id})
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
  waits(500);
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
  console.log("printer_id here",printer_id);
  frisby.create('upload a job to RepRap')
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
  // Disclaimer: This test is unnecessary and bad form for standard ember use.
  // During normal use should inspect printer and manually start print.
  waits(2000);
  frisby.create('Start RepRap print')
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

function cancelPrint(){
  frisby.create('Cancel ember print')
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
  waits(55000);
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
