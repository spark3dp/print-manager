var should = require('should'),
    trays  = require('../trays'),
    jobs   = require('../jobs');


describe('Jobs', function () {

    function createJobs()
    {
        // Create trays.
        var testTrays = {};

        var tray = new trays.Tray( {} );
        testTrays[tray.getID()] = tray;
        tray = new trays.Tray( {} );
        testTrays[tray.getID()] = tray;
        tray = new trays.Tray( {} );
        testTrays[tray.getID()] = tray;

        var testJobs = {};
        for (var trayId in testTrays)
        {
            var job = new jobs.Job("", trayId, "", "");
            job.addChild( testTrays[trayId]);

            testJobs[job.getID()] = job;
        }

        return { 'trays' : testTrays, 'jobs' : testJobs };
    }

    it('should fail to find nonexistent job.', function (done) {
        // Test finding a job that does not exists.
        var job = jobs.find("OO131");
        should.not.exist(job);

        done();
    });

    it('should find newly created jobs.', function (done) {

        var result = createJobs();

        var testTrays = result['trays'];
        var testJobs  = result['jobs'];

        for (var jobId in testJobs)
        {
            var job = jobs.find( jobId );
            should.exist(job);
            job.getID().should.be.equal( jobId );
            job.getRefCount().should.be.eql(0);

            var createdJob = testJobs[jobId];
            job.should.equal( createdJob );
        }

        done();
    });

    it('should prune all jobs', function (done) {

        var result = createJobs();

        var testTrays = result['trays'];
        var testJobs  = result['jobs'];

        for (var jobId in testJobs)
        {
            var job = jobs.find( jobId );
            should.exist(job);
        }

        for (var trayId in testTrays)
        {
            var tray = trays.find( trayId );
            tray.getRefCount().should.equal(1);
        }

        // Prune all the jobs that are older than 0 days.
        jobs.prune(0);

        for (var jobId in testJobs)
        {
            var job = jobs.find( jobId );
            should.not.exist(job);
        }

        for (var trayId in testTrays)
        {
            var tray = trays.find( trayId );
            tray.getRefCount().should.equal(0);
        }
        done();
    });

    afterEach(function (done) {
        jobs.prune(0);
        trays.prune();
        done();
    });
});
