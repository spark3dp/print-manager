
/**
 * Returns number of days between the two given dates.
 *
 * @param {Date} date1 - A date from which to count days.
 * @param {Date} date2 - A date to which to count days.
 * @returns {Int} - number of days between date1 and date2
 */
function daysBetween( date1, date2 )
{
    // Get 1 day in milliseconds
    var one_day=1000*60*60*24;

    // Convert both dates to milliseconds
    var date1_ms = date1.getTime();
    var date2_ms = date2.getTime();

    // Calculate the difference in milliseconds
    var difference_ms = date2_ms - date1_ms;

    // Convert back to days and return
    return Math.round(difference_ms/one_day);
}


/**
 * Returns a date as a string in the following format: yyyymmddhhmmss
 *
 * @param {Date} date  - A date to format
 * @returns {String} - date formated as yyyymmddhhmmss
 */
function dateToYYYYMMDDhhmmss(date) {
    function pad(num) {
        num = num + '';
        return num.length < 2 ? '0' + num : num;
    }

    return date.getFullYear() +
        pad(date.getMonth() + 1)  +
        pad(date.getDate()) +
        pad(date.getHours()) +
        pad(date.getMinutes()) +
        pad(date.getSeconds());
}


module.exports = {
    daysBetween: daysBetween,
    dateToYYYYMMDDhhmmss: dateToYYYYMMDDhhmmss
};