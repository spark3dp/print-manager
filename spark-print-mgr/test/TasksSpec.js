var should = require('should'),
    tasks  = require('../tasks');

describe('Tasks', function () {

    function createTasks()
    {
        var testTasks = [];

        testTasks.push(new tasks.Task());
        testTasks.push(new tasks.Task());
        testTasks.push(new tasks.Task());

        return testTasks;
    }

    it('should fail to find nonexistent task.', function (done) {
        // Test finding a task that does not exists.
        var task = tasks.find("OO131");
        should.not.exist(task);

        done();
    });

    it('should find newly created tasks.', function (done) {

        var testTasks = createTasks();

        testTasks.forEach(function(task) {
            var returnedTask = tasks.find( task.getID() );
            should.exist(returnedTask);

            returnedTask.getRefCount().should.be.eql(0);
            returnedTask.should.equal( task );
        });

        done();
    });

    it('should prune tasks.', function (done) {

        var testTasks = createTasks();

        testTasks.forEach(function(task) {
            var returnedTask = tasks.find( task.getID() );
            should.exist(returnedTask);
        });

        tasks.prune( 0 );

        testTasks.forEach(function(task) {
            var returnedTask = tasks.find( task.getID() );
            should.not.exist(returnedTask);
        });

        done();
    });

    it('should be case sensitive.', function (done) {
        var testTasks = createTasks();

        testTasks.forEach(function(task) {
            var lowerCaseTask = tasks.find( task.getID().toLowerCase() );
            var upperCaseTask = tasks.find( task.getID().toUpperCase() );

            lowerCaseTask.should.not.eql(upperCaseTask);
        });

        done();
    });

    afterEach(function (done) {
        tasks.prune(0);
        done();
    });

});