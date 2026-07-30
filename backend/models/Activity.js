const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema(
  {
    userEmail: {
      type: String,
      required: true
    },
    organizationId: {
      type: String,
      default: null
    },
    text: {
      type: String,
      required: true
    },
    time: {
      type: String,
      default: 'Just now'
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Activity', activitySchema);
