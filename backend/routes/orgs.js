const express = require('express');
const Organization = require('../models/Organization');
const User = require('../models/User');
const requireAuth = require('../middleware/auth');

const router = express.Router();

// Get list of public organizations
router.get('/public', async (req, res) => {
  try {
    const orgs = await Organization.find();
    const publicList = orgs.map(org => ({
      id: org._id.toString(),
      name: org.name,
      visibility: org.visibility,
      memberCount: org.members.length
    }));
    res.json({ orgs: publicList });
  } catch (err) {
    res.status(500).json({ errors: ['Failed to fetch organizations.'] });
  }
});

// Join Organization
router.post('/join', requireAuth, async (req, res) => {
  const { orgId, orgKey } = req.body;
  const userEmail = req.user.email;

  try {
    const org = await Organization.findById(orgId);
    if (!org) return res.status(404).json({ errors: ['Organization not found.'] });

    if (org.visibility === 'private' && org.orgKey !== orgKey) {
      return res.status(400).json({ errors: ['Invalid organization key.'] });
    }

    if (!org.members.includes(userEmail)) {
      org.members.push(userEmail);
      await org.save();
    }

    const user = await User.findOne({ email: userEmail });
    if (!user) return res.status(404).json({ errors: ['User account not found.'] });

    await User.findOneAndUpdate({ email: userEmail }, { organizationId: org._id.toString(), role: 'employee' });

    res.json({ success: true, orgName: org.name });
  } catch (err) {
    res.status(500).json({ errors: ['Failed to join organization.'] });
  }
});

// Leave Organization
router.post('/leave', requireAuth, async (req, res) => {
  const userEmail = req.user.email;

  try {
    const user = await User.findOne({ email: userEmail });
    if (!user || !user.organizationId) {
      return res.status(400).json({ errors: ['You are not part of an organization.'] });
    }

    const org = await Organization.findById(user.organizationId);
    if (org) {
      org.members = org.members.filter(m => m !== userEmail);
      org.admins = org.admins.filter(a => a !== userEmail);
      await org.save();
    }

    user.organizationId = null;
    user.role = 'personal';
    await user.save();

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ errors: ['Failed to leave organization.'] });
  }
});

module.exports = router;
