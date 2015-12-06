Unit Testing for Print Manager
==============

## How to Run
cd to the spark-print-mgr directory, then type:
```
npm test
```

Or install mocha globally:
```
sudo npm install -g mocha
```

then type:
```
mocha
```

## How to add a test
1. Create the appropriate helper methods in test/helper/TestServer.js if necessary.
  * See the class documentation in helpers/TestServer.js on how to add new helper methods.
  * Here you’ll be using the supertest APIs, which provide APIs for making different REST calls to an express app (ie. PrintManager) with the appropriate headers, query parameters, data, etc.  This is based on the superagent library.
  * **supertest** API documentation found here:  http://visionmedia.github.io/superagent/

2. Create the test cases in the appropriate \*Spec.js file, if not already existent.  There should be one JS file for the particular related group of endpoints you are testing.  Please refer to existing Api\*Spec.js tests for examples.

3. The test cases will use the helper methods found in TestServer.js.  You can use the helper methods together so that you can for example, upload a file, import the mesh, and then generate the visual.  For these test cases you will use the mocha and should libraries.

###Mocha
This describes the suite and the different test cases.  The important methods are:
* `describe`, to signal the start of the suite, and `it` to signal the start of a test case.
* `done` - this signals the end of the test.  Because the REST calls are asynchronous, you should call this somewhere in * the callback you pass into the helper methods of TestServer.
* If you need to do some setup before and/or after each suite (ie. the code within `describe`), you can call `before` and/or `after`
* If you need to do some setup before and/or after each test (ie. the code within `it`), you can call `beforeEach` and/or `afterEach`.  For the existing tests, `afterEach` was used to do some cleanup of files that were created during the test.
* If you want to run only a specific suite or test, you can append `only` - ie. `describe.only(…)`, `it.only(…)`.  This is useful if you’re debugging a specific set of functionality.
* If you want to skip particular suites or tests, you can append `skip`, -ie. `describe.skip(…)`, `it.skip(…)`.  This is useful if you want to omit specific tests.
* More API documentation found here:  http://mochajs.org/

###Should
This is used for asserting correctness.  These will read like plain English.  Basic methods are:
```
<value>.should.equal(<other_value>)
<value>.should.not.equal(<other_value>)
should.not.exist(<value>)
<object>.should.have.property(<property>)
```
More API documentation found here:  http://shouldjs.github.io/
