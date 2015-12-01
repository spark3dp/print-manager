Adding a Printer to the console.

The console application is a simple web application that displays enabled printers and offers simple control and monitoring.

For your printer to show up in the console there are a number of steps to take.

Most importantly is https://github.com/spark3dp/print-manager/blob/sandbox/spark-print-mgr/console/js/controllers.js

You add your print by adding it to the list.

eg

            '8301C8D0-7A59-4F4B-A918-D5D38888790F' : {
                cssClass: 'printrbotplus',
                nickname: 'Printrbot Plus'
            }


Where the UUID is the printertype and the cssClass is a reference to 

https://github.com/spark3dp/print-manager/blob/sandbox/spark-print-mgr/console/css/console.css

            '.printrbotplus {
                background-image: url("../icons/printrbotplus.png");
            }

You also need to add a png representing your printer as shown above.

Your printer will then show up in the console.

