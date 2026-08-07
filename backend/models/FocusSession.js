const mongoose = require('mongoose');

const focusSessionSchema = new mongoose.Schema(
  {
    userEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true
    },
    organizationId: {
      type: String,
      default: null
    },
    minutes: {
      type: Number,
      required: true,
      min: 1,
      max: 24 * 60
    },
    taskId: {
      type: String,
      default: null
    },
    completedAt: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('FocusSession', focusSessionSchema);
