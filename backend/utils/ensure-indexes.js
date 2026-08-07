const Attendance = require('../models/Attendance');

/**
 * Earlier revisions of the attendance schema keyed records on `user`/`date`.
 * Those fields are gone, but the unique index they left behind survives in
 * existing databases — and because every current document has `user: null` and
 * `date: null`, it lets exactly one attendance record exist collection-wide.
 * Every other "mark present" fails with a duplicate key error.
 *
 * syncIndexes() drops indexes that the live schema no longer declares and
 * creates the ones it does, so this self-heals on boot and is a no-op after
 * the first successful run.
 */
async function ensureIndexes() {
  try {
    const dropped = await Attendance.syncIndexes();
    if (Array.isArray(dropped) && dropped.length) {
      console.log(`🧹 Removed stale attendance indexes: ${dropped.join(', ')}`);
    }
  } catch (err) {
    console.error('⚠️  Could not reconcile attendance indexes:', err.message);
  }
}

module.exports = { ensureIndexes };
