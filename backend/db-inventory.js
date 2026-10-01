/**
 * Read-only inventory of the MongoDB database. Writes nothing.
 * Run from the backend directory: node db-inventory.js
 */
const mongoose = require('mongoose');
require('dotenv').config();

const CANDIDATES = [process.env.MONGODB_URI, process.env.MONGODB_URI_FALLBACK].filter(Boolean);

async function connect() {
  let lastErr;
  for (const uri of CANDIDATES) {
    try {
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
      console.log(`Connected via ${uri.startsWith('mongodb+srv') ? 'SRV' : 'fallback'} URI\n`);
      return;
    } catch (err) {
      lastErr = err;
      console.log(`  connection attempt failed: ${err.message}`);
    }
  }
  throw lastErr || new Error('No MONGODB_URI configured');
}

function fmt(d) {
  return d ? new Date(d).toISOString().slice(0, 16).replace('T', ' ') : '—';
}

async function main() {
  await connect();
  const db = mongoose.connection.db;

  console.log(`Database: ${db.databaseName}`);
  console.log('='.repeat(70));

  const collections = (await db.listCollections().toArray()).map((c) => c.name).sort();

  console.log('\nCOLLECTION COUNTS');
  console.log('-'.repeat(70));
  for (const name of collections) {
    const count = await db.collection(name).countDocuments();
    console.log(`  ${name.padEnd(24)} ${String(count).padStart(6)}`);
  }

  console.log('\nUSERS');
  console.log('-'.repeat(70));
  const users = await db
    .collection('users')
    .find({}, { projection: { email: 1, name: 1, role: 1, organizationId: 1, provider: 1, createdAt: 1 } })
    .sort({ createdAt: 1 })
    .toArray();
  if (!users.length) console.log('  (none)');
  for (const u of users) {
    console.log(
      `  ${String(u.email).padEnd(34)} role=${String(u.role).padEnd(9)} org=${String(u.organizationId || '-').padEnd(26)} via=${String(u.provider || '-').padEnd(7)} ${fmt(u.createdAt)}`
    );
  }

  console.log('\nORGANIZATIONS');
  console.log('-'.repeat(70));
  const orgs = await db.collection('organizations').find({}).sort({ createdAt: 1 }).toArray();
  if (!orgs.length) console.log('  (none)');
  for (const o of orgs) {
    console.log(`  ${o._id}  "${o.name}"  [${o.visibility}]  created ${fmt(o.createdAt)}`);
    console.log(`      createdBy: ${o.createdBy}`);
    console.log(`      admins (${(o.admins || []).length}): ${(o.admins || []).join(', ') || '—'}`);
    console.log(`      members (${(o.members || []).length}): ${(o.members || []).join(', ') || '—'}`);
  }

  console.log('\nDATA GROUPED BY ORGANIZATION ID');
  console.log('-'.repeat(70));
  const scoped = ['projects', 'tasks', 'activities', 'announcements', 'focussessions', 'attendances'];
  for (const name of scoped) {
    if (!collections.includes(name)) continue;
    const rows = await db
      .collection(name)
      .aggregate([{ $group: { _id: '$organizationId', n: { $sum: 1 } } }, { $sort: { n: -1 } }])
      .toArray();
    const summary = rows.map((r) => `${r._id === null ? 'personal(null)' : r._id}=${r.n}`).join('  ');
    console.log(`  ${name.padEnd(16)} ${summary || '(empty)'}`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
