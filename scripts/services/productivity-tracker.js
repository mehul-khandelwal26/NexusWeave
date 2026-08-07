/* ============================================================
   NexusWeave — Productivity, Presence & Attendance Tracker Engine
   ============================================================ */

(function (root) {
  const api = window.NexusAPI;
  const socket = window.NexusSocket;

  const PRESENCE_KEY = 'nw_user_presence';
  const LEAVES_KEY = 'nw_user_leaves';

  const HOURS_PER_PRESENT_DAY = 8;

  let idleTimer = null;
  const IDLE_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes inactivity

  // Attendance lives in MongoDB; this is only a read-through cache for the
  // synchronous metric helpers the profile and dashboard pages call.
  let attendanceHistory = null;

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

      if (socket && socket.emitRaw) {
        socket.emitRaw('presence', { email, status, lastSeen: presenceData[email].lastSeen });
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

    /* ── Attendance (server-owned) ── */
    async loadAttendanceHistory(days = 30) {
      if (!api.fetchAttendanceHistory) return null;
      attendanceHistory = await api.fetchAttendanceHistory(days);
      return attendanceHistory;
    },

    getAttendanceHistory() {
      return attendanceHistory;
    },

    async markPresent() {
      if (!api.markDatabaseAttendance) return null;
      const result = await api.markDatabaseAttendance();
      if (result) await this.loadAttendanceHistory();
      return result;
    },

    async clearPresent() {
      if (!api.clearDatabaseAttendance) return null;
      const result = await api.clearDatabaseAttendance();
      if (result) await this.loadAttendanceHistory();
      return result;
    },

    /* ── Leave Logic ── */
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
    /** Reads the cached server history; call loadAttendanceHistory() first. */
    calculateWorkingHours(email, period = 'weekly') {
      if (!attendanceHistory || !Array.isArray(attendanceHistory.records)) return 0;

      const windowDays = period === 'daily' ? 1 : period === 'monthly' ? 30 : 7;
      const cutoff = new Date();
      cutoff.setHours(0, 0, 0, 0);
      cutoff.setDate(cutoff.getDate() - (windowDays - 1));

      const daysPresent = attendanceHistory.records.filter((r) => {
        const day = new Date(`${r.dateKey}T00:00:00`);
        return !isNaN(day.getTime()) && day >= cutoff;
      }).length;

      return daysPresent * HOURS_PER_PRESENT_DAY;
    },

    calculateProductivityScore(user) {
      if (!user) return 0;
      const tasks = user.tasks || [];
      if (!tasks.length) return 0;

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
      if (!tasks.length) return '—';

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
