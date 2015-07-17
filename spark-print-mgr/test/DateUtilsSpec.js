var should = require('should'),
    utils  = require('../utils/dateUtils');

describe('DateUtils: daysBetween', function () {

    it('should return zero for the same date', function (done) {

        // Current date and time.
        var date1 = new Date();
        var days  = utils.daysBetween( date1, date1 );
        days.should.equal(0);

        // Current date 2 hours later.
        var date2 = new Date();
        date2.setHours(date2.getHours()+2);

        var days  = utils.daysBetween( date1, date1 );
        days.should.equal(0);

        done();
    });

    it('should return number of days for dates apart by days', function (done) {

        var one_day = 24;  // one day in hours

        // Current date and time.
        var date1 = new Date();

        // Set the date2 to one day and one hour later.
        var date2 = new Date();
        date2.setHours( date2.getHours() + one_day + 1 );
        var days  = utils.daysBetween( date1, date2 );
        days.should.equal(1);

        // Set the date3 to 5 days and one hour later.
        var date3 = new Date();
        date3.setHours(date3.getHours() + 5*one_day + 1);
        days = utils.daysBetween( date1, date3 );
        days.should.equal(5);

        done();
    });

    it('should return negative number of days for dates apart by days', function (done) {
        var one_day = 24;  // one day in hours

        // Current date and time.
        var date1 = new Date();

        // Set the date2 to one day and one hour later.
        var date2 = new Date();
        date2.setHours( date2.getHours() + one_day + 1 );
        var days  = utils.daysBetween( date2, date1 );
        days.should.equal(-1);

        // Set the date3 to 5 days and one hour later.
        var date3 = new Date();
        date3.setHours(date3.getHours() + 5*one_day + 1);
        days = utils.daysBetween( date3, date1 );
        days.should.equal(-5);

        done();
    });

});

describe('DateUtils: dateToYYYYMMDDhhmmss ', function () {

    it('should return properly formated (yyyymmddhhmmss) string for a given date', function (done) {

        // Note: months are counted from zero.

        // Check Dec 31, 1999 23:59:59
        date = new Date( 1999, 11, 31, 23, 59, 59 );
        dateToString = utils.dateToYYYYMMDDhhmmss(date);
        dateToString.should.equal("19991231235959");

        // Check Jan 1, 2000 00:00:00
        date = new Date( 2000, 0, 1, 0, 0, 0 );
        dateToString = utils.dateToYYYYMMDDhhmmss(date);
        dateToString.should.equal("20000101000000");

        // Check Feb 29, 2016 6:53:12
        var date = new Date( 2016, 1, 29, 6, 53, 12 );
        var dateToString = utils.dateToYYYYMMDDhhmmss(date);
        dateToString.should.equal("20160229065312");

        done();
    });
});