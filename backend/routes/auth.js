const express = require('express');
const User = require('../models/User');
const Organization = require('../models/Organization');
const requireAuth = require('../middleware/auth');
const { signToken } = require('../utils/jwt');

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6;

function handleMongooseError(err, res, fallback) {
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors || {}).map((e) => e.message);
    return res.status(400).json({ errors: messages.length ? messages : ['Validation failed.'] });
  }
  if (err.code === 11000) {
    return res.status(409).json({ errors: ['A record with that unique field already exists.'] });
  }
  console.error(fallback, err);
  return res.status(500).json({ errors: [fallback] });
}

router.post(['/signup', '/register'], async (req, res) => {
  const { name, username, email, password, role = 'personal', orgName, orgKey, orgVisibility, orgId } = req.body;
  const userName = name || username;

  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ errors: ['Please enter a valid email address.'] });
  }
  if (!password || String(password).length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ errors: [`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`] });
  }

  const normalizedEmail = email.trim().toLowerCase();
  let createdOrgId = null;

  try {
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({ errors: ['An account with that email already exists.'] });
    }

    let assignedOrgId = null;

    if (role === 'admin') {
      if (!orgName || !orgKey) {
        return res.status(400).json({ errors: ['Organization name and key are required.'] });
      }
      const orgExisting = await Organization.findOne({ name: orgName });
      if (orgExisting) {
        return res.status(409).json({ errors: ['Organization name already taken.'] });
      }
      const newOrg = await Organization.create({
        name: orgName,
        orgKey,
        visibility: orgVisibility || 'public',
        createdBy: normalizedEmail,
        admins: [normalizedEmail],
        members: [normalizedEmail]
      });
      assignedOrgId = newOrg._id.toString();
      createdOrgId = assignedOrgId;
    } else if (role === 'employee') {
      if (!orgId) {
        return res.status(400).json({ errors: ['Organization is required.'] });
      }
      const org = await Organization.findById(orgId);
      if (!org) {
        return res.status(404).json({ errors: ['Organization not found.'] });
      }
      if (org.visibility === 'private' && org.orgKey !== orgKey) {
        return res.status(400).json({ errors: ['Invalid organization key.'] });
      }
      if (!org.members.includes(normalizedEmail)) {
        org.members.push(normalizedEmail);
        await org.save();
      }
      assignedOrgId = org._id.toString();
    }

    const user = await User.create({
      name: userName || normalizedEmail.split('@')[0],
      email: normalizedEmail,
      password,
      role,
      organizationId: assignedOrgId,
      provider: 'email'
    });

    const token = signToken(user);
    res.status(201).json({ token, user: user.toSafeObject() });
  } catch (err) {
    if (createdOrgId) {
      try {
        await Organization.findByIdAndDelete(createdOrgId);
      } catch (_) {
        /* rollback best-effort */
      }
    }
    return handleMongooseError(err, res, 'Something went wrong during signup.');
  }
});

router.post('/login', async (req, res) => {
  const { email, password, role } = req.body;
  if (!email || !password) {
    return res.status(400).json({ errors: ['Email and password are required.'] });
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) return res.status(401).json({ errors: ['Account not found.'] });

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(401).json({ errors: ['Incorrect password.'] });

    if (role && user.role && user.role !== role) {
      if (role === 'personal' && user.role !== 'personal') {
        return res.status(403).json({ errors: ['Account registered under Organization scope. Please switch to Organization tab.'] });
      }
      if ((role === 'admin' || role === 'employee') && user.role === 'personal') {
        return res.status(403).json({ errors: ['Account registered under Personal scope. Please switch to Personal tab.'] });
      }
    }

    const token = signToken(user);
    res.json({ token, user: user.toSafeObject() });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ errors: ['Something went wrong during login.'] });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.sub);
    if (!user) return res.status(404).json({ errors: ['User not found.'] });
    // Re-issue token so role/orgId stay in sync after org membership changes
    const token = signToken(user);
    res.json({ token, user: user.toSafeObject() });
  } catch (err) {
    res.status(500).json({ errors: ['Failed to retrieve user profile.'] });
  }
});

router.patch('/me', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.sub);
    if (!user) return res.status(404).json({ errors: ['User not found.'] });

    const { name, bio, skills, department, theme } = req.body;
    if (name !== undefined) {
      const trimmed = String(name).trim();
      if (!trimmed) return res.status(400).json({ errors: ['Name cannot be empty.'] });
      user.name = trimmed;
    }
    if (bio !== undefined) user.bio = String(bio);
    if (department !== undefined) user.department = String(department);
    if (theme !== undefined) user.theme = String(theme);
    if (skills !== undefined) {
      if (Array.isArray(skills)) {
        user.skills = skills.map((s) => String(s).trim()).filter(Boolean);
      } else if (typeof skills === 'string') {
        user.skills = skills.split(',').map((s) => s.trim()).filter(Boolean);
      }
    }

    await user.save();
    const token = signToken(user);
    res.json({ success: true, token, user: user.toSafeObject() });
  } catch (err) {
    return handleMongooseError(err, res, 'Failed to update profile.');
  }
});

module.exports = router;
module.exports.signToken = signToken;
