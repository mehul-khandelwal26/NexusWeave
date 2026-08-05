const express = require('express');
const Organization = require('../models/Organization');
const User = require('../models/User');
const requireAuth = require('../middleware/auth');

const router = express.Router();

// Get Users in Organization
router.get('/users', requireAuth, async (req, res) => {
  if (!req.user.orgId) {
    return res.status(400).json({ errors: ['You are not part of an organization.'] });
  }
  try {
    const users = await User.find({ organizationId: req.user.orgId }, 'name email role');
    res.json({ users });
  } catch (err) {
    res.status(500).json({ errors: ['Failed to fetch organization users.'] });
  }
});

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

// Update Org Settings
router.patch('/:id', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin' || req.user.orgId !== req.params.id) {
    return res.status(403).json({ errors: ['Unauthorized.'] });
  }
  const { name, visibility } = req.body;
  try {
    const org = await Organization.findById(req.params.id);
    if (!org) return res.status(404).json({ errors: ['Organization not found.'] });

    if (name) org.name = name;
    if (visibility) org.visibility = visibility;
    await org.save();
    res.json({ success: true, org: { id: org._id.toString(), name: org.name, visibility: org.visibility } });
  } catch (err) {
    res.status(500).json({ errors: ['Failed to update organization.'] });
  }
});

// Regenerate Org Key
router.post('/:id/regen-key', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin' || req.user.orgId !== req.params.id) {
    return res.status(403).json({ errors: ['Unauthorized.'] });
  }
  try {
    const org = await Organization.findById(req.params.id);
    if (!org) return res.status(404).json({ errors: ['Organization not found.'] });

    const newKey = Math.random().toString(36).substr(2, 6) + Date.now().toString(36).substr(-2);
    org.orgKey = newKey;
    await org.save();
    res.json({ success: true, newKey });
  } catch (err) {
    res.status(500).json({ errors: ['Failed to regenerate key.'] });
  }
});

// Promote Member to Admin
router.post('/:id/promote', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin' || req.user.orgId !== req.params.id) {
    return res.status(403).json({ errors: ['Unauthorized.'] });
  }
  const { emailToPromote } = req.body;
  try {
    const user = await User.findOne({ email: emailToPromote, organizationId: req.params.id });
    if (!user) return res.status(404).json({ errors: ['User not found in organization.'] });

    user.role = 'admin';
    await user.save();

    const org = await Organization.findById(req.params.id);
    if (org && !org.admins.includes(emailToPromote)) {
      org.admins.push(emailToPromote);
      await org.save();
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ errors: ['Failed to promote member.'] });
  }
});

// Remove Member
router.delete('/:id/members/:email', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin' || req.user.orgId !== req.params.id) {
    return res.status(403).json({ errors: ['Unauthorized.'] });
  }
  const emailToRemove = req.params.email;
  try {
    const org = await Organization.findById(req.params.id);
    if (!org) return res.status(404).json({ errors: ['Organization not found.'] });

    org.members = org.members.filter(m => m !== emailToRemove);
    org.admins = org.admins.filter(a => a !== emailToRemove);
    await org.save();

    const user = await User.findOne({ email: emailToRemove, organizationId: req.params.id });
    if (user) {
      user.organizationId = null;
      user.role = 'personal';
      await user.save();
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ errors: ['Failed to remove member.'] });
  }
});

module.exports = router;
