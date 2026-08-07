const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      default: ''
    },
    deadline: {
      type: String,
      default: ''
    },
    timeline: {
      type: String,
      default: 'Execution'
    },
    boardBg: {
      type: String,
      default: 'none'
    },
    userEmail: {
      type: String,
      required: true
    },
    organizationId: {
      type: String,
      default: null
    },
    labels: {
      type: [String],
      default: []
    },
    attachments: {
      type: [String],
      default: []
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Project', projectSchema);
