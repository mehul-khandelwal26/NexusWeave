const mongoose = require('mongoose');
const Organization = require('./models/Organization');
require('dotenv').config();

async function deleteTestOrgs() {
  try {
    console.log('Connecting to MongoDB...');
    const uri = process.env.MONGODB_URI_FALLBACK;
    await mongoose.connect(uri, {});
    console.log('Connected using fallback URI.');

    const orgNames = ['ProbeOrg1786295195446', 'RegOrg1786296511656'];

    const result = await Organization.deleteMany({
      name: { $in: orgNames }
    });

    console.log(`Deleted ${result.deletedCount} organizations.`);
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

deleteTestOrgs();
