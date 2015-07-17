var PrintManagerServices = angular.module('PrintManagerServices', ['ngResource']);

PrintManagerServices.factory('Printers', ['$resource',
    function($resource){
        return $resource('/print/printers/:printerId', null, {
            update: {
                method: 'PUT',
                url: '/print/printers/:printerId/local',
                params: {
                    printerId: '@printerId' // Apparently this line is needed for all methods except GET
                }
            },
            list: {
                method: 'GET',
                params: {
                    printerId: ''
                }
            },
            add: {
                method: 'POST',
                url: '/print/printers/local'
            },
            status: {
                method: 'GET',
                url: '/print/printers/status/:printerId'
            }
        });
    }]);

PrintManagerServices.factory('PrinterTypes', ['$resource',
    function($resource){
        return $resource('/printdb/printertypes/:printerTypeId', {}, {
            list: {
                method: 'GET',
                params: {
                    printerTypeId: ''
                }
            }
        });
    }]);

PrintManagerServices.factory('Settings', ['$resource',
    function($resource){
        return $resource('/config');
    }]);