var express = require('express'),
    uuid = require('node-uuid'),
    fs = require('fs'),
    busboy = require('connect-busboy'),
    path = require('path'),
    mime = require('mime'),
    appSettings = require('./config').appSettings,
    resource = require('./resource'),
    _ = require('underscore'),
    util = require('util'),
    logger = require('./logging/PrintManagerLogger');

// Files are stored with a generated path that is not related to the
// user-visible file name, except for the file extension..  If the
// name is not specified, it will be generated.
function File( id, name )
{
    var ext_exceptions = ['.tar.gz'];
    // call the base class
    resource.Resource.call(this);
    // initialize members
    var basename = this.id;
    name = name || basename;

    //handle .tar.gz extension
    var ext;
    for(i in ext_exceptions){
      if(name.indexOf(ext_exceptions[i]) > -1){
        ext = ext_exceptions[i];
        break;
      }
      else{
        ext = path.extname( name );
      }
    }
    this.id = id || this.id;
    this.name = name;
    this.path = path.join( appSettings.APP_FILES_FOLDER, basename + ext);
    // store in our collection
    files[this.id] = this;
}


util.inherits(File, resource.Resource);


var files = {};
var db = path.join(appSettings.APP_DB_FOLDER, 'files.json' );

File.prototype.remove = function() {
    if( fs.existsSync(this.path) )
    {
        fs.unlinkSync(this.path);
    }
    delete files[this.id];
    this.id = 0;
    this.path = null;
};

function save(){
  // fs.writeFileSync(db, JSON.stringify(files, null, 4));
}

//read saved data
function read (){
  // try {
  //   _.each(require(db), function(f){
  //     if(f.id){
  //       files[f.id] = new File(f.path, f.id);
  //     }
  //   });
  // } catch (ex) {
  //   console.log('no files to read');
  // }
}

read();

var router = express.Router();
router.use(busboy());

// This end-point is undocumented!  For debugging only!
router.get('/', function (req, res){
  logger.debug('in files');
  res.send(_.map(files, function (file){
      return { 'file_id' : file.id,
               'name' : file.name,
               'path' : file.path };
  }));
});

router.post('/upload', function (req, res){
	var fstream;
  req.pipe(req.busboy);
  var ret ={ 'files' :[]};
  req.busboy.on('file', function (fieldname, file, filename) {
      var f = new File( null, filename);
      ret.files.push ({ 'name' : f.name, 'file_id' : f.id });
      files[f.id] = f;
      logger.info('Uploaded: ' + f.name + ' ' + f.id);

      fstream = fs.createWriteStream(f.path);
      file.pipe(fstream);
      fstream.on('close', function () {
      });

  });

  req.busboy.on('finish', function(){
    res.send(ret);
  });
});

router.use('/:id', function(req, res, next){
	var id = req.params.id;
	var f = findFile(id);
	if(f){
		req.file = f.path;
		next();
	} else {
        res.status(404);
		res.send("file not found");
	}
});

router.get('/:id',function (req, res){
  var file = req.file;
  logger.debug('in /:id \n' + 'file:' + file);
  var filename = path.basename(file);
  var mimetype = mime.lookup(file);

  res.setHeader('Content-disposition', 'attachment; filename=' + filename);
  res.setHeader('Content-type', mimetype);

  var filestream = fs.createReadStream(file);
  filestream.pipe(res);
});

function findFile (id){
    return _.find(files, function (f){ return f.id === id});
}

function prune()
{
    logger.info('Pruning old files.');

    // Prune any file resource that has zero references.
    for (var fileId in files)
    {
        var file = files[fileId];
        if (file.getRefCount() === 0)
        {
            // Unref the children.
            file.removeAllChildren();
            file.remove();

            logger.info('   - deleted file: ' + fileId );
        }
    }
}

module.exports = exports = {
  "Router" :function (){
  	return router;
  },
  "File": File,
  "find" : findFile,
  'save' : save,
  "read" : read,
  "prune": prune
};
