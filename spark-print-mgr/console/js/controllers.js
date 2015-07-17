var PrintManagerControllers = angular.module('PrintManagerControllers', []);

PrintManagerControllers.run(['$rootScope', '$location', '$window', 'Printers',
    function($rootScope, $location, $window, Printers) {
        var typeToDefaultsMapping = {
            '7FAF097F-DB2E-45DC-9395-A30210E789AA' : {
                cssClass: 'ember',
                nickname: 'Ember'
            },
            'F2F4B9B6-1D54-4A16-883E-B0385F27380C' :{
                cssClass: 'type-a',
                nickname: 'Series 1'
            },
            '3F64F6EC-A1DF-44AB-A22E-58C036F2F474' : {
                cssClass: 'dremel',
                nickname: 'Idea Builder'
            },
            '8D39294C-FA7A-40F4-AB79-19F506C64097' : {
                cssClass: 'ultimaker',
                nickname: 'Ultimaker 2'
            },
            'F2F4B9B6-1D54-4A16-883E-B0385F27380D' : {
                cssClass: 'replicator2',
                nickname: 'Makerbot Replicator 2'
            },
            '367012CF-2533-44C7-AD11-9FCD1ED9F2FC' : {
                cssClass: 'replicator2',
                nickname: 'Makerbot Replicator 2x'
            }
        };

        $rootScope.printers = [];

        $rootScope.retrievePrinters = function() {
            Printers.list(function(data) {
                $rootScope.printers = data.printers;
            });
        };

        $rootScope.goToPage = function(pageUrl) {
            $location.url(pageUrl);
        };

        $rootScope.getDefaultsForType = function(printerTypeId) {
            return typeToDefaultsMapping[printerTypeId.toUpperCase()];
        };

        $rootScope.retrievePrinters();
    }]);

PrintManagerControllers.controller('PrinterListController', ['$scope', '$interval', 'Printers',
    function($scope, $interval, Printers) {
        $scope.$watchCollection(
            function() {
                return $scope.printers;
            },
            function(/*newValue, oldValue*/) {
                $scope.getStatuses();
            }
        );

        $scope.getStatuses = function() {
            angular.forEach($scope.printers, function(printer) {
                Printers.status({printerId: printer.id},
                    function success(data) {
                        printer.status = data;
                        printer.status.state = data.state.charAt(0).toUpperCase() + data.state.slice(1);
                    },
                    function error(err) {
                        console.warn(err.data);
                        printer.status = null;
                    }
                );
            });
        };

        // Request status every 10 seconds.
        var statusPoller = $interval($scope.getStatuses, 10000);

        $scope.$on('$destroy', function() {
            if (angular.isDefined(statusPoller)) {
                $interval.cancel(statusPoller);
                statusPoller = undefined;
            }
        });
    }]);

PrintManagerControllers.controller('PrintersEditController', ['$scope', 'Printers',
    function($scope, Printers) {
        $scope.deletePrinter = function(id) {
            Printers.delete({printerId: id},
                function success(data) {
                    $scope.retrievePrinters();
                }, function error(err) {
                    console.error(err);
                });
        };
    }]);

PrintManagerControllers.controller('PrinterAddController', ['$scope', 'Printers',
    function($scope, Printers) {
        $scope.printerTypes = [
            {id: '7FAF097F-DB2E-45DC-9395-A30210E789AA', name: 'Autodesk Ember'},
            {id: 'F2F4B9B6-1D54-4A16-883E-B0385F27380C', name: 'Type A Series 1'}
        ];

        $scope.printer = {};
        $scope.printer.type_id = $scope.printerTypes[0].id;
        $scope.printer.address = '';
        $scope.printer.printer_name = '';
        $scope.requestPending = false;

        // Watch the type_id to provide a default name. Stop watching once the name field has been touched
        var removeTypeIdWatcher = $scope.$watch(
            function() {
                return $scope.printer.type_id;
            },
            function(newValue/*, oldValue*/) {
                $scope.printer.printer_name = $scope.getDefaultsForType(newValue).nickname;
            }
        );

        var removeUntouchedWatcher = $scope.$watch(
            function() {
                return $scope.addPrinterForm.printerName.$untouched;
            },
            function(untouched/*,oldValue*/) {
                if (!untouched) {
                    // remove watchers
                    removeTypeIdWatcher();
                    removeUntouchedWatcher();
                }
            }
        );

        $scope.submit = function(valid) {
            if (valid) {
                $scope.requestPending = true;
                Printers.add($scope.printer,
                    function success(data) {
                        $scope.requestPending = false;
                        if (data.registered) {
                            $scope.retrievePrinters();
                            $scope.goToPage('/printers/edit');
                        }
                    },
                    function error(error) {
                        $scope.requestPending = false;
                        $scope.errorMessage = error.data.error;
                    }
                );
            }
        };
    }]);

PrintManagerControllers.controller('PrinterDetailsController', ['$scope', '$routeParams',
    'Printers', 'PrinterTypes',
    function($scope, $routeParams, Printers, PrinterTypes) {
        $scope.isIPEnabledPrinter = false;
        $scope.printer = Printers.get({printerId: $routeParams.printerId},
            function success(data) {
                $scope.printer.printerType = PrinterTypes.get({printerTypeId: data.type_id});
                $scope.isIPEnabledPrinter = data.type_id === '7FAF097F-DB2E-45DC-9395-A30210E789AA' ||
                    data.type_id === 'F2F4B9B6-1D54-4A16-883E-B0385F27380C';
            }
        );

        $scope.submit = function(valid) {
            if (valid) {
                var printer = {
                    printerId: $scope.printer.id,
                    printer_name: $scope.printer.name
                };

                Printers.update(printer,
                    function success(/*data*/) {
                        $scope.retrievePrinters();
                        $scope.goToPage('/printers/edit');
                    },
                    function error(error) {
                        $scope.errorMessage = error.data;
                    }
                );
            }
        };
    }]);

PrintManagerControllers.controller('ConsoleSettingsController', ['$scope', 'Settings',
    function($scope, Settings) {
        $scope.config = Settings.get();

        $scope.saveConfig = function(valid) {
            if (valid) {
                Settings.save($scope.config,
                    function success(/*data*/) {
                        $scope.goToPage('/printers');
                    },
                    function error(res) {
                        $scope.errorMessage = res.data.error;
                    }
                );
            }
        };
    }]);
