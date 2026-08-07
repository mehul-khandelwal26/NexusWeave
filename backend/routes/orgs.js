const express = require('express');
const Organization = require('../models/Organization');
const User = require('../models/User');
const Task = require('../models/Task');
const Attendance = require('../models/Attendance');
const requireAuth = require('../middleware/auth');
const { signToken } = require('../utils/jwt');
const { isValidObjectId } = require('../utils/ids');
const { getDayKey, getClockTime } = require('../utils/dates');
const { logActivity } = require('../utils/activity-log');

const router = express.Router();

function actorName(user) {
  return user.name || user.email.split('@')[0];
}

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

const ATTENDANCE_RATE_WINDOW_DAYS = 30;

/**
 * Single source of truth for every attendance figure the UI shows. Returns
 * today's roster for the whole organization plus the caller's own status, so
 * clients never have to derive attendance state from local storage.
 */
async function buildAttendanceSnapshot(user) {
  const todayKey = getDayKey();
  const orgId = user.orgId;

  const members = await User.find({ organizationId: orgId }, 'name email role department').sort({ name: 1 });

  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - (ATTENDANCE_RATE_WINDOW_DAYS - 1));
  const windowStartKey = getDayKey(windowStart);

  const [todayRecords, windowRecords] = await Promise.all([
    Attendance.find({ organizationId: orgId, dateKey: todayKey, status: 'present' }),
    Attendance.find({
      organizationId: orgId,
      dateKey: { $gte: windowStartKey, $lte: todayKey },
      status: 'present'
    })
  ]);

  const todayByEmail = new Map(todayRecords.map((r) => [r.userEmail, r]));

  const windowDaysByEmail = new Map();
  windowRecords.forEach((r) => {
    if (!windowDaysByEmail.has(r.userEmail)) windowDaysByEmail.set(r.userEmail, new Set());
    windowDaysByEmail.get(r.userEmail).add(r.dateKey);
  });

  const roster = members.map((m) => {
    const record = todayByEmail.get(m.email);
    const daysPresent = (windowDaysByEmail.get(m.email) || new Set()).size;
    return {
      id: m._id.toString(),
      name: m.name || m.email.split('@')[0],
      email: m.email,
      role: m.role || 'employee',
      department: m.department || 'Engineering',
      present: Boolean(record),
      time: record ? record.markedAtTime || 'Present' : null,
      monthlyRate: Math.round((daysPresent / ATTENDANCE_RATE_WINDOW_DAYS) * 100),
      daysPresent
    };
  });

  const presentUsers = roster
    .filter((m) => m.present)
    .sort((a, b) => String(a.time).localeCompare(String(b.time)));

  const totalEmployees = roster.length;
  const presentCount = presentUsers.length;
  const self = roster.find((m) => m.email === user.email) || null;

  return {
    success: true,
    dateKey: todayKey,
    totalEmployees,
    presentCount,
    absentCount: Math.max(totalEmployees - presentCount, 0),
    attendanceRate: totalEmployees > 0 ? Math.round((presentCount / totalEmployees) * 100) : 0,
    rateWindowDays: ATTENDANCE_RATE_WINDOW_DAYS,
    presentUsers,
    roster,
    self: {
      email: user.email,
      marked: Boolean(self && self.present),
      time: self ? self.time : null,
      monthlyRate: self ? self.monthlyRate : 0
    }
  };
}

function notifyOrgAttendanceChange(req, payload) {
  const broadcastToOrg = req.app.get('broadcastToOrg');
  if (!broadcastToOrg) return;
  Promise.resolve(broadcastToOrg(req.user.orgId, { type: 'attendance_update', payload })).catch(() => {});
}

function emptyAttendanceSnapshot(user) {
  return {
    success: true,
    dateKey: getDayKey(),
    totalEmployees: 0,
    presentCount: 0,
    absentCount: 0,
    attendanceRate: 0,
    rateWindowDays: ATTENDANCE_RATE_WINDOW_DAYS,
    presentUsers: [],
    roster: [],
    self: { email: user.email, marked: false, time: null, monthlyRate: 0 }
  };
}

