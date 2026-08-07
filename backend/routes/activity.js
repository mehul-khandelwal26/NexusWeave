const express = require('express');
const Activity = require('../models/Activity');
const requireAuth = require('../middleware/auth');

const router = express.Router();

// Get activity feed. scope=org returns the whole organization (admins only),
// scope=me returns the caller's own trail.
router.get('/', requireAuth, async (req, res) => {
  const scope = req.query.scope === 'org' ? 'org' : 'me';
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);

  try {
    let query;
    if (scope === 'org') {
      if (!req.user.orgId) {
        return res.json({ success: true, activity: [] });
      }
      if (req.user.role !== 'admin') {
        return res.status(403).json({ errors: ['Only admins can view organization activity.'] });
      }
      query = { organizationId: req.user.orgId };
    } else {
      query = { userEmail: req.user.email };
    }

    const entries = await Activity.find(query).sort({ createdAt: -1 }).limit(limit);

    res.json({
      success: true,
      activity: entries.map((e) => ({
        id: e._id.toString(),
        userEmail: e.userEmail,
        text: e.text,
        createdAt: e.createdAt
      }))
    });
  } catch (err) {
    console.error('Error fetching activity:', err);
    res.status(500).json({ errors: ['Failed to fetch activity.'] });
  }
});

module.exports = router;
