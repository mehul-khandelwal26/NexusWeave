const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Organization = require('../models/Organization');
const requireAuth = require('../middleware/auth');

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function signToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), email: user.email, name: user.name, role: user.role, orgId: user.organizationId },
    process.env.JWT_SECRET || 'nexusweave_super_secret_jwt_key_2026',
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );
}

router.post(['/signup', '/register'], async (req, res) => {
  const { name, username, email, password, role = 'personal', orgName, orgKey, orgVisibility, orgId } = req.body;
  const userName = name || username;

  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ errors: ['Please enter a valid email address.'] });
  }

  const normalizedEmail = email.trim().toLowerCase();

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
    console.error('Signup error:', err);
    res.status(500).json({ errors: ['Something went wrong during signup.'] });
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
        return res.status(400).json({ errors: ['Account registered under Organization scope. Please switch to Organization tab.'] });
      }
      if ((role === 'admin' || role === 'employee') && user.role === 'personal') {
        return res.status(400).json({ errors: ['Account registered under Personal scope. Please switch to Personal tab.'] });
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
    res.json({ user: user.toSafeObject() });
  } catch (err) {
    res.status(500).json({ errors: ['Failed to retrieve user profile.'] });
  }
});

module.exports = router;
