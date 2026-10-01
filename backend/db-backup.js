/**
 * Read-only backup: dumps every collection to JSON outside the repo. Writes nothing to the DB.
 * Run from the backend directory: node db-backup.js
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();

const OUT_ROOT = path.join('C:', 'Users', 'Lenovo', 'Documents', 'nexusweave-db-backups');
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
  await connect();
  const db = mongoose.connection.db;

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = path.join(OUT_ROOT, `${db.databaseName}-${stamp}`);
  fs.mkdirSync(outDir, { recursive: true });

  const collections = (await db.listCollections().toArray()).map((c) => c.name).sort();
  let total = 0;

  for (const name of collections) {
    const docs = await db.collection(name).find({}).toArray();
    fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(docs, null, 2), 'utf8');
    total += docs.length;
    console.log(`  ${name.padEnd(24)} ${String(docs.length).padStart(6)} docs`);
  }

  console.log(`\nBacked up ${total} documents across ${collections.length} collections to:`);
  console.log(`  ${outDir}`);

  // The notifications collection has no Mongoose model; show its shape so we know what it is.
  if (collections.includes('notifications')) {
    const sample = await db.collection('notifications').find({}).limit(3).toArray();
    console.log('\nnotifications sample (no model defined for this collection):');
    console.log(JSON.stringify(sample, null, 2));
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
