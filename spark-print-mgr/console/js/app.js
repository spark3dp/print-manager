var PrintManagerConsole = angular.module('PrintManagerConsole', [
    'ngRoute',
    'PrintManagerControllers',
    'PrintManagerServices'
]);

PrintManagerConsole.config(['$httpProvider', function($httpProvider) {
    if (!$httpProvider.defaults.headers.get) {
        $httpProvider.defaults.headers.get = {};
    }
    //disable IE ajax request caching
    $httpProvider.defaults.headers.get['If-Modified-Since'] = 'Mon, 26 Jul 1997 05:00:00 GMT';
    // extra
    $httpProvider.defaults.headers.get['Cache-Control'] = 'no-cache';
    $httpProvider.defaults.headers.get['Pragma'] = 'no-cache';
}]);

PrintManagerConsole.config(['$routeProvider',
    function($routeProvider) {
        $routeProvider
            .when('/printers', {
                templateUrl: 'partials/printerList.html',
                controller: 'PrinterListController'
            })
            .when('/printers/edit', {
                templateUrl: 'partials/printersEdit.html',
                controller: 'PrintersEditController'
            })
            .when('/printers/add', {
                templateUrl: 'partials/printerAdd.html',
                controller: 'PrinterAddController'
            })
            .when('/printers/:printerId', {
                templateUrl: 'partials/printerDetails.html',
                controller: 'PrinterDetailsController'
            })
            .when('/settings', {
                templateUrl: 'partials/settings.html',
                controller: 'ConsoleSettingsController'
            })
            .when('/printers/status/:printerId', {
                templateUrl: 'partials/printJobDetails.html',
                controller: 'PrintJobDetailsController'
            })
            .otherwise({
                redirectTo: '/printers'
            });
    }]);
