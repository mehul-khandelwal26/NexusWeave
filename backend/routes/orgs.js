const express = require('express');
const Organization = require('../models/Organization');
const User = require('../models/User');
const requireAuth = require('../middleware/auth');
const { signToken } = require('../utils/jwt');
const { isValidObjectId } = require('../utils/ids');

const router = express.Router();

function toSafeOrg(org, { includeKey = false } = {}) {
  const data = {
    id: org._id.toString(),
    name: org.name,
    visibility: org.visibility,
    memberCount: (org.members || []).length,
    members: org.members || [],
    admins: org.admins || [],
    createdBy: org.createdBy
  };
  if (includeKey) data.orgKey = org.orgKey;
  return data;
}

async function loadFreshUser(emailOrId) {
  if (isValidObjectId(emailOrId) && !String(emailOrId).includes('@')) {
    return User.findById(emailOrId);
  }
  return User.findOne({ email: emailOrId });
}

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

// Get list of public organizations only
router.get('/public', async (req, res) => {
  try {
    const orgs = await Organization.find({ visibility: 'public' });
    const publicList = orgs.map((org) => ({
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

// Get organization by id (members only; orgKey for admins)
router.get('/:id', requireAuth, async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ errors: ['Invalid organization id.'] });
  }
  try {
    const org = await Organization.findById(req.params.id);
    if (!org) return res.status(404).json({ errors: ['Organization not found.'] });

    const isMember =
      req.user.orgId === req.params.id ||
      (org.members || []).includes(req.user.email) ||
      (org.admins || []).includes(req.user.email);

    if (!isMember) {
      return res.status(403).json({ errors: ['You are not a member of this organization.'] });
    }

    const isAdmin = req.user.role === 'admin' && req.user.orgId === req.params.id;
    res.json({ org: toSafeOrg(org, { includeKey: isAdmin }) });
  } catch (err) {
    res.status(500).json({ errors: ['Failed to fetch organization.'] });
  }
});

// Join Organization
router.post('/join', requireAuth, async (req, res) => {
  const { orgId, orgKey } = req.body;
  const userEmail = req.user.email;

  if (!orgId || !isValidObjectId(orgId)) {
    return res.status(400).json({ errors: ['Valid organization id is required.'] });
  }

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

    user.organizationId = org._id.toString();
    user.role = 'employee';
    await user.save();

    const token = signToken(user);
    res.json({
      success: true,
      orgName: org.name,
      token,
      user: user.toSafeObject(),
      org: toSafeOrg(org, { includeKey: false })
    });
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
      const isAdmin = (org.admins || []).includes(userEmail);
      if (isAdmin && (org.admins || []).length <= 1) {
        return res.status(400).json({
          errors: ['You are the last admin. Promote another member before leaving.']
        });
      }
      org.members = org.members.filter((m) => m !== userEmail);
      org.admins = org.admins.filter((a) => a !== userEmail);
      await org.save();
    }

    user.organizationId = null;
    user.role = 'personal';
    await user.save();

    const token = signToken(user);
    res.json({ success: true, token, user: user.toSafeObject() });
  } catch (err) {
    res.status(500).json({ errors: ['Failed to leave organization.'] });
  }
});

// Update Org Settings
router.patch('/:id', requireAuth, async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ errors: ['Invalid organization id.'] });
  }
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
    res.json({ success: true, org: toSafeOrg(org, { includeKey: true }) });
  } catch (err) {
    res.status(500).json({ errors: ['Failed to update organization.'] });
  }
});

// Regenerate Org Key
router.post('/:id/regen-key', requireAuth, async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ errors: ['Invalid organization id.'] });
  }
  if (req.user.role !== 'admin' || req.user.orgId !== req.params.id) {
    return res.status(403).json({ errors: ['Unauthorized.'] });
  }
  try {
    const org = await Organization.findById(req.params.id);
    if (!org) return res.status(404).json({ errors: ['Organization not found.'] });

    const newKey = Math.random().toString(36).substr(2, 6) + Date.now().toString(36).substr(-2);
    org.orgKey = newKey;
    await org.save();
    res.json({ success: true, newKey, org: toSafeOrg(org, { includeKey: true }) });
  } catch (err) {
    res.status(500).json({ errors: ['Failed to regenerate key.'] });
  }
});

// Promote Member to Admin
router.post('/:id/promote', requireAuth, async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ errors: ['Invalid organization id.'] });
  }
  if (req.user.role !== 'admin' || req.user.orgId !== req.params.id) {
    return res.status(403).json({ errors: ['Unauthorized.'] });
  }
  const { emailToPromote } = req.body;
  if (!emailToPromote) {
    return res.status(400).json({ errors: ['emailToPromote is required.'] });
  }
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

    // Re-issue token for the promoter (unchanged claims) — promotee must re-login or refresh /me
    // If promoting self somehow, refresh token; always return success
    const actor = await User.findById(req.user.sub);
    const token = actor ? signToken(actor) : undefined;
    res.json({
      success: true,
      token,
      user: actor ? actor.toSafeObject() : undefined,
      promotedUser: user.toSafeObject()
    });
  } catch (err) {
    res.status(500).json({ errors: ['Failed to promote member.'] });
  }
});

// Remove Member
router.delete('/:id/members/:email', requireAuth, async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ errors: ['Invalid organization id.'] });
  }
  if (req.user.role !== 'admin' || req.user.orgId !== req.params.id) {
    return res.status(403).json({ errors: ['Unauthorized.'] });
  }
  const emailToRemove = decodeURIComponent(req.params.email);
  try {
    const org = await Organization.findById(req.params.id);
    if (!org) return res.status(404).json({ errors: ['Organization not found.'] });

    const isTargetAdmin = (org.admins || []).includes(emailToRemove);
    if (isTargetAdmin && (org.admins || []).length <= 1) {
      return res.status(400).json({ errors: ['Cannot remove the last admin.'] });
    }

    org.members = org.members.filter((m) => m !== emailToRemove);
    org.admins = org.admins.filter((a) => a !== emailToRemove);
    await org.save();

    const user = await User.findOne({ email: emailToRemove, organizationId: req.params.id });
    if (user) {
      user.organizationId = null;
      user.role = 'personal';
      await user.save();
    }

    const actor = await User.findById(req.user.sub);
    const token = actor ? signToken(actor) : undefined;
    res.json({ success: true, token, user: actor ? actor.toSafeObject() : undefined });
  } catch (err) {
    res.status(500).json({ errors: ['Failed to remove member.'] });
  }
});

module.exports = router;
module.exports.loadFreshUser = loadFreshUser;
