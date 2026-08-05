const express = require('express');
const mongoose = require('mongoose');
const Message = require('../models/Message');
const User = require('../models/User');
const requireAuth = require('../middleware/auth');

const router = express.Router();

// Helper to resolve user by ObjectId or email
async function findUserByIdentifier(identifier) {
  if (!identifier) return null;
  if (mongoose.Types.ObjectId.isValid(identifier)) {
    const user = await User.findById(identifier);
    if (user) return user;
  }
  return await User.findOne({ email: identifier.trim().toLowerCase() });
}

// GET /api/messages/unread - Get unread counts for current user
router.get('/unread', requireAuth, async (req, res) => {
  try {
    const currentUserId = req.user.sub;
    const currentUser = await User.findById(currentUserId);
    if (!currentUser) return res.status(404).json({ errors: ['User not found.'] });

    // Aggregate unread messages by sender
    const unreadAggregate = await Message.aggregate([
      {
        $match: {
          receiver: new mongoose.Types.ObjectId(currentUserId),
          isRead: false
        }
      },
      {
        $group: {
          _id: '$sender',
          count: { $sum: 1 }
        }
      }
    ]);

    let total = 0;
    const bySender = {};
    for (const item of unreadAggregate) {
      const senderUser = await User.findById(item._id);
      if (senderUser) {
        bySender[senderUser.email] = item.count;
        bySender[senderUser._id.toString()] = item.count;
      }
      total += item.count;
    }

    res.json({ total, bySender });
  } catch (err) {
    console.error('Error fetching unread counts:', err);
    res.status(500).json({ errors: ['Failed to fetch unread message counts.'] });
  }
});

// GET /api/messages/:userId - Fetch conversation history between current user and target user
router.get('/:userId', requireAuth, async (req, res) => {
  try {
    const currentUserId = req.user.sub;
    const targetUser = await findUserByIdentifier(req.params.userId);

    if (!targetUser) {
      return res.status(404).json({ errors: ['Target user not found.'] });
    }

    const messages = await Message.find({
      $or: [
        { sender: currentUserId, receiver: targetUser._id },
        { sender: targetUser._id, receiver: currentUserId }
      ]
    }).sort({ createdAt: 1 });

    const safeMessages = messages.map(m => m.toSafeObject());

    res.json({
      messages: safeMessages,
      targetUser: targetUser.toSafeObject()
    });
  } catch (err) {
    console.error('Error fetching conversation history:', err);
    res.status(500).json({ errors: ['Failed to load conversation history.'] });
  }
});

// PATCH /api/messages/read/:userId - Mark messages from target user as read
router.patch('/read/:userId', requireAuth, async (req, res) => {
  try {
    const currentUserId = req.user.sub;
    const targetUser = await findUserByIdentifier(req.params.userId);

    if (!targetUser) {
      return res.status(404).json({ errors: ['Target user not found.'] });
    }

    const result = await Message.updateMany(
      {
        sender: targetUser._id,
        receiver: currentUserId,
        isRead: false
      },
      {
        $set: { isRead: true }
      }
    );

    res.json({
      success: true,
      modifiedCount: result.modifiedCount
    });
  } catch (err) {
    console.error('Error marking messages as read:', err);
    res.status(500).json({ errors: ['Failed to mark messages as read.'] });
  }
});

module.exports = router;
