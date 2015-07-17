var frisby = require('frisby'), 
fs = require('fs'),
path = require('path'),
FormData = require('form-data'),
form = new FormData(),
URL = 'http://localhost:9998',
testpathfail = path.resolve(__dirname + '/files/cube.tar.gz'),
testpath = path.resolve(__dirname + '/files/cube.g3drem'),
harness = require('./harness.js'),
printer_id,
file_id,
job_id;

form.append('file_1', fs.createReadStream(testpath), {
  knownLength: fs.statSync(testpath).size         
  // we need to set the knownLength so we can call  form.getLengthSync()
});

var tests = [
    getPrinter          // find our printer
    , cancelPrint         // cancel print
];

recursiveTests();

function recursiveTests(){
  if(tests.length > 0){
    tests[0]();
    tests.splice(0, 1);//remove first element from array
  }
}

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
  .get(URL + '/print/printers?type_id=3F64F6EC-A1DF-44AB-A22E-58C036F2F474')
  .afterJSON(function (json){
    console.log('printer_id', json.printers[0].id);
    printer_id = json.printers[0].id;
    recursiveTests();
  })
  .toss();
}

function cancelPrint(){
  waits(1000);
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