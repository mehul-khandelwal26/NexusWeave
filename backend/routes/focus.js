const express = require('express');
const FocusSession = require('../models/FocusSession');
const requireAuth = require('../middleware/auth');
const { logActivity } = require('../utils/activity-log');
const { getDayKey } = require('../utils/dates');

const router = express.Router();

// Log a completed focus sprint
router.post('/', requireAuth, async (req, res) => {
  const minutes = parseInt(req.body.minutes, 10);
  if (!minutes || minutes < 1 || minutes > 24 * 60) {
    return res.status(400).json({ errors: ['A focus session must be between 1 and 1440 minutes.'] });
  }

  try {
    const session = await FocusSession.create({
      userEmail: req.user.email,
      organizationId: req.user.orgId || null,
      minutes,
      taskId: req.body.taskId || null,
      completedAt: new Date()
    });

    logActivity(req, `${req.user.name || req.user.email.split('@')[0]} completed a ${minutes}-minute focus sprint.`);
    res.status(201).json({ success: true, session });
  } catch (err) {
    console.error('Error logging focus session:', err);
    res.status(500).json({ errors: ['Failed to log focus session.'] });
  }
});

// Aggregate focus time for the caller
router.get('/summary', requireAuth, async (req, res) => {
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 7, 1), 365);

  try {
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (days - 1));

    const sessions = await FocusSession.find({
      userEmail: req.user.email,
      completedAt: { $gte: since }
    }).sort({ completedAt: 1 });

    const minutesByDay = {};
    let totalMinutes = 0;
    sessions.forEach((s) => {
      const key = getDayKey(new Date(s.completedAt));
      minutesByDay[key] = (minutesByDay[key] || 0) + s.minutes;
      totalMinutes += s.minutes;
    });

    res.json({
      success: true,
      days,
      sessionCount: sessions.length,
      totalMinutes,
      totalHours: Math.round((totalMinutes / 60) * 10) / 10,
      minutesByDay
    });
  } catch (err) {
    console.error('Error summarizing focus sessions:', err);
    res.status(500).json({ errors: ['Failed to summarize focus sessions.'] });
  }
});

module.exports = router;
