/* ============================================================
   NexusWeave — Productivity, Presence & Attendance Tracker Engine
   ============================================================ */

(function (root) {
  const api = window.NexusAPI;
  const socket = window.NexusSocket;

  const ATTENDANCE_KEY = 'nw_attendance';
  const PRESENCE_KEY = 'nw_user_presence';
  const LEAVES_KEY = 'nw_user_leaves';

  let idleTimer = null;
  const IDLE_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes inactivity

  function getStoredData(key) {
    return JSON.parse(localStorage.getItem(key) || '{}');
  }

  function saveStoredData(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
  }

  const NexusTracker = {
    /* ── Presence & Idle Tracking ── */
    initPresence() {
      const user = api.getMe();
      if (!user) return;

      this.updatePresence(user.email, 'active');

      // Track active vs hidden tab
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          this.updatePresence(user.email, 'idle');
        } else {
          this.updatePresence(user.email, 'active');
          this.resetIdleTimer(user.email);
        }
      });

      // Track mouse & key activity for idle detection
      const activityEvents = ['mousemove', 'keydown', 'mousedown', 'scroll', 'touchstart'];
      const handleActivity = () => {
        if (document.visibilityState === 'visible') {
          this.updatePresence(user.email, 'active');
          this.resetIdleTimer(user.email);
        }
      };

      activityEvents.forEach(evt => window.addEventListener(evt, handleActivity, { passive: true }));
      this.resetIdleTimer(user.email);

      // Track window unload / logout
      window.addEventListener('beforeunload', () => {
        this.updatePresence(user.email, 'offline');
      });
    },

    resetIdleTimer(email) {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        this.updatePresence(email, 'idle');
      }, IDLE_TIMEOUT_MS);
    },

    updatePresence(email, status) {
      const presenceData = getStoredData(PRESENCE_KEY);
      presenceData[email] = {
        status, // 'active' | 'idle' | 'offline'
        lastSeen: new Date().toISOString(),
        lastSeenStr: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      saveStoredData(PRESENCE_KEY, presenceData);

      if (socket) {
        socket.emit('presence:update', { email, status, lastSeen: presenceData[email].lastSeen });
      }
    },

    getUserPresence(email) {
      const presenceData = getStoredData(PRESENCE_KEY);
      const record = presenceData[email];
      if (!record) return { status: 'offline', lastSeenStr: 'Never' };

      // Consider offline if last seen > 5 mins ago
      const diffMs = Date.now() - new Date(record.lastSeen).getTime();
      if (diffMs > 5 * 60 * 1000 && record.status !== 'offline') {
        return { status: 'offline', lastSeenStr: record.lastSeenStr };
      }
      return record;
    },

    /* ── Attendance & Leave Logic ── */
    markCheckIn(email) {
      const todayKey = new Date().toISOString().split('T')[0];
      const records = getStoredData(ATTENDANCE_KEY);
      if (!records[todayKey]) records[todayKey] = {};

      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      // Late Arrival logic (after 09:15 AM)
      const isLate = now.getHours() > 9 || (now.getHours() === 9 && now.getMinutes() > 15);

      records[todayKey][email] = {
        status: 'in',
        checkInTime: timeStr,
        checkInTimestamp: now.getTime(),
        checkOutTime: null,
        checkOutTimestamp: null,
        isLate,
        hours: 0
      };

      saveStoredData(ATTENDANCE_KEY, records);

      if (socket) {
        const user = api.getMe();
        socket.emit('attendance:marked', {
          orgId: user ? user.organizationId : null,
          userName: user ? user.name : email,
          userEmail: email,
          status: 'in',
          time: timeStr,
          isLate
        });
      }

      return records[todayKey][email];
    },

    markCheckOut(email) {
      const todayKey = new Date().toISOString().split('T')[0];
      const records = getStoredData(ATTENDANCE_KEY);
      if (!records[todayKey] || !records[todayKey][email]) return null;

      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      const checkInTs = records[todayKey][email].checkInTimestamp || now.getTime();
      const hoursWorked = Math.max(0.5, parseFloat(((now.getTime() - checkInTs) / (1000 * 60 * 60)).toFixed(1)));

      records[todayKey][email].status = 'out';
      records[todayKey][email].checkOutTime = timeStr;
      records[todayKey][email].checkOutTimestamp = now.getTime();
      records[todayKey][email].hours = hoursWorked;

      saveStoredData(ATTENDANCE_KEY, records);

      if (socket) {
        const user = api.getMe();
        socket.emit('attendance:marked', {
          orgId: user ? user.organizationId : null,
          userName: user ? user.name : email,
          userEmail: email,
          status: 'out',
          time: timeStr,
          hours: hoursWorked
        });
      }

      return records[todayKey][email];
    },

    applyLeave(email, reason, startDate, endDate) {
      const leaves = getStoredData(LEAVES_KEY);
      if (!leaves[email]) leaves[email] = [];
      const newLeave = {
        id: `leave_${Date.now()}`,
        email,
        reason,
        startDate,
        endDate,
        status: 'Approved',
        appliedAt: new Date().toISOString()
      };
      leaves[email].push(newLeave);
      saveStoredData(LEAVES_KEY, leaves);
      return newLeave;
    },

    getUserLeaves(email) {
      const leaves = getStoredData(LEAVES_KEY);
      return leaves[email] || [];
    },

    /* ── Metrics & Calculations ── */
    calculateWorkingHours(email, period = 'weekly') {
      const records = getStoredData(ATTENDANCE_KEY);
      const now = new Date();
      let totalHours = 0;

      Object.keys(records).forEach(dateStr => {
        const d = new Date(dateStr);
        const record = records[dateStr][email];
        if (!record) return;

        const diffDays = (now - d) / (1000 * 60 * 60 * 24);

        if (period === 'daily' && diffDays < 1) {
          totalHours += record.hours || (record.status === 'in' ? 8 : 0);
        } else if (period === 'weekly' && diffDays <= 7) {
          totalHours += record.hours || (record.status === 'in' ? 8 : 0);
        } else if (period === 'monthly' && diffDays <= 30) {
          totalHours += record.hours || (record.status === 'in' ? 8 : 0);
        }
      });

      return Math.round(totalHours);
    },

    calculateProductivityScore(user) {
      if (!user) return 0;
      const tasks = user.tasks || [];
      if (!tasks.length) return 85; // Default healthy score

      const total = tasks.length;
      const done = tasks.filter(t => t.status === 'Done').length;
      const completionRate = (done / total) * 100;

      // On-time rate
      const onTimeCount = tasks.filter(t => {
        if (t.status !== 'Done' || !t.dueDate) return true;
        return new Date(t.completedAt || t.updatedAt) <= new Date(t.dueDate);
      }).length;
      const onTimeRate = (onTimeCount / total) * 100;

      const score = Math.round((completionRate * 0.5) + (onTimeRate * 0.3) + (20));
      return Math.min(100, Math.max(10, score));
    },

    calculateAvgCompletionTime(user) {
      const tasks = (user.tasks || []).filter(t => t.status === 'Done' && t.createdAt && t.completedAt);
      if (!tasks.length) return '1.5 days';

      let totalDiffMs = 0;
      tasks.forEach(t => {
        totalDiffMs += new Date(t.completedAt) - new Date(t.createdAt);
      });

      const avgHours = totalDiffMs / (tasks.length * 1000 * 60 * 60);
      if (avgHours < 24) return `${Math.round(avgHours)} hours`;
      return `${(avgHours / 24).toFixed(1)} days`;
    }
  };

  root.NexusTracker = NexusTracker;

  // Auto-init presence tracking
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => NexusTracker.initPresence());
  } else {
    NexusTracker.initPresence();
  }
})(window);