// Get Today's Attendance Snapshot (org roster, rate, and caller's own status)
router.get('/attendance/today', requireAuth, async (req, res) => {
  if (!req.user.orgId) {
    return res.json(emptyAttendanceSnapshot(req.user));
  }

  try {
    res.json(await buildAttendanceSnapshot(req.user));
  } catch (err) {
    console.error('Error fetching today attendance:', err);
    res.status(500).json({ errors: ['Failed to fetch today attendance.'] });
  }
});

// Caller's own attendance history (drives working-hours and streak metrics)
router.get('/attendance/history', requireAuth, async (req, res) => {
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 365);

  try {
    const start = new Date();
    start.setDate(start.getDate() - (days - 1));

    const records = await Attendance.find({
      userEmail: req.user.email,
      dateKey: { $gte: getDayKey(start), $lte: getDayKey() },
      status: 'present'
    }).sort({ dateKey: 1 });

    res.json({
      success: true,
      days,
      daysPresent: records.length,
      rate: Math.round((records.length / days) * 100),
      records: records.map((r) => ({
        dateKey: r.dateKey,
        time: r.markedAtTime,
        status: r.status
      }))
    });
  } catch (err) {
    console.error('Error fetching attendance history:', err);
    res.status(500).json({ errors: ['Failed to fetch attendance history.'] });
  }
});

// Mark Attendance for Today in Database
router.post('/attendance/mark', requireAuth, async (req, res) => {
  if (!req.user.orgId) {
    return res.status(400).json({ errors: ['You are not part of an organization.'] });
  }

  try {
    const todayKey = getDayKey();

    // Keep the original check-in time if the user marks again from another device.
    const existing = await Attendance.findOne({ userEmail: req.user.email, dateKey: todayKey });

    await Attendance.findOneAndUpdate(
      { userEmail: req.user.email, dateKey: todayKey },
      {
        userId: req.user.sub,
        userEmail: req.user.email,
        userName: req.user.name || req.user.email.split('@')[0],
        organizationId: req.user.orgId,
        dateKey: todayKey,
        markedAtTime: existing && existing.status === 'present' && existing.markedAtTime
          ? existing.markedAtTime
          : getClockTime(),
        status: 'present'
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const snapshot = await buildAttendanceSnapshot(req.user);
    notifyOrgAttendanceChange(req, { email: req.user.email, dateKey: todayKey, status: 'present' });
    if (!existing) {
      logActivity(req, `${actorName(req.user)} marked attendance for ${todayKey}.`);
    }
    res.json(snapshot);
  } catch (err) {
    console.error('Error marking attendance:', err);
    res.status(500).json({ errors: ['Failed to mark attendance.'] });
  }
});

// Undo Today's Attendance
router.delete('/attendance/mark', requireAuth, async (req, res) => {
  if (!req.user.orgId) {
    return res.status(400).json({ errors: ['You are not part of an organization.'] });
  }

  try {
    const todayKey = getDayKey();
    await Attendance.deleteOne({ userEmail: req.user.email, dateKey: todayKey });

    const snapshot = await buildAttendanceSnapshot(req.user);
    notifyOrgAttendanceChange(req, { email: req.user.email, dateKey: todayKey, status: 'cleared' });
    logActivity(req, `${actorName(req.user)} withdrew attendance for ${todayKey}.`);
    res.json(snapshot);
  } catch (err) {
    console.error('Error clearing attendance:', err);
    res.status(500).json({ errors: ['Failed to clear attendance.'] });
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

    logActivity(req, `${actorName(req.user)} joined the organization.`, { organizationId: org._id.toString() });

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

    const previousOrgId = user.organizationId;
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

    logActivity(req, `${actorName(req.user)} left the organization.`, { organizationId: previousOrgId });

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
    logActivity(req, `${actorName(req.user)} promoted ${emailToPromote} to admin.`);

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

    logActivity(req, `${actorName(req.user)} removed ${emailToRemove} from the organization.`);

    const actor = await User.findById(req.user.sub);
    const token = actor ? signToken(actor) : undefined;
    res.json({ success: true, token, user: actor ? actor.toSafeObject() : undefined });
  } catch (err) {
    res.status(500).json({ errors: ['Failed to remove member.'] });
  }
});

module.exports = router;
module.exports.loadFreshUser = loadFreshUser;
