var should = require('should'),
    util = require('util'),
    resources = require('../resource');

describe('Resource', function () {

    function childCount( resource )
    {
        var count = 0;
        for (var childId in resource.__children)
            count = count + 1;
        return count;
    };

    it('should create a valid resource.', function (done) {
        var resource = new resources.Resource();
        resource.getRefCount().should.be.eql(0);

        var count = childCount(resource);
        count.should.be.eql(0);

        done();
    });

    it('should add a child to a resource and increase a ref count on a child to 1.', function (done) {
        var resource = new resources.Resource();
        resource.getRefCount().should.be.eql(0);

        var count = childCount(resource);
        count.should.be.eql(0);

        // Add a couple of resource
        var r1  = new resources.Resource();
        var r2  = new resources.Resource();
        var r3  = new resources.Resource();

        resource.addChild( r1 );
        resource.getRefCount().should.be.eql(0);
        count = childCount(resource);
        count.should.be.eql(1);

        r1.getRefCount().should.be.eql(1);

        resource.addChild( r2 );
        resource.getRefCount().should.be.eql(0);
        count = childCount(resource);
        count.should.be.eql(2);

        r2.getRefCount().should.be.eql(1);

        resource.addChild( r3 );
        resource.getRefCount().should.be.eql(0);
        count = childCount(resource);
        count.should.be.eql(3);

        r3.getRefCount().should.be.eql(1);

        // Try adding the same thing again (it should not do it)
        resource.addChild( r3 );
        resource.getRefCount().should.be.eql(0);
        count = childCount(resource);
        count.should.be.eql(3);

        r3.getRefCount().should.be.eql(1);

        done();
    });

    it('should add a resource to many resources and the ref count should correspond to that.', function (done) {
        var resource = new resources.Resource();
        resource.getRefCount().should.be.eql(0);

        var count = childCount(resource);
        count.should.be.eql(0);

        var r1  = new resources.Resource();
        var r2  = new resources.Resource();
        var r3  = new resources.Resource();

        // Add resource to r1, r2, r3
        r1.addChild(resource);
        r1.getRefCount().should.be.eql(0);
        resource.getRefCount().should.be.eql(1);
        count = childCount(resource);
        count.should.be.eql(0);
        count = childCount(r1);
        count.should.be.eql(1);

        r2.addChild(resource);
        r2.getRefCount().should.be.eql(0);
        resource.getRefCount().should.be.eql(2);
        count = childCount(resource);
        count.should.be.eql(0);
        count = childCount(r2);
        count.should.be.eql(1);

        r3.addChild(resource);
        r3.getRefCount().should.be.eql(0);
        resource.getRefCount().should.be.eql(3);
        count = childCount(resource);
        count.should.be.eql(0);
        count = childCount(r3);
        count.should.be.eql(1);

        done();
    });

    it('should remove a child from a resource and a ref count on a child should to 0.', function (done) {
        var resource = new resources.Resource();
        resource.getRefCount().should.be.eql(0);

        var count = childCount(resource);
        count.should.be.eql(0);

        var r1  = new resources.Resource();
        var r2  = new resources.Resource();
        var r3  = new resources.Resource();

        r1.getRefCount().should.be.eql(0);
        r2.getRefCount().should.be.eql(0);
        r3.getRefCount().should.be.eql(0);

        resource.addChild( r1 );
        resource.addChild( r2 );
        resource.addChild( r3 );

        r1.getRefCount().should.be.eql(1);
        r2.getRefCount().should.be.eql(1);
        r3.getRefCount().should.be.eql(1);

        count = childCount(resource);
        count.should.be.eql(3);

        // Test removeChild.
        resource.removeChild( r1 );
        r1.getRefCount().should.be.eql(0);
        count = childCount(resource);
        count.should.be.eql(2);

        resource.removeChild( r2 );
        r2.getRefCount().should.be.eql(0);
        count = childCount(resource);
        count.should.be.eql(1);

        resource.removeChild( r3 );
        r3.getRefCount().should.be.eql(0);
        count = childCount(resource);
        count.should.be.eql(0);

        // Try removing something that is not there.
        resource.removeChild( r3 );
        r3.getRefCount().should.be.eql(0);
        count = childCount(resource);
        count.should.be.eql(0);

        done();
    });

    it('should remove all children from a resource and the ref counts on children should be 0.', function (done) {
        var resource = new resources.Resource();
        resource.getRefCount().should.be.eql(0);

        var count = childCount(resource);
        count.should.be.eql(0);

        var r1  = new resources.Resource();
        var r2  = new resources.Resource();
        var r3  = new resources.Resource();

        resource.addChild( r1 );
        resource.addChild( r2 );
        resource.addChild( r3 );

        r1.getRefCount().should.be.eql(1);
        r2.getRefCount().should.be.eql(1);
        r3.getRefCount().should.be.eql(1);

        count = childCount(resource);
        count.should.be.eql(3);

        // Remove all the children from resource.
        resource.removeAllChildren();

        count = childCount(resource);
        count.should.be.eql(0);

        r1.getRefCount().should.be.eql(0);
        r2.getRefCount().should.be.eql(0);
        r3.getRefCount().should.be.eql(0);

        done();
    });
});