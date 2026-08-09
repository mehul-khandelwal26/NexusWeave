const express = require('express');
const User = require('../models/User');
const Organization = require('../models/Organization');
const Task = require('../models/Task');
const Project = require('../models/Project');
const Activity = require('../models/Activity');
const FocusSession = require('../models/FocusSession');
const Attendance = require('../models/Attendance');
const Message = require('../models/Message');
const requireAuth = require('../middleware/auth');
const { signToken } = require('../utils/jwt');
const { verifyGoogleToken } = require('../utils/google-auth');

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6;
const VALID_ROLES = ['personal', 'admin', 'employee'];

// Personal and Organization are separate portals: one email belongs to exactly one of them.
function scopeOf(role) {
  return role === 'personal' ? 'personal' : 'organization';
}

function scopeLabel(scope) {
  return scope === 'personal' ? 'Personal' : 'Organization';
}

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

// Public config the frontend needs to initialize Google Identity Services.
// The OAuth client ID is not a secret — it's meant to be visible in frontend code.
router.get('/google/config', (_req, res) => {
  res.json({ clientId: process.env.GOOGLE_CLIENT_ID || null });
});

router.post(['/signup', '/register'], async (req, res) => {
  const { name, username, email, password, role = 'personal', orgName, orgKey, orgVisibility, orgId, theme } = req.body;
  const userName = name || username;

  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ errors: ['Please enter a valid email address.'] });
  }
  if (!password || String(password).length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ errors: [`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`] });
  }
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ errors: ['Please select a valid account type.'] });
  }

  const normalizedEmail = email.trim().toLowerCase();
  let createdOrgId = null;

  try {
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      const existingScope = scopeLabel(scopeOf(existing.role));
      return res.status(409).json({
        errors: [`This email is already registered as a ${existingScope} account. Personal and Organization accounts cannot share the same credentials — please sign up with a different email.`]
      });
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
      provider: 'email',
      theme: theme || 'dark'
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

    if (role) {
      if (!VALID_ROLES.includes(role)) {
        return res.status(400).json({ errors: ['Please select a valid account type.'] });
      }

      const requestedScope = scopeOf(role);
      const accountScope = scopeOf(user.role);

      if (requestedScope !== accountScope) {
        return res.status(403).json({
          errors: [`This email is registered as a ${scopeLabel(accountScope)} account. Switch to the ${scopeLabel(accountScope)} tab to sign in.`]
        });
      }

      if (requestedScope === 'organization' && role !== user.role) {
        const actual = user.role === 'admin' ? 'Admin' : 'Employee';
        return res.status(403).json({ errors: [`This account is an Organization ${actual}. Select the ${actual} role to sign in.`] });
      }
    }

    const token = signToken(user);
    res.json({ token, user: user.toSafeObject() });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ errors: ['Something went wrong during login.'] });
  }
});

// Google Sign-In / Sign-Up. The frontend uses Google Identity Services to obtain
// an ID token, which is verified here (never trust a client-asserted email).
router.post('/google', async (req, res) => {
  const { credential, role = 'personal', orgName, orgKey, orgVisibility, orgId, theme } = req.body;

  let googlePayload;
  try {
    googlePayload = await verifyGoogleToken(credential);
  } catch (err) {
    return res.status(401).json({ errors: ['Google sign-in failed. Please try again.'] });
  }

  const { googleId, email: normalizedEmail, name, avatar } = googlePayload;
  let createdOrgId = null;

  try {
    let user = await User.findOne({ email: normalizedEmail });

    if (user) {
      // Existing account: log them in, respecting the same personal/organization
      // portal separation enforced for email/password accounts.
      if (role) {
        if (!VALID_ROLES.includes(role)) {
          return res.status(400).json({ errors: ['Please select a valid account type.'] });
        }
        const requestedScope = scopeOf(role);
        const accountScope = scopeOf(user.role);
        if (requestedScope !== accountScope) {
          return res.status(403).json({
            errors: [`This email is registered as a ${scopeLabel(accountScope)} account. Switch to the ${scopeLabel(accountScope)} tab to sign in.`]
          });
        }
      }

      // Link the Google identity to an existing email/password account on first use.
      if (!user.googleId) {
        user.googleId = googleId;
        if (user.provider === 'email' && avatar && !user.avatar) {
          user.avatar = avatar;
        }
        await user.save();
      }

      const token = signToken(user);
      return res.json({ token, user: user.toSafeObject() });
    }

    // No existing account: this is effectively a Google-powered sign-up, so it
    // follows the same role/org validation as the regular /signup route.
    if (!VALID_ROLES.includes(role)) {
      return res.status(400).json({ errors: ['Please select a valid account type.'] });
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

    user = await User.create({
      name,
      email: normalizedEmail,
      role,
      organizationId: assignedOrgId,
      provider: 'google',
      googleId,
      avatar,
      theme: theme || 'dark'
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
    return handleMongooseError(err, res, 'Something went wrong during Google sign-in.');
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

    const { name, bio, skills, department, theme, boardBg, photo } = req.body;
    if (name !== undefined) {
      const trimmed = String(name).trim();
      if (!trimmed) return res.status(400).json({ errors: ['Name cannot be empty.'] });
      user.name = trimmed;
    }
    if (bio !== undefined) user.bio = String(bio);
    if (department !== undefined) user.department = String(department);
    if (theme !== undefined) user.theme = String(theme);
    if (boardBg !== undefined) user.boardBg = String(boardBg);
    if (photo !== undefined) user.avatar = String(photo);
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

router.delete('/me', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user.sub);
    if (!user) return res.status(404).json({ errors: ['User not found.'] });

    const email = user.email;
    const userId = user._id;

    await Promise.all([
      Task.deleteMany({ $or: [{ userEmail: email }, { assignedUserEmail: email }] }),
      Project.deleteMany({ userEmail: email }),
      Activity.deleteMany({ userEmail: email }),
      FocusSession.deleteMany({ userEmail: email }),
      Attendance.deleteMany({ userId: userId }),
      Message.deleteMany({ $or: [{ sender: userId }, { receiver: userId }] })
    ]);

    await User.findByIdAndDelete(userId);

    res.json({ success: true, message: 'Profile deleted successfully.' });
  } catch (err) {
    return handleMongooseError(err, res, 'Failed to delete profile.');
  }
});

module.exports = router;
module.exports.signToken = signToken;
