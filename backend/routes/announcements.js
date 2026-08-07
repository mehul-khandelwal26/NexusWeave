const express = require('express');
const Announcement = require('../models/Announcement');
const requireAuth = require('../middleware/auth');

const router = express.Router();

const ORG_ONLY_ERROR = 'Announcements are only available to organization accounts.';

// Get Announcements (members of the requesting user's organization only)
router.get('/', requireAuth, async (req, res) => {
  if (!req.user.orgId) {
    return res.status(403).json({ errors: [ORG_ONLY_ERROR] });
  }

  try {
    const announcements = await Announcement.find({ organizationId: req.user.orgId }).sort({ createdAt: -1 });
    res.json({ success: true, announcements });
  } catch (err) {
    console.error('Error fetching announcements:', err);
    res.status(500).json({ errors: ['Failed to fetch announcements.'] });
  }
});

// Create Announcement (Organization Admin Only)
router.post('/', requireAuth, async (req, res) => {
  if (!req.user.orgId) {
    return res.status(403).json({ errors: [ORG_ONLY_ERROR] });
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ errors: ['Unauthorized. Only admins can create announcements.'] });
  }

  const { title, content, attachments } = req.body;

  if (!title || !title.trim()) {
    return res.status(400).json({ errors: ['Announcement title is mandatory.'] });
  }

  try {
    const formattedAttachments = Array.isArray(attachments)
      ? attachments.map(att => ({
          name: att.name || 'Attachment',
          url: att.url || '',
          mimeType: att.mimeType || 'application/octet-stream',
          size: att.size || 0
        }))
      : [];

    const announcement = await Announcement.create({
      title: title.trim(),
      content: content ? content.trim() : '',
      attachments: formattedAttachments,
      createdBy: req.user.email,
      authorName: req.user.name || req.user.email.split('@')[0],
      organizationId: req.user.orgId
    });

    res.status(201).json({ success: true, announcement });
  } catch (err) {
    console.error('Error creating announcement:', err);
    res.status(500).json({ errors: ['Failed to create announcement.'] });
  }
});

module.exports = router;
