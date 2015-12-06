var path   = require('path'),
    fs     = require('fs');

/**
 * Synchronously create a directory if it doesn't already exist.
 * Joins together the string arguments to this function to make a path.
 */
function mkdir(p) {
    p = path.join.apply(path, arguments);
    if (!fs.existsSync(p)) {
        fs.mkdirSync(p, 0777);
    }
    return p;
}

var AppSettings = function(config){

    // Set up the Print Manager temporary application directory location.
    var appDataLocation = null;
    if (config.data_files_location) {
        if (fs.existsSync(config.data_files_location) && fs.lstatSync(config.data_files_location).isDirectory()) {
            appDataLocation = config.data_files_location;
        }
    }

    if (!appDataLocation) {
        if (process.platform === "win32") {
            appDataLocation = process.env["APPDATA"];
            // APPDATA may return a path that does not exist. In that case 
            // use the TEMP directory (and create it when it is not there). 
            // 
            if (!fs.existsSync(appDataLocation)) {
                appDataLocation = process.env["TEMP"] || process.env["TMP"] ;
                if (!fs.existsSync(appDataLocation)) {
                    var subDirs = appDataLocation.split(path.sep);
                    var appLocPath = subDirs[0];
                    subDirs = subDirs.splice(1,subDirs.length);
                    for (var index in subDirs) {
                        appLocPath = path.join(appLocPath, subDirs[index]);
                        if (!fs.existsSync(appLocPath)) {
                            fs.mkdirSync(appLocPath, 0777);
                        }
                    }
                }
            }
        }
        else {
            appDataLocation = process.env["HOME"] || process.env["TMPDIR"] || ".";

            if (process.platform === "darwin") { // MACOS

                var testDaemon = process.env["XPC_SERVICE_NAME"];
                if (testDaemon === "com.autodesk.printmanager") {
                    // we are running as a root daemon make the appDataLocation also root
                    appDataLocation = "/";
                }
                // Make sure that Library directory exists.
                var library = mkdir(appDataLocation, "Library");
                // Make sure that Application Support directory exists.
                appDataLocation = mkdir(library, "Application Support");
            }
        }
    }

    // Create all necessary data directories if they do not already exists.
    var AUTODESK_TEMP = appDataLocation;
    if (AUTODESK_TEMP.indexOf( "Autodesk") === -1 )
        AUTODESK_TEMP = mkdir(appDataLocation, "Autodesk");

    this.PRINT_MANAGER_DATA_FOLDER = AUTODESK_TEMP;
    if (this.PRINT_MANAGER_DATA_FOLDER.indexOf( "PrintManager") === -1 )
        this.PRINT_MANAGER_DATA_FOLDER = mkdir(AUTODESK_TEMP, "PrintManager");

    this.PRINT_MANAGER_FILES_FOLDER = mkdir(this.PRINT_MANAGER_DATA_FOLDER, "files");
    this.PRINT_MANAGER_DB_FOLDER = mkdir(this.PRINT_MANAGER_DATA_FOLDER, "db");

    // Set up the location of the application data files.
    if (!config.data_files_location)
        config.data_files_location = appDataLocation;

    // Set up the name and location of the print_manager log file.
    var loggerOptions = config.logger_options;

    if (!loggerOptions['log_file_name'])
        loggerOptions['log_file_name'] = "print_manager.log";
    if (!loggerOptions['log_file_location'])
        loggerOptions['log_file_location'] = this.PRINT_MANAGER_DATA_FOLDER;

    this['APP_DATA_FOLDER']     = this.PRINT_MANAGER_DATA_FOLDER;
    this['APP_FILES_FOLDER']    = this.PRINT_MANAGER_FILES_FOLDER;
    this['APP_DB_FOLDER']       = this.PRINT_MANAGER_DB_FOLDER;

};

AppSettings.prototype.deleteAppDataFiles = function() {
    //we are only deleting /files folder from the appdata folder
    var dataFilePath = this.PRINT_MANAGER_FILES_FOLDER;
    var files = [];
    if( fs.existsSync(dataFilePath) ) {
        files = fs.readdirSync(dataFilePath);
        files.forEach(function(file){
            var curPath = path.join( dataFilePath, file );
            if(!fs.lstatSync(curPath).isDirectory()) {
                fs.unlinkSync(curPath);
            }
        });
    }
};


module.exports = exports = AppSettings;