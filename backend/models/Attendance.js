const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    userEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true
    },
    userName: {
      type: String,
      default: 'Employee'
    },
    organizationId: {
      type: String,
      required: true
    },
    dateKey: {
      type: String,
      required: true, // YYYY-MM-DD
      index: true
    },
    markedAtTime: {
      type: String,
      default: ''
    },
    status: {
      type: String,
      enum: ['present', 'absent', 'late', 'leave'],
      default: 'present'
    }
  },
  { timestamps: true }
);

// Composite index to enforce 1 attendance record per user per day
attendanceSchema.index({ userEmail: 1, dateKey: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema);
