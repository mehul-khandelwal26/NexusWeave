const express = require('express');
const Organization = require('../models/Organization');
const User = require('../models/User');
const Task = require('../models/Task');
const Attendance = require('../models/Attendance');
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

// Get Online Users Ratio & Online Member List
router.get('/online', requireAuth, async (req, res) => {
  if (!req.user.orgId) {
    return res.json({
      success: true,
      onlineCount: 1,
      totalCount: 1,
      onlineUsers: [{ email: req.user.email, name: req.user.name || 'Admin', role: req.user.role }],
      totalUsers: [{ email: req.user.email, name: req.user.name || 'Admin', role: req.user.role }]
    });
  }

  try {
    const allUsers = await User.find({ organizationId: req.user.orgId }, 'name email role department');
    const getOnlineUserIds = req.app.get('getOnlineUserIds');
    const activeSocketIds = getOnlineUserIds ? new Set(getOnlineUserIds()) : new Set();

    // The current requester is always online since they are making an active API call
    const currentUserId = req.user.sub ? req.user.sub.toString() : null;

    const onlineUsers = [];
    const totalUsers = [];

    allUsers.forEach((u) => {
      const uId = u._id.toString();
      const isOnline = activeSocketIds.has(uId) || uId === currentUserId;
      const userObj = {
        id: u._id.toString(),
        name: u.name || u.email.split('@')[0],
        email: u.email,
        role: u.role || 'employee',
        department: u.department || 'Engineering',
        isOnline
      };
      totalUsers.push(userObj);
      if (isOnline) {
        onlineUsers.push(userObj);
      }
    });

    res.json({
      success: true,
      onlineCount: onlineUsers.length,
      totalCount: totalUsers.length,
      onlineUsers,
      totalUsers
    });
  } catch (err) {
    console.error('Error fetching online users:', err);
    res.status(500).json({ errors: ['Failed to fetch online users.'] });
  }
});

// Get Today's Present Attendance & Present Member List
router.get('/attendance/today', requireAuth, async (req, res) => {
  if (!req.user.orgId) {
    return res.json({
      success: true,
      presentCount: 0,
      totalEmployees: 1,
      attendanceRate: 0,
      presentUsers: []
    });
  }

  try {
    const todayKey = new Date().toISOString().split('T')[0];
    const totalEmployees = await User.countDocuments({ organizationId: req.user.orgId });

    const attendanceRecords = await Attendance.find({
      organizationId: req.user.orgId,
      dateKey: todayKey,
      status: 'present'
    }).sort({ markedAtTime: 1, createdAt: 1 });

    const userEmails = attendanceRecords.map((r) => r.userEmail);
    const userDocs = await User.find({ email: { $in: userEmails } }, 'name email role department');
    const userMap = new Map(userDocs.map((u) => [u.email, u]));

    const presentUsers = attendanceRecords.map((rec) => {
      const u = userMap.get(rec.userEmail);
      return {
        id: rec._id.toString(),
        name: rec.userName || (u ? u.name : rec.userEmail.split('@')[0]),
        email: rec.userEmail,
        role: u ? u.role : 'employee',
        department: u ? u.department : 'Engineering',
        time: rec.markedAtTime || 'Present'
      };
    });

    const presentCount = presentUsers.length;
    const attendanceRate = totalEmployees > 0 ? Math.round((presentCount / totalEmployees) * 100) : 0;

    res.json({
      success: true,
      presentCount,
      totalEmployees,
      attendanceRate,
      presentUsers
    });
  } catch (err) {
    console.error('Error fetching today attendance:', err);
    res.status(500).json({ errors: ['Failed to fetch today attendance.'] });
  }
});

// Mark Attendance for Today in Database
router.post('/attendance/mark', requireAuth, async (req, res) => {
  if (!req.user.orgId) {
    return res.status(400).json({ errors: ['You are not part of an organization.'] });
  }

  try {
    const todayKey = new Date().toISOString().split('T')[0];
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const record = await Attendance.findOneAndUpdate(
      { userEmail: req.user.email, dateKey: todayKey },
      {
        userId: req.user.sub,
        userEmail: req.user.email,
        userName: req.user.name || req.user.email.split('@')[0],
        organizationId: req.user.orgId,
        dateKey: todayKey,
        markedAtTime: timeStr,
        status: 'present'
      },
      { upsert: true, new: true }
    );

    res.json({ success: true, record });
  } catch (err) {
    console.error('Error marking attendance:', err);
    res.status(500).json({ errors: ['Failed to mark attendance.'] });
  }
});

// Get Organization Leaderboard (Top Performers by Completed Tasks)
router.get('/leaderboard', requireAuth, async (req, res) => {
  if (!req.user.orgId) {
    return res.status(400).json({ errors: ['You are not part of an organization.'] });
  }

  try {
    const pipeline = [
      {
        $match: {
          organizationId: req.user.orgId,
          status: 'Done'
        }
      },
      {
        $addFields: {
          userEmailEffective: {
            $cond: {
              if: {
                $and: [
                  { $ne: ['$assignedUserEmail', null] },
                  { $ne: ['$assignedUserEmail', ''] }
                ]
              },
              then: '$assignedUserEmail',
              else: '$userEmail'
            }
          }
        }
      },
      {
        $group: {
          _id: '$userEmailEffective',
          completedTaskCount: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: 'email',
          as: 'userDetails'
        }
      },
      {
        $unwind: {
          path: '$userDetails',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $sort: {
          completedTaskCount: -1
        }
      },
      {
        $project: {
          _id: 0,
          email: '$_id',
          completedTaskCount: 1,
          name: { $ifNull: ['$userDetails.name', '$_id'] },
          role: { $ifNull: ['$userDetails.role', 'employee'] },
          department: '$userDetails.department'
        }
      }
    ];

    const leaderboard = await Task.aggregate(pipeline);
    res.json({ success: true, leaderboard });
  } catch (err) {
    console.error('Leaderboard error:', err);
    res.status(500).json({ errors: ['Failed to compute organization leaderboard.'] });
  }
});

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
