const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    content: {
      type: String,
      required: true,
      trim: true
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true
    }
  },
  { timestamps: true }
);

// Index for efficient conversation fetching
messageSchema.index({ sender: 1, receiver: 1, createdAt: 1 });

messageSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id.toString(),
    sender_id: this.sender.toString ? this.sender.toString() : this.sender,
    receiver_id: this.receiver.toString ? this.receiver.toString() : this.receiver,
    content: this.content,
    timestamp: this.createdAt || new Date(),
    is_read: Boolean(this.isRead)
  };
};

module.exports = mongoose.model('Message', messageSchema);
