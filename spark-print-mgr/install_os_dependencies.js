var exec = require("child_process").exec;

var dependencies = null;

if (process.platform === "win32" ) {
    // Windows dependencies
    var winDependencies = require("./package_win.json");
    if (winDependencies) {
        dependencies = winDependencies.dependencies;
    }
}
else {
    // Mac dependencies
    var macDependencies = require("./package_mac.json");
    if (macDependencies) {
        dependencies = macDependencies.dependencies;
    }
}

if (dependencies) {
    for (var package in dependencies) {
        var oscmd   = "npm install " + package;
        exec(oscmd, function(error, stdout, stderr) {
            if (error)  console.log("ERROR:", error);
            if (stdout) console.log( stdout );
            if (stderr) console.log( stderr );
        });
    }
}
