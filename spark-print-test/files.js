var frisby = require('frisby')
, fs = require('fs')
, path = require('path')
, FormData = require('form-data')
, config = require('./config')
;

require('jasmine-expect');


function upload( data, next )
{
    var testpath = path.resolve(__dirname + '/files/' + data.uploadFile);

    var form = new FormData();
    form.append('file_1', fs.createReadStream(testpath), {
        knownLength: fs.statSync(testpath).size
    });

    var test = frisby.create('upload file');
    test.post( config.URL + '/files/upload', form, {
        json: false,
        headers: {
            'content-type': 'multipart/form-data; boundary=' + form.getBoundary(),
            'content-length': form.getLengthSync()
        }
    })
    .expectStatus( 200 )
    .expectHeaderContains('content-type', 'application/json')
    .expectJSONTypes({
        "files" : Array
    })
    .afterJSON(function(json) {
        expect(json.files[0]).toBeObject();
        expect(json.files[0].file_id).toBeString();
        data.file_id = json.files[0].file_id;
        next( data );
    })
    .toss();
}

function uploadHeart( data, next )
{
    data.uploadFile = "heart.stl";
    upload( data, next );
}

function uploadCylinder( data, next )
{
    data.uploadFile = "Cylinder.stl";
    upload( data, next );
}

function uploadElephant( data, next )
{
    data.uploadFile = "Elephant.stl";
    upload( data, next );
}

function uploadTorus( data, next )
{
    data.uploadFile = "torus.obj";
    upload( data, next );
}

function uploadChimney( data, next )
{
    data.uploadFile = "Chimney.stl";
    upload( data, next );
}

function uploadHudTest( data, next )
{
    data.uploadFile = "HudTest.obj";
    upload( data, next );
}

function uploadBunny( data, next )
{
    data.uploadFile = "CutUpBunny.obj";
    upload( data, next );
}

function uploadCeaser( data, next )
{
    data.uploadFile = "Ceasar.zip";
    upload( data, next );
}

module.exports = exports = {
    'upload' : upload,
    'uploadHeart' : uploadHeart,
    'uploadTorus' : uploadTorus,
    'uploadCylinder' : uploadCylinder,
    'uploadElephant' : uploadElephant,
    'uploadChimney': uploadChimney,
    'uploadHudTest' : uploadHudTest,
    'uploadBunny' : uploadBunny,
    'uploadCeaser' : uploadCeaser
};
