const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      default: ''
    },
    priority: {
      type: String,
      enum: ['High', 'Medium', 'Low'],
      default: 'Medium'
    },
    status: {
      type: String,
      enum: ['Todo', 'In Progress', 'Done', 'Review'],
      default: 'Todo'
    },
    dueDate: {
      type: String,
      default: ''
    },
    completedAt: {
      type: Date,
      default: null
    },
    projectId: {
      type: String,
      default: null
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

module.exports = mongoose.model('Task', taskSchema);
