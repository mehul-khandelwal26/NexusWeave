/**
 * Attendance days are keyed by the server's local calendar date so that every
 * client resolves the same day regardless of its own timezone. Using UTC here
 * would roll the day over mid-morning for users east of Greenwich.
 */
function getDayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getClockTime(date = new Date()) {
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

module.exports = { getDayKey, getClockTime };
