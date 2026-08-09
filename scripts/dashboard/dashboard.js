/* ============================================================
   NexusWeave — Admin & Employee Separate Dashboards
   ============================================================ */

(function () {
  const api = window.NexusAPI;
  if (!api || typeof api.getMe !== 'function') {
    console.error('NexusAPI not loaded — redirecting to login.');
    window.location.href = 'index.html';
    return;
  }
  const helpers = window.AppHelpers;

  /* ── Auth Check ── */
  let currentUser = api.getMe();
  if (!currentUser) {
    window.location.href = 'index.html';
    return;
  }

  /* ── Shared HTML escape helper (used across all templates) ── */
  const esc = (s) => (helpers && helpers.escapeHTML)
    ? helpers.escapeHTML(s)
    : String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /* ── Local date key helper (avoids UTC timezone drift) ── */
  function toLocalDateKey(date) {
    const d = date instanceof Date ? date : new Date(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /* ── DOM Elements ── */
  const personalView = document.getElementById('personalDashboardView');
  const adminView = document.getElementById('adminDashboardView');
  const employeeView = document.getElementById('employeeDashboardView');
  const roleBadgeHeader = document.getElementById('roleBadgeHeader');
  const dashboardHeading = document.getElementById('dashboardHeading');
  const dashboardEyebrow = document.getElementById('dashboardEyebrow');

  function applyRoleView(user) {
    if (!user) return;
    const roleIsAdmin = user.role === 'admin';
    const roleIsPersonal = user.role === 'personal' || (!roleIsAdmin && user.role !== 'employee');

    if (roleBadgeHeader) {
      roleBadgeHeader.textContent = roleIsPersonal ? '👤 Personal' : roleIsAdmin ? '🛡️ Admin' : '👤 Employee';
      roleBadgeHeader.className = `profile-role-badge role-${roleIsPersonal ? 'personal' : roleIsAdmin ? 'admin' : 'employee'}`;
    }
    if (dashboardEyebrow) dashboardEyebrow.textContent = roleIsPersonal ? 'Personal Focus Hub' : roleIsAdmin ? 'Admin Command Center' : 'Team Workspace';
    if (dashboardHeading) dashboardHeading.textContent = roleIsPersonal ? 'Personal Dashboard' : roleIsAdmin ? 'Executive Dashboard' : 'Employee Dashboard';

    if (roleIsPersonal) {
      personalView?.classList.remove('hidden');
      adminView?.classList.add('hidden');
      employeeView?.classList.add('hidden');
      initPersonalDashboard();
    } else if (roleIsAdmin) {
      personalView?.classList.add('hidden');
      adminView?.classList.remove('hidden');
      employeeView?.classList.add('hidden');
      initAdminDashboard().catch(err => console.warn('Admin dashboard init error:', err));
    } else {
      personalView?.classList.add('hidden');
      adminView?.classList.add('hidden');
      employeeView?.classList.remove('hidden');
      initEmployeeDashboard();
    }
  }

  // Show the correct dashboard immediately (views start hidden in HTML)
  applyRoleView(currentUser);

  async function init() {
    try {
      if (api.refreshMe) {
        const refreshed = await api.refreshMe();
        if (refreshed) {
          // Preserve already-loaded tasks/projects while merging profile fields
          refreshed.tasks = currentUser.tasks || refreshed.tasks || [];
          refreshed.projects = currentUser.projects || refreshed.projects || [];
          currentUser = refreshed;
        }
      }

      if (typeof api.getUserData === 'function') {
        const data = await api.getUserData();
        if (data) {
          currentUser.tasks = Array.isArray(data.tasks) ? data.tasks : [];
          currentUser.projects = Array.isArray(data.projects) ? data.projects : [];
          if (typeof api.saveUserData === 'function') {
            api.saveUserData({
              projects: currentUser.projects,
              tasks: currentUser.tasks
            });
          }
        }
      }

      applyRoleView(currentUser);
    } catch (err) {
      console.warn('Dashboard refresh failed; showing local session data.', err);
      applyRoleView(currentUser);
    }
  }

  init();

  /* ─────────────────────────────────────────────
     ADMIN DASHBOARD IMPLEMENTATION
  ───────────────────────────────────────────── */
  /* (unused: adminChartInstance, rankIcons removed) */

  async function initAdminDashboard() {
    const orgId = currentUser.organizationId;
    const rawOrgUsers = orgId && typeof api.getAllUsersInOrg === 'function' ? await api.getAllUsersInOrg(orgId) : null;
    const orgUsers = Array.isArray(rawOrgUsers) ? rawOrgUsers : [currentUser];
    const orgInfo = orgId ? api.getOrganization(orgId) : null;

    // Title
    const adminWelcomeTitle = document.getElementById('adminWelcomeTitle');
    if (adminWelcomeTitle) {
      adminWelcomeTitle.textContent = `Welcome, ${currentUser.name || 'Admin'}${orgInfo ? ' — ' + orgInfo.name : ''}`;
    }

    const totalEmployees = orgUsers.length;

    // Org tasks come from getUserData (admin JWT sees all org tasks)
    const allOrgTasks = Array.isArray(currentUser.tasks) ? currentUser.tasks.slice() : [];

    const tasksAssigned = allOrgTasks.length;
    const completedTasks = allOrgTasks.filter((t) => t.status === 'Done').length;
    const pendingTasks = allOrgTasks.filter((t) => t.status !== 'Done').length;

    // Fetch Online Users & Today Attendance from Backend Database API
    let onlineRes = null;
    try {
      const results = await Promise.allSettled([
        typeof api.fetchOnlineUsers === 'function' ? api.fetchOnlineUsers() : Promise.resolve(null),
        loadAttendanceSnapshot()
      ]);
      onlineRes = results[0].status === 'fulfilled' ? results[0].value : null;
    } catch (_) { /* gracefully degrade */ }

    const onlineCount = (onlineRes && onlineRes.success) ? onlineRes.onlineCount : 1;
    const totalCount = (onlineRes && onlineRes.success) ? onlineRes.totalCount : Math.max(totalEmployees, 1);

    const adminTotalEl = document.getElementById('adminTotalEmployees');
    const adminAssignedEl = document.getElementById('adminTasksAssigned');
    const adminCompletedEl = document.getElementById('adminCompletedTasks');
    const adminPendingEl = document.getElementById('adminPendingTasks');

    // Requirement 1: Ratio format [Online Count]/[Total Count]
    if (adminTotalEl) adminTotalEl.textContent = `${onlineCount}/${totalCount}`;
    if (adminAssignedEl) adminAssignedEl.textContent = tasksAssigned;
    if (adminCompletedEl) adminCompletedEl.textContent = completedTasks;
    if (adminPendingEl) adminPendingEl.textContent = pendingTasks;

    // Setup Clickable Metric Card Modals
    setupMetricCardModals();

    initSimpleAttendance('admin');
    renderAdminActivityFeed();
  }

  /* ── Attendance (database-backed; no local state) ── */
  let attendanceSnapshot = null;
  let attendanceBound = { admin: false, emp: false };

  async function loadAttendanceSnapshot() {
    if (!api.fetchTodayAttendance) return null;
    attendanceSnapshot = await api.fetchTodayAttendance();
    return attendanceSnapshot;
  }

  function renderAttendance(role) {
    const isAdminRole = role === 'admin';
    const statusEl = document.getElementById(isAdminRole ? 'adminSelfAttendanceStatus' : 'empAttendanceStatus');
    const metaEl = document.getElementById(isAdminRole ? 'adminSelfAttendanceMeta' : 'empAttendanceMeta');
    const btn = document.getElementById(isAdminRole ? 'adminMarkAttendanceBtn' : 'empMarkAttendanceBtn');
    const statEl = document.getElementById('empAttendanceStat');
    if (!btn || !statusEl) return;

    if (!attendanceSnapshot) {
      statusEl.textContent = 'Attendance unavailable';
      if (metaEl) metaEl.textContent = 'Could not reach the server. Check your connection and retry.';
      btn.textContent = 'Retry';
      btn.className = 'ghost-btn';
      btn.disabled = false;
      return;
    }

    const self = attendanceSnapshot.self || {};
    btn.disabled = false;
    if (self.marked) {
      statusEl.textContent = 'Present today';
      if (metaEl) {
        metaEl.textContent = `Marked at ${self.time || '—'} · ${self.monthlyRate || 0}% over the last ${attendanceSnapshot.rateWindowDays} days. Click to undo.`;
      }
      btn.textContent = 'Undo Attendance';
      btn.className = 'ghost-btn';
    } else {
      statusEl.textContent = 'Not marked today';
      if (metaEl) metaEl.textContent = 'Click below to mark yourself present.';
      btn.textContent = 'Mark Present';
      btn.className = 'primary-btn';
    }
    if (statEl && !isAdminRole) statEl.textContent = self.marked ? 'Yes' : 'No';

    if (isAdminRole) {
      const rateEl = document.getElementById('adminAttendanceRate');
      if (rateEl) rateEl.textContent = `${attendanceSnapshot.attendanceRate}%`;
      renderAdminAttendanceList(attendanceSnapshot);
    }
  }

  function initSimpleAttendance(role) {
    const btn = document.getElementById(role === 'admin' ? 'adminMarkAttendanceBtn' : 'empMarkAttendanceBtn');
    if (!btn) return;

    if (!attendanceBound[role]) {
      attendanceBound[role] = true;
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          if (!attendanceSnapshot) {
            await loadAttendanceSnapshot();
          } else if (attendanceSnapshot.self && attendanceSnapshot.self.marked) {
            const res = typeof api.clearDatabaseAttendance === 'function' ? await api.clearDatabaseAttendance() : null;
            if (res && res.success !== false) attendanceSnapshot = res;
          } else {
            const res = typeof api.markDatabaseAttendance === 'function' ? await api.markDatabaseAttendance() : null;
            if (res && res.success !== false) {
              attendanceSnapshot = res;
              if (window.NexusNotify) {
                window.NexusNotify.add({ icon: '✅', text: 'Attendance marked for today.', type: 'success' });
              }
            } else if (window.NexusNotify) {
              window.NexusNotify.add({ icon: '⚠️', text: 'Could not save attendance. Please try again.', type: 'error' });
            }
          }
        } finally {
          btn.disabled = false;
          renderAttendance(role);
        }
      });
    }

    renderAttendance(role);
  }

  /** Pulls a fresh snapshot from the database and repaints whichever widget is on screen. */
  async function refreshAttendance() {
    if (!currentUser.organizationId) return;
    await loadAttendanceSnapshot();
    renderAttendance(currentUser.role === 'admin' ? 'admin' : 'emp');
  }

  /* ── Interactive Metric Card Modals ── */
  let metricModalsBound = false;

  function setupMetricCardModals() {
    if (metricModalsBound) return;
    metricModalsBound = true;

    const onlineCard = document.getElementById('adminTotalEmployeesCard');
    const attendanceCard = document.getElementById('adminAttendanceRateCard');

    const onlineModal = document.getElementById('onlineUsersModal');
    const closeOnlineBtn = document.getElementById('closeOnlineUsersModal');

    const attendanceModal = document.getElementById('todayAttendanceModal');
    const closeAttendanceBtn = document.getElementById('closeTodayAttendanceModal');

    if (onlineCard && onlineModal) {
      onlineCard.addEventListener('click', () => openOnlineUsersModal());
    }
    if (closeOnlineBtn && onlineModal) {
      closeOnlineBtn.addEventListener('click', () => onlineModal.classList.add('hidden'));
    }

    if (attendanceCard && attendanceModal) {
      attendanceCard.addEventListener('click', () => openTodayAttendanceModal());
    }
    if (closeAttendanceBtn && attendanceModal) {
      closeAttendanceBtn.addEventListener('click', () => attendanceModal.classList.add('hidden'));
    }
  }

  async function openOnlineUsersModal() {
    const modal = document.getElementById('onlineUsersModal');
    const listEl = document.getElementById('onlineUsersList');
    if (!modal || !listEl) return;

    modal.classList.remove('hidden');
    listEl.innerHTML = `<div class="empty-inline">Fetching online members from database…</div>`;

    const res = typeof api.fetchOnlineUsers === 'function' ? await api.fetchOnlineUsers() : null;
    const onlineUsers = (res && res.success && Array.isArray(res.onlineUsers)) ? res.onlineUsers : [currentUser];

    if (!onlineUsers.length) {
      listEl.innerHTML = `<div class="empty-inline">No employees are currently online.</div>`;
      return;
    }

    listEl.innerHTML = onlineUsers.map((u) => {
      const name = u.name || (u.email ? u.email.split('@')[0] : 'Employee');
      const initial = name.charAt(0).toUpperCase();
      return `
        <div class="user-modal-item">
          <div class="user-modal-avatar">${esc(initial)}</div>
          <div class="user-modal-info">
            <strong>${esc(name)}</strong>
            <small>${esc(u.email || '')}</small>
          </div>
          <span class="online-status-pill">🟢 Online</span>
        </div>
      `;
    }).join('');
  }

  async function openTodayAttendanceModal() {
    const modal = document.getElementById('todayAttendanceModal');
    const listEl = document.getElementById('todayAttendanceList');
    if (!modal || !listEl) return;

    modal.classList.remove('hidden');
    listEl.innerHTML = `<div class="empty-inline">Fetching today's attendance from database…</div>`;

    const res = typeof api.fetchTodayAttendance === 'function' ? await api.fetchTodayAttendance() : null;
    // Support both { presentUsers: [...] } and { roster: [...] } response shapes
    const presentUsers = (res && res.success && Array.isArray(res.presentUsers)) ? res.presentUsers
      : (res && Array.isArray(res.roster)) ? res.roster.filter(u => u.present) : [];

    if (!presentUsers.length) {
      listEl.innerHTML = `<div class="empty-inline">No employees have marked attendance today.</div>`;
      return;
    }

    listEl.innerHTML = presentUsers.map((u) => {
      const name = u.name || (u.email ? u.email.split('@')[0] : 'Employee');
      const initial = name.charAt(0).toUpperCase();
      return `
        <div class="user-modal-item">
          <div class="user-modal-avatar">${esc(initial)}</div>
          <div class="user-modal-info">
            <strong>${esc(name)}</strong>
            <small>${esc(u.email || '')}</small>
          </div>
          <span class="attendance-time-pill">📅 ${esc(u.time || 'Present')}</span>
        </div>
      `;
    }).join('');
  }

  function renderAdminAttendanceList(snapshot) {
    const container = document.getElementById('adminAttendanceList');
    if (!container) return;

    if (!snapshot) {
      container.innerHTML = `<div class="empty-inline">Attendance is unavailable right now.</div>`;
      return;
    }

    const roster = Array.isArray(snapshot.roster) ? snapshot.roster : [];
    if (!roster.length) {
      container.innerHTML = `<div class="empty-inline">No team members found.</div>`;
      return;
    }

    // esc() is now available at module scope

    const ordered = roster.slice().sort((a, b) => Number(b.present) - Number(a.present));

    container.innerHTML = ordered.map((u) => `
      <div class="attendance-admin-item">
        <div style="display:flex;align-items:center;gap:0.6rem;">
          <span style="font-size:0.9rem;">${u.present ? '🟢' : '⚪'}</span>
          <div>
            <strong>${esc(u.name || u.email)}</strong>
            <small style="display:block;color:var(--ink-soft);font-size:0.75rem;">${esc(u.email)} · ${u.monthlyRate}% last ${snapshot.rateWindowDays}d</small>
          </div>
        </div>
        <span class="attendance-time-tag">${u.present ? esc(u.time || 'Present') : 'Absent'}</span>
      </div>
    `).join('');
  }

  async function renderAdminActivityFeed() {
    const container = document.getElementById('adminActivityFeed');
    if (!container) return;

    let rawActivity = null;
    try {
      rawActivity = typeof api.fetchActivity === 'function' ? await api.fetchActivity({ scope: 'org', limit: 12 }) : null;
    } catch (_) { /* network error */ }
    // Normalize: could be an array or { activities: [...] }
    let activity = Array.isArray(rawActivity) ? rawActivity : (rawActivity && Array.isArray(rawActivity.activities)) ? rawActivity.activities : null;

    if (!activity) {
      activity = Array.isArray(currentUser.activity) ? currentUser.activity : null;
    }

    if (!activity) {
      container.innerHTML = `<div class="empty-inline">Could not load activity from the server.</div>`;
      return;
    }
    if (!activity.length) {
      container.innerHTML = `<div class="empty-inline">No recent activity logged.</div>`;
      return;
    }

    container.innerHTML = activity.slice(0, 6).map((act) => `
      <div class="activity-item">
        <span>${esc(act.text)}</span>
        <small style="display:block;color:var(--ink-soft);font-size:0.72rem;">${esc(act.userEmail || '')} · ${esc(new Date(act.createdAt).toLocaleString())}</small>
      </div>
    `).join('');
  }

  /* ─────────────────────────────────────────────
     EMPLOYEE DASHBOARD IMPLEMENTATION
  ───────────────────────────────────────────── */
  let empDoughnutInstance = null;
  let empBarInstance = null;
  let empNotifsBound = false;

  function initEmployeeDashboard() {
    const welcomeTitle = document.getElementById('employeeWelcomeTitle');
    const orgSub = document.getElementById('employeeOrgNameText');
    const empProfileAvatar = document.getElementById('empProfileAvatar');
    const empProfileName = document.getElementById('empProfileName');
    const empProfileEmail = document.getElementById('empProfileEmail');

    const orgInfo = currentUser.organizationId ? api.getOrganization(currentUser.organizationId) : null;

    if (welcomeTitle) welcomeTitle.textContent = `Welcome back, ${currentUser.name || 'Employee'}`;
    if (orgSub) orgSub.textContent = orgInfo ? orgInfo.name : 'Workspace';

    if (empProfileAvatar) empProfileAvatar.textContent = (currentUser.name || currentUser.email || 'E').charAt(0).toUpperCase();
    if (empProfileName) empProfileName.textContent = currentUser.name || 'Employee';
    if (empProfileEmail) empProfileEmail.textContent = currentUser.email;

    const tasksForDash = Array.isArray(currentUser.tasks) ? currentUser.tasks : [];

    const assignedCount = tasksForDash.length;
    const completedCount = tasksForDash.filter(t => t.status === 'Done').length;

    const now = new Date();
    const upcomingDeadlines = tasksForDash.filter(t => {
      if (t.status === 'Done' || !t.dueDate) return false;
      const due = new Date(t.dueDate);
      if (isNaN(due.getTime())) return false;
      const diffDays = (due - now) / (1000 * 60 * 60 * 24);
      return diffDays >= 0 && diffDays <= 3;
    }).length;

    const empAssignedEl = document.getElementById('empAssignedTasks');
    const empCompletedEl = document.getElementById('empCompletedTasks');
    const empDeadlinesEl = document.getElementById('empUpcomingDeadlines');
    if (empAssignedEl) empAssignedEl.textContent = assignedCount;
    if (empCompletedEl) empCompletedEl.textContent = completedCount;
    if (empDeadlinesEl) empDeadlinesEl.textContent = upcomingDeadlines;

    loadAttendanceSnapshot()
      .then(() => initSimpleAttendance('emp'))
      .catch((err) => console.warn('Attendance widget error:', err));
    try { renderEmployeeCharts(tasksForDash); } catch (err) { console.warn('Employee charts error:', err); }
    try { renderEmployeeDeadlines(tasksForDash); } catch (err) { console.warn('Employee deadlines error:', err); }
    try { renderEmployeeNotifications(tasksForDash); } catch (err) { console.warn('Employee notifications error:', err); }
  }

  function renderEmployeeCharts(tasks) {
    if (typeof Chart === 'undefined') {
      console.warn('Chart.js not loaded');
      return;
    }

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#94a3b8' : '#64748b';

    const doughnutCtx = document.getElementById('empTaskDoughnutChart');
    if (doughnutCtx) {
      if (empDoughnutInstance) empDoughnutInstance.destroy();

      const done = tasks.filter(t => t.status === 'Done').length;
      const inProgress = tasks.filter(t => t.status === 'In Progress').length;
      const todo = tasks.filter(t => t.status !== 'Done' && t.status !== 'In Progress').length;
      const hasData = done + inProgress + todo > 0;

      empDoughnutInstance = new Chart(doughnutCtx, {
        type: 'doughnut',
        data: {
          labels: hasData ? ['Completed', 'In Progress', 'To Do'] : ['No tasks yet'],
          datasets: [{
            data: hasData ? [done, inProgress, todo] : [1],
            backgroundColor: hasData ? ['#22c55e', '#3b82f6', '#94a3b8'] : [isDark ? '#334155' : '#e2e8f0'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { color: textColor, font: { family: 'Inter', size: 11 } } }
          },
          cutout: '70%'
        }
      });
    }

    const barCtx = document.getElementById('empWeeklyBarChart');
    if (barCtx) {
      if (empBarInstance) empBarInstance.destroy();

      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const counts = [0, 0, 0, 0, 0, 0, 0];
      const weekAgo = Date.now() - 7 * 86400000;

      tasks.filter(t => t.status === 'Done').forEach(t => {
        const d = t.completedAt ? new Date(t.completedAt) : (t.updatedAt ? new Date(t.updatedAt) : null);
        if (!d || isNaN(d.getTime()) || d.getTime() < weekAgo) return;
        const idx = (d.getDay() + 6) % 7;
        counts[idx] += 1;
      });

      empBarInstance = new Chart(barCtx, {
        type: 'bar',
        data: {
          labels: days,
          datasets: [{
            label: 'Tasks Done',
            data: counts,
            backgroundColor: isDark ? '#a78bfa' : '#5b21b6',
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { display: false }, ticks: { color: textColor, font: { size: 11 } } },
            y: {
              beginAtZero: true,
              suggestedMax: Math.max(3, ...counts),
              grid: { color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' },
              ticks: { color: textColor, precision: 0 }
            }
          }
        }
      });
    }
  }

  function renderEmployeeDeadlines(tasks) {
    const container = document.getElementById('empDeadlinesList');
    if (!container) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const withDue = tasks.filter(t => t.status !== 'Done' && t.dueDate && !isNaN(new Date(t.dueDate).getTime()));
    const highPriority = tasks.filter(t =>
      t.status !== 'Done' &&
      String(t.priority || '').toLowerCase() === 'high' &&
      !withDue.includes(t)
    );

    const pending = [
      ...withDue.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate)),
      ...highPriority
    ];

    if (!pending.length) {
      container.innerHTML = `<div class="empty-inline">No upcoming deadlines or high-priority tasks. You are all caught up! 🎉</div>`;
      return;
    }

    container.innerHTML = pending.slice(0, 8).map(task => {
      let urgencyClass = 'urgency-upcoming';
      let urgencyText = task.priority ? `${task.priority} priority` : 'Priority';

      if (task.dueDate) {
        const due = new Date(task.dueDate);
        due.setHours(0, 0, 0, 0);
        const diffDays = Math.round((due - today) / (1000 * 60 * 60 * 24));
        if (diffDays < 0) {
          urgencyClass = 'urgency-overdue';
          urgencyText = `Overdue by ${Math.abs(diffDays)}d`;
        } else if (diffDays === 0) {
          urgencyClass = 'urgency-today';
          urgencyText = 'Due Today';
        } else {
          urgencyText = `Due in ${diffDays}d · ${task.priority || 'Medium'}`;
        }
      }

      const projectName = task.projectName
        || (currentUser.projects || []).find(p => String(p.id || p._id) === String(task.projectId))?.name
        || 'General Workspace';

      return `
        <div class="deadline-item">
          <div class="deadline-info">
            <strong>${esc(task.title || 'Untitled Task')}</strong>
            <small>${esc(projectName)}</small>
          </div>
          <span class="urgency-badge ${urgencyClass}">${urgencyText}</span>
        </div>
      `;
    }).join('');
  }

  function buildEmployeeNotifications(tasks) {
    const items = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const stored = (() => {
      try {
        return JSON.parse(localStorage.getItem(`nw_notifs_${currentUser.email}`) || '[]');
      } catch (_) {
        return [];
      }
    })();

    stored.slice(0, 8).forEach((n) => {
      items.push({
        icon: n.icon || '🔔',
        text: n.text,
        time: n.timeStr || 'Recent'
      });
    });

    tasks.forEach((t) => {
      if (t.status === 'Done') return;
      if (t.dueDate) {
        const due = new Date(t.dueDate);
        if (!isNaN(due.getTime())) {
          due.setHours(0, 0, 0, 0);
          const diffDays = Math.round((due - today) / 86400000);
          if (diffDays < 0) {
            items.push({ icon: '⚠️', text: `"${esc(t.title)}" is overdue by ${Math.abs(diffDays)} day(s).`, time: 'Deadline' });
          } else if (diffDays >= 0 && diffDays <= 2) {
            items.push({ icon: '⏰', text: `"${esc(t.title)}" is due ${diffDays === 0 ? 'today' : 'in ' + diffDays + ' day(s)'}.`, time: 'Upcoming' });
          }
        }
      }
      if (String(t.priority || '').toLowerCase() === 'high') {
        items.push({ icon: '🔥', text: `High priority task: "${esc(t.title)}" needs attention.`, time: 'Priority' });
      }
    });

    if (!items.length) {
      items.push(
        { icon: '📢', text: 'Welcome to your employee workspace portal.', time: 'Just now' },
        { icon: '📌', text: 'Check your upcoming deadlines & task board.', time: 'Today' },
        { icon: '🛡️', text: 'Organization policies and team sync are up to date.', time: 'Yesterday' }
      );
    }

    // Dedupe by text
    const seen = new Set();
    return items.filter((n) => {
      if (seen.has(n.text)) return false;
      seen.add(n.text);
      return true;
    }).slice(0, 10);
  }

  function renderEmployeeNotifications(tasks = []) {
    const container = document.getElementById('empNotificationsList');
    const clearBtn = document.getElementById('clearNotifsBtn');
    if (!container) return;

    const notifs = buildEmployeeNotifications(tasks);

    function renderNotifsList(list) {
      if (!list.length) {
        container.innerHTML = `<div class="empty-inline">No notifications.</div>`;
        return;
      }
      container.innerHTML = list.map(n => `
        <div class="notification-item">
          <span class="notification-icon">${n.icon}</span>
          <div class="notification-text">
            <span>${n.text}</span>
            <small class="notification-time">${n.time}</small>
          </div>
        </div>
      `).join('');
    }

    if (clearBtn && !empNotifsBound) {
      empNotifsBound = true;
      clearBtn.addEventListener('click', () => {
        try {
          localStorage.setItem(`nw_notifs_${currentUser.email}`, '[]');
        } catch (_) { /* ignore */ }
        renderNotifsList([]);
      });
    }

    renderNotifsList(notifs);
  }

  /* ─────────────────────────────────────────────
     PERSONAL DASHBOARD IMPLEMENTATION (HEATMAP)
  ───────────────────────────────────────────── */
  let personalChartInstance = null;

  function initPersonalDashboard() {
    const welcomeTitle = document.getElementById('personalWelcomeTitle');
    if (welcomeTitle) welcomeTitle.textContent = `Welcome back, ${currentUser.name || 'Developer'}`;

    const userTasks = currentUser.tasks || [];
    const projects = currentUser.projects || [];
    const completedTasks = userTasks.filter(t => t.status === 'Done');

    // Metrics
    const completedCount = completedTasks.length;
    const activeProjectsCount = projects.length;
    
    // Velocity (completed in past 7 days)
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
    const weeklyDone = completedTasks.filter(t => t.completedAt && new Date(t.completedAt) >= sevenDaysAgo).length;

    const completedEl = document.getElementById('personalCompletedTasksCount');
    const projectsEl = document.getElementById('personalActiveProjectsCount');
    const hoursEl = document.getElementById('personalFocusHoursCount');
    const velocityEl = document.getElementById('personalTaskVelocity');

    if (completedEl) completedEl.textContent = completedCount;
    if (projectsEl) projectsEl.textContent = activeProjectsCount;
    if (velocityEl) velocityEl.textContent = `${weeklyDone}/wk`;

    if (hoursEl && api.fetchFocusSummary) {
      api.fetchFocusSummary(7)
        .then((summary) => { hoursEl.textContent = `${summary ? summary.totalHours : 0}h`; })
        .catch(() => { hoursEl.textContent = '0h'; });
    }

    // Render Onboarding Milestones
    renderOnboardingMilestones(userTasks, projects);

    // Render Heatmap
    renderPersonalHeatmap(userTasks);

    // Render Productivity Chart
    renderPersonalProductivityChart(userTasks);

    // Render Active Tasks
    renderPersonalTasksList(userTasks);
  }

  async function renderOnboardingMilestones(tasks, projects) {
    const stepTask = document.getElementById('stepTask');
    const stepFocus = document.getElementById('stepFocus');
    const stepProject = document.getElementById('stepProject');
    const stepProfile = document.getElementById('stepProfile');
    const badge = document.getElementById('onboardingProgressBadge');
    const fill = document.getElementById('onboardingProgressFill');

    if (!stepTask || !stepFocus || !stepProject || !stepProfile) return;

    let completed = 0;

    // 1. Create 1st Task
    if (tasks && tasks.length > 0) {
      stepTask.classList.add('completed');
      completed++;
    } else {
      stepTask.classList.remove('completed');
    }

    // 2. Setup Workspace (Projects)
    if (projects && projects.length > 0) {
      stepProject.classList.add('completed');
      completed++;
    } else {
      stepProject.classList.remove('completed');
    }

    // 3. Personalize Profile
    const isProfilePersonalized = currentUser.bio || currentUser.photo || (currentUser.skills && currentUser.skills.length > 0) || (currentUser.name && currentUser.name !== currentUser.email.split('@')[0]);
    if (isProfilePersonalized) {
      stepProfile.classList.add('completed');
      completed++;
    } else {
      stepProfile.classList.remove('completed');
    }

    // 4. Launch Focus Sprint
    let focusCompleted = false;
    try {
      const history = JSON.parse(localStorage.getItem('nexus-focus-history') || '[]');
      if (history.length > 0) {
        focusCompleted = true;
      }
    } catch(e) {}
    
    if (!focusCompleted && typeof api.fetchFocusSummary === 'function') {
      try {
        const summary = await api.fetchFocusSummary(30);
        if (summary && summary.totalHours > 0) {
          focusCompleted = true;
        }
      } catch(e) {}
    }

    if (focusCompleted) {
      stepFocus.classList.add('completed');
      completed++;
    } else {
      stepFocus.classList.remove('completed');
    }

    if (badge) badge.textContent = `${completed}/4 Milestones Completed`;
    if (fill) fill.style.width = `${(completed / 4) * 100}%`;
  }

  async function renderPersonalHeatmap(tasks) {
    const grid = document.getElementById('personalHeatmapGrid');
    if (!grid) return;

    // Prefer server heatmap; fall back to local task dates
    let completionMap = null;
    if (typeof api.fetchTaskHeatmap === 'function') {
      try { completionMap = await api.fetchTaskHeatmap(); } catch (_) { completionMap = null; }
    }
    if (!completionMap) {
      completionMap = {};
      tasks.forEach(t => {
        if (t.status === 'Done' && (t.completedAt || t.updatedAt || t.createdAt)) {
          const dateString = t.completedAt || t.updatedAt || t.createdAt;
          const dateKey = toLocalDateKey(new Date(dateString));
          completionMap[dateKey] = (completionMap[dateKey] || 0) + 1;
        }
      });
    }

    // Build 52-week matrix (364 days leading up to today)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startDate = new Date(today);
    startDate.setDate(today.getDate() - 364);

    let cellsHTML = '';
    let totalContributions = 0;
    let currentStreak = 0;
    let longestStreak = 0;
    let tempStreak = 0;

    // Loop through 365 days
    for (let d = 0; d < 365; d++) {
      const currentDate = new Date(startDate.getTime() + d * 86400000);
      const dateKey = toLocalDateKey(currentDate);
      const count = completionMap[dateKey] || 0;

      totalContributions += count;

      // Streak calculation
      if (count > 0) {
        tempStreak++;
        if (tempStreak > longestStreak) longestStreak = tempStreak;
      } else {
        tempStreak = 0;
      }

      let intensity = 0;
      if (count === 1) intensity = 1;
      else if (count === 2) intensity = 2;
      else if (count === 3) intensity = 3;
      else if (count >= 4) intensity = 4;

      const formattedDate = currentDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      const tooltip = `${count} task(s) completed on ${formattedDate}`;

      cellsHTML += `<div class="heatmap-cell level-${intensity}" title="${tooltip}" data-date="${dateKey}" data-count="${count}"></div>`;
    }

    // Current streak (consecutive active days up to today or yesterday)
    let checkDate = new Date(today);
    let todayKey = toLocalDateKey(checkDate);
    if (!completionMap[todayKey]) {
      checkDate.setDate(checkDate.getDate() - 1);
      todayKey = toLocalDateKey(checkDate);
    }
    while (completionMap[todayKey] && completionMap[todayKey] > 0) {
      currentStreak++;
      checkDate.setDate(checkDate.getDate() - 1);
      todayKey = toLocalDateKey(checkDate);
    }

    grid.innerHTML = cellsHTML;

    const currentStreakEl = document.getElementById('personalCurrentStreak');
    const longestStreakEl = document.getElementById('personalLongestStreak');
    const totalContributionsEl = document.getElementById('personalTotalContributions');

    if (currentStreakEl) currentStreakEl.textContent = `${currentStreak} Days`;
    if (longestStreakEl) longestStreakEl.textContent = `${longestStreak} Days`;
    if (totalContributionsEl) totalContributionsEl.textContent = `${totalContributions}`;
  }

  function renderPersonalProductivityChart(tasks) {
    const ctx = document.getElementById('personalProductivityChart');
    if (!ctx) return;

    if (personalChartInstance) personalChartInstance.destroy();

    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const counts = [0, 0, 0, 0, 0, 0, 0];

    const weekAgoChart = Date.now() - 7 * 86400000;
    tasks.filter(t => t.status === 'Done').forEach(t => {
      const d = t.completedAt ? new Date(t.completedAt) : (t.updatedAt ? new Date(t.updatedAt) : null);
      if (!d || isNaN(d.getTime()) || d.getTime() < weekAgoChart) return;
      const idx = (d.getDay() + 6) % 7;
      counts[idx] += 1;
    });

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const accentColor = isDark ? '#4ade80' : '#16a34a';
    const textColor = isDark ? '#94a3b8' : '#64748b';

    personalChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: days,
        datasets: [{
          label: 'Daily Task Completion',
          data: counts,
          borderColor: accentColor,
          backgroundColor: isDark ? 'rgba(74, 222, 128, 0.15)' : 'rgba(22, 163, 74, 0.1)',
          fill: true,
          tension: 0.35,
          borderWidth: 3,
          pointRadius: 4,
          pointBackgroundColor: accentColor
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { color: textColor, font: { family: 'Inter', size: 11 } } },
          y: { grid: { color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }, ticks: { color: textColor, precision: 0 } }
        }
      }
    });
  }

  function renderPersonalTasksList(tasks) {
    const container = document.getElementById('personalTasksList');
    if (!container) return;

    const pending = tasks.filter(t => t.status !== 'Done');

    if (!pending.length) {
      container.innerHTML = `
        <div class="rich-empty-card">
          <div class="empty-icon-wrapper">
            <div class="empty-aura-ring"></div>
            <svg class="empty-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
          </div>
          <h4>All Personal Tasks Completed!</h4>
          <p>You have resolved all pending focus tasks. Take a break or launch a new focus sprint.</p>
          <div style="display:flex;gap:0.6rem;margin-top:0.4rem;">
            <a href="create.html" class="primary-btn" style="padding:0.45rem 0.9rem;font-size:0.82rem;text-decoration:none;">+ Create Task</a>
            <a href="focus.html" class="ghost-btn" style="padding:0.45rem 0.9rem;font-size:0.82rem;text-decoration:none;">⏱ Start Focus</a>
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = pending.slice(0, 5).map(task => `
      <div class="deadline-item">
        <div class="deadline-info">
          <strong>${esc(task.title || 'Untitled Task')}</strong>
          <small>${esc(task.priority || 'Medium')} priority • ${esc(task.dueDate || 'No deadline')}</small>
        </div>
        <span class="profile-role-badge role-personal">${esc(task.status || 'Todo')}</span>
      </div>
    `).join('');
  }

  /* ── Automatic Live Updates ── */
  function refreshActiveDashboard() {
    const freshUser = api.getMe();
    if (!freshUser) return;
    // Preserve tasks/projects arrays that were loaded during init
    const savedTasks = currentUser.tasks;
    const savedProjects = currentUser.projects;
    Object.assign(currentUser, freshUser);
    if (!Array.isArray(currentUser.tasks)) currentUser.tasks = savedTasks || [];
    if (!Array.isArray(currentUser.projects)) currentUser.projects = savedProjects || [];
    const roleIsAdmin = currentUser.role === 'admin';
    const roleIsPersonal = currentUser.role === 'personal' || (!roleIsAdmin && currentUser.role !== 'employee');
    if (roleIsAdmin) initAdminDashboard();
    else if (roleIsPersonal) initPersonalDashboard();
    else initEmployeeDashboard();
  }

  window.addEventListener('nexus:tasks-updated', refreshActiveDashboard);
  window.addEventListener('storage', refreshActiveDashboard);

  const socket = window.NexusSocket;
  if (socket) {
    socket.on('presence:update', refreshActiveDashboard);
    socket.on('attendance:update', () => { refreshAttendance().catch(() => {}); });
    socket.on('activity:update', () => {
      if (currentUser.role === 'admin') renderAdminActivityFeed().catch(() => {});
    });
  }

  // Fallback for browsers/tabs without a live socket: keep attendance in step with the database.
  setInterval(() => { refreshAttendance().catch(() => {}); }, 60000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshAttendance().catch(() => {});
  });
})();
