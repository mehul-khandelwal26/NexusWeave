/**
 * Removes all user-generated test data from the database.
 *
 * Clears documents only — collections and their indexes are left in place, so the
 * unique email index and the attendance compound indexes survive and signup keeps working.
 * Nothing in this database holds configuration (API keys, secrets and client IDs all live
 * in backend/.env), so no application linkage depends on these documents.
 *
 * Requires an explicit flag:  node db-clean.js --confirm
 */
const mongoose = require('mongoose');
require('dotenv').config();

// Children before parents, so a mid-run failure never leaves orphans pointing at nothing.
const ORDER = [
  'notifications',
  'messages',
  'attendances',
  'focussessions',
  'activities',
  'announcements',
  'tasks',
  'projects',
  'users',
  'organizations'
];

const CANDIDATES = [process.env.MONGODB_URI, process.env.MONGODB_URI_FALLBACK].filter(Boolean);

async function connect() {
  let lastErr;
  for (const uri of CANDIDATES) {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
      return;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('No MONGODB_URI configured');
}

async function main() {
  if (!process.argv.includes('--confirm')) {
    console.error('Refusing to run without --confirm');
    process.exit(1);
  }

  await connect();
  const db = mongoose.connection.db;
  const existing = (await db.listCollections().toArray()).map((c) => c.name);

  console.log(`Database: ${db.databaseName}\n`);
  console.log('collection                 before   deleted    after');
  console.log('-'.repeat(56));

  let totalDeleted = 0;
  for (const name of ORDER) {
    if (!existing.includes(name)) {
      console.log(`  ${name.padEnd(22)} (absent)`);
      continue;
    }
    const before = await db.collection(name).countDocuments();
    const { deletedCount } = await db.collection(name).deleteMany({});
    const after = await db.collection(name).countDocuments();
    totalDeleted += deletedCount;
    console.log(`  ${name.padEnd(22)} ${String(before).padStart(6)} ${String(deletedCount).padStart(9)} ${String(after).padStart(8)}`);
  }

  const untouched = existing.filter((n) => !ORDER.includes(n));
  console.log(`\nDeleted ${totalDeleted} documents.`);
  console.log(`Collections not touched: ${untouched.length ? untouched.join(', ') : 'none'}`);

  console.log('\nIndexes still present after cleanup:');
  for (const name of ORDER) {
    if (!existing.includes(name)) continue;
    const idx = await db.collection(name).indexes();
    console.log(`  ${name.padEnd(22)} ${idx.map((i) => i.name + (i.unique ? ' (unique)' : '')).join(', ')}`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
