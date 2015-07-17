var fs = require("fs")
, split = require("split")                              //imports the split module
, input_file = "Spark Matrix Ammended V9_Mike_mod_for_Roberto_text_in.txt"
, output_file = "Spark Matrix Ammended V9_Mike_mod_for_Roberto_text_out.txt"
, html_values = [];

fs.readFile(input_file, "utf8", function(err,values) {
    if (err) {
        return console.log(err)
    }
    else {
        html_values = values.split("\r\n");
    
        var rgb_values = html_values.map(function(num) {
            return "[" + hexToRgb(num).r + ", " + hexToRgb(num).g + ", " + hexToRgb(num).b + "]";
        });

        console.log("html_values are: \n" + html_values);
        //console.log("rgb_values are: \n" + rgb_values);

        rgb_values_parsed = "[" + rgb_values.r + "," + rgb_values.g + "," + rgb_values.b + "]";

        fs.writeFile(output_file,rgb_values.join("\r\n"), function(err) { 
            if(err) {
                console.log(err);
            }
            else {
                console.log("the file was saved!");
            }
        }); 
    }
});



function componentToHex(c) {
    var hex = c.toString(16);
    return hex.length == 1 ? "0" + hex : hex;
}


function rgbToHex(r, g, b) {
    return "#" + componentToHex(r) + componentToHex(g) + componentToHex(b);
}


function hexToRgb(hex) {
    // Expand shorthand form (e.g. "03F") to full form (e.g. "0033FF")
    var shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    hex = hex.replace(shorthandRegex, function(m, r, g, b) {
        return r + r + g + g + b + b;
    });

    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}