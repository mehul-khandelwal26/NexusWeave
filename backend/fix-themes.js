const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

async function fixThemes() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/nexusweave');
    const result = await User.updateMany({}, { $set: { theme: 'dark' } });
    console.log(`Updated ${result.modifiedCount} users to dark theme.`);
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

fixThemes();
