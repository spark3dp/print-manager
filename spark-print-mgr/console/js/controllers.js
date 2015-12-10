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
            },
            '152A72A1-45C7-11E5-B970-0800200C9A66' : {
                cssClass: 'printrbotsimple',
                nickname: 'Printrbot Simple'
            },
            '8D586473-C1A9-451B-A129-2425357C6428' : {
                cssClass: 'printrbotplay',
                nickname: 'Printrbot Play'
            },
            '8301C8D0-7A59-4F4B-A918-D5D38888790F' : {
                cssClass: 'printrbotplus',
                nickname: 'Printrbot Plus'
            },
            '4A0F7523-071B-4F1E-A527-9DA49AECB807' : {
                cssClass: 'dfrobot',
                nickname: 'DreamMaker OverLord'
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

        $rootScope.isEmberOrTypeAPrinter = function(printerTypeId) {
           return !!(printerTypeId === '7FAF097F-DB2E-45DC-9395-A30210E789AA' ||
            printerTypeId === 'F2F4B9B6-1D54-4A16-883E-B0385F27380C');
        };

        $rootScope.isEmber = function(printerTypeId) {
            return !!(printerTypeId === '7FAF097F-DB2E-45DC-9395-A30210E789AA');
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
            {id: 'F2F4B9B6-1D54-4A16-883E-B0385F27380C', name: 'Type A Series 1'},
            {id: '4A0F7523-071B-4F1E-A527-9DA49AECB807', name: 'DreamMaker OverLord'}
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
                $scope.isIPEnabledPrinter = $scope.isEmberOrTypeAPrinter(data.type_id);
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

PrintManagerControllers.controller('PrintJobDetailsController', ['$scope', '$routeParams',
    'Printers', 'PrinterTypes', '$timeout',
    function($scope, $routeParams, Printers, PrinterTypes, $timeout) {

        $scope.jobCompletionMessage =
            'A print job has recently finished. Please check to see that the item has been removed before printing again.'
        $scope.percent = 0;
        $scope.printJobComplete = false;

        $scope.printer = Printers.get({printerId: $routeParams.printerId},
            function success(data) {
                $scope.printer.printerType = PrinterTypes.get({printerTypeId: data.type_id});
                $scope.printer.status = Printers.status({printerId: $scope.printer.id},
                    function success(data) {
                        $scope.printer.status = data;
                        $scope.printer.status.state = data.state;
                        $scope.pollJobStatus();
                    },
                    function error(err) {
                        console.warn(err.data);
                        $scope.printer.status = null;
                    }
                );
            },
            function error(err) {
                $scope.goToPage('/printers');
            }
        );

        // Poll the printer status every 5 seconds
        $scope.pollJobStatus = function() {
            if($routeParams.printerId !== 'undefined') {
                Printers.status({printerId: $scope.printer.id},
                    function success(data) {
                        if (data.state === 'printing') {
                            $scope.printer.status.state = 'printing';
                            $scope.printJobComplete = false;
                            $scope.percent = data.job.percentComplete;
                        }

                        //job was finished or cancelled
                        if (($scope.printer.status.state === 'printing' || $scope.printer.status.state === 'paused')
                            && data.state === 'ready') {
                            $scope.percent = 100;
                            $scope.printJobComplete = true;
                            $scope.printer.status.state = 'ready';
                        }

                        //job was paused
                        if (data.state === 'paused') {
                            $scope.printer.status.state = 'paused';
                        }

                        if ($scope.isEmber($scope.printer.type_id)) {
                            if (data.state === 'ready' ||  data.state === 'busy') {
                                $scope.printer.status.state = data.state;
                            }
                        }
                    },
                    function error(err) {
                        $scope.printer.status = null;
                    }
            );
            }
            var t = $timeout(function(){
                $scope.pollJobStatus();
            }, 5000);

            $scope.$on('$destroy', function() {
                if (angular.isDefined(t)) {
                    $timeout.cancel(t);
                    t = undefined;
                }
            });
        };

        $scope.pause = function(printer) {
            Printers.command({printerId: printer.id, command: 'pause'},
                function(data) {
                    $scope.printer.status.state = 'paused';
                },
                function error(err) {
                    console.warn(err.data);
                });
        };

        $scope.resume = function(printer) {
            Printers.command({printerId: printer.id, command: 'resume'},
                function success(data) {
                    $scope.printer.status.state = 'printing';
                },
                function error(err) {
                    console.warn(err.data);
                });
        };

        $scope.cancel = function(printer) {
            Printers.command({printerId: printer.id, command: 'cancel'},
                function success(data) {
                    $scope.printer.status.job.percentComplete = 0;
                    $scope.printer.job = {};
                    $scope.percent = 0;
                    $scope.printJobComplete = false;
                },
                function error(err) {
                    console.warn(err.data);
                });
        };

        $scope.pause_resume_toggle = function(printer) {
            if (printer.status.state === 'printing') {
                $scope.pause(printer);
            } else if (printer.status.state === 'paused') {
                $scope.resume(printer);
            }
        };

        $scope.printer_job_control = function(status) {
            if (status === 'paused') {
                return 'Resume';
            } else {
                return 'Pause';
            }
        };

        $scope.printer_can_cancel = function(printer) {
          if ($scope.isEmber(printer.type_id)) {
              return !!(printer.status.state !== 'ready' && printer.status.state !== 'busy');
          } else {
              return printer.status.state !== 'ready';
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
