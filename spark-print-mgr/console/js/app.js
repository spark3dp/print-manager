var PrintManagerConsole = angular.module('PrintManagerConsole', [
    'ngRoute',
    'PrintManagerControllers',
    'PrintManagerServices'
]);

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
            .otherwise({
                redirectTo: '/printers'
            });
    }]);
