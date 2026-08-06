/* ============================================================
   NexusWeave — Admin & Employee Separate Dashboards
   ============================================================ */

(function () {
  const api = window.NexusAPI;
  const helpers = window.AppHelpers;

  /* ── Auth Check ── */
  let currentUser = api.getMe();
  if (!currentUser) {
    window.location.href = 'index.html';
    return;
  }

  /* ── DOM Elements ── */
  const personalView = document.getElementById('personalDashboardView');
  const adminView = document.getElementById('adminDashboardView');
  const employeeView = document.getElementById('employeeDashboardView');
  const roleBadgeHeader = document.getElementById('roleBadgeHeader');
  const dashboardHeading = document.getElementById('dashboardHeading');
  const dashboardEyebrow = document.getElementById('dashboardEyebrow');

  function applyRoleView(user) {
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
      initAdminDashboard();
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

      const data = await api.getUserData();
      if (data) {
        currentUser.tasks = Array.isArray(data.tasks) ? data.tasks : [];
        currentUser.projects = Array.isArray(data.projects) ? data.projects : [];
        // Persist so board/tasks pages and refresh share the same data
        if (api.saveUserData) {
          api.saveUserData({
            projects: currentUser.projects,
            tasks: currentUser.tasks
          });
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
  let adminChartInstance = null;

  async function initAdminDashboard() {
    const orgId = currentUser.organizationId;
    const orgUsers = orgId ? await api.getAllUsersInOrg(orgId) : [currentUser];
    const orgInfo = orgId ? api.getOrganization(orgId) : null;

    // Title
    const adminWelcomeTitle = document.getElementById('adminWelcomeTitle');
    if (adminWelcomeTitle) {
      adminWelcomeTitle.textContent = `Welcome, ${currentUser.name || 'Admin'}${orgInfo ? ' — ' + orgInfo.name : ''}`;
    }

    const totalEmployees = orgUsers.length;

    // Org tasks come from getUserData (admin JWT sees all org tasks) — org user API has no embedded tasks
    const allOrgTasks = Array.isArray(currentUser.tasks) ? currentUser.tasks.slice() : [];

    // Attach tasks to each member for leaderboard scoring
    const usersWithTasks = orgUsers.map((u) => {
      const email = (u.email || '').toLowerCase();
      const memberTasks = allOrgTasks.filter((t) => {
        const owner = (t.assignedUserEmail || t.userEmail || '').toLowerCase();
        return owner === email;
      });
      return { ...u, tasks: memberTasks };
    });

    const tasksAssigned = allOrgTasks.length;
    const completedTasks = allOrgTasks.filter((t) => t.status === 'Done').length;
    const pendingTasks = allOrgTasks.filter((t) => t.status !== 'Done').length;

    const todayAttendance = getTodayAttendanceMap();
    const presentCount = Object.keys(todayAttendance).filter((e) => {
      const s = todayAttendance[e] && todayAttendance[e].status;
      return s === 'in' || s === 'present';
    }).length;
    const attendanceRate = totalEmployees > 0 ? Math.round((presentCount / totalEmployees) * 100) : 0;

    const adminTotalEl = document.getElementById('adminTotalEmployees');
    const adminAssignedEl = document.getElementById('adminTasksAssigned');
    const adminCompletedEl = document.getElementById('adminCompletedTasks');
    const adminPendingEl = document.getElementById('adminPendingTasks');
    const adminAttendanceEl = document.getElementById('adminAttendanceRate');

    if (adminTotalEl) adminTotalEl.textContent = totalEmployees;
    if (adminAssignedEl) adminAssignedEl.textContent = tasksAssigned;
    if (adminCompletedEl) adminCompletedEl.textContent = completedTasks;
    if (adminPendingEl) adminPendingEl.textContent = pendingTasks;
    if (adminAttendanceEl) adminAttendanceEl.textContent = `${attendanceRate}%`;

    renderAdminProductivityChart(allOrgTasks);
    renderAdminLeaderboard(usersWithTasks);
    initSimpleAttendance('admin');
    renderAdminAttendanceList(orgUsers, getTodayAttendanceMap());
    renderAdminActivityFeed(currentUser);
  }

  function renderAdminProductivityChart(allTasks) {
    const ctx = document.getElementById('adminProductivityChart');
    if (!ctx) return;

    if (adminChartInstance) {
      adminChartInstance.destroy();
    }

    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const today = new Date();
    const completedByDay = [0, 0, 0, 0, 0, 0, 0];

    // Compute completions over the past week
    allTasks.filter(t => t.status === 'Done').forEach(t => {
      const date = t.completedAt ? new Date(t.completedAt) : new Date();
      const dayIdx = (date.getDay() + 6) % 7; // Mon=0, Sun=6
      completedByDay[dayIdx] += 1;
    });

    const targetByDay = [5, 8, 12, 10, 15, 6, 4];

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const accentColor = isDark ? '#a78bfa' : '#5b21b6';
    const textColor = isDark ? '#94a3b8' : '#64748b';

    adminChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: days,
        datasets: [
          {
            label: 'Completed Tasks',
            data: completedByDay,
            backgroundColor: accentColor,
            borderRadius: 8,
            borderSkipped: false
          },
          {
            label: 'Target Goal',
            data: targetByDay,
            backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
            borderRadius: 8,
            borderSkipped: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: textColor, font: { family: 'Inter', size: 12 } }
          },
          y: {
            beginAtZero: true,
            suggestedMax: Math.max(5, ...completedByDay, 1),
            grid: { color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' },
            ticks: { color: textColor, font: { family: 'Inter', size: 12 }, precision: 0 }
          }
        }
      }
    });
  }

  function renderAdminLeaderboard(users) {
    const container = document.getElementById('adminLeaderboardList');
    if (!container) return;

    // Calculate score per user
    const ranked = users.map(u => {
      const tasks = u.tasks || [];
      const done = tasks.filter(t => t.status === 'Done').length;
      const total = tasks.length;
      const rate = total > 0 ? Math.round((done / total) * 100) : 0;
      return {
        name: u.name || u.email.split('@')[0],
        email: u.email,
        role: u.role || 'employee',
        done,
        total,
        score: done * 10 + rate
      };
    }).sort((a, b) => b.score - a.score);

    if (!ranked.length) {
      container.innerHTML = `<div class="empty-inline">No employees found.</div>`;
      return;
    }

    const esc = (s) => (typeof AppHelpers !== 'undefined' && AppHelpers.escapeHTML) ? AppHelpers.escapeHTML(s) : String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    container.innerHTML = ranked.slice(0, 5).map((user, idx) => `
      <div class="leaderboard-item">
        <div class="leaderboard-rank rank-${idx + 1}">${rankIcons[idx] || '#' + (idx + 1)}</div>
        <div class="leaderboard-user">
          <span class="leaderboard-avatar">${esc(user.name.charAt(0).toUpperCase())}</span>
          <div class="leaderboard-meta">
            <strong>${esc(user.name)}</strong>
            <small>${esc(user.email)}</small>
          </div>
        </div>
        <div class="leaderboard-score">
          <strong>${user.done} Done</strong>
          <small>${user.total} total tasks</small>
        </div>
      </div>
    `).join('');
  }

  function getTodayKey() {
    return new Date().toISOString().split('T')[0];
  }

  function getTodayAttendanceMap() {
    const records = JSON.parse(localStorage.getItem('nw_attendance') || '{}');
    return records[getTodayKey()] || {};
  }

  function isMarkedPresent(email) {
    const record = getTodayAttendanceMap()[email];
    return Boolean(record && (record.status === 'in' || record.status === 'present'));
  }

  function markAttendancePresent(email, name) {
    const key = getTodayKey();
    const records = JSON.parse(localStorage.getItem('nw_attendance') || '{}');
    if (!records[key]) records[key] = {};
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    records[key][email] = { status: 'present', time, markedAt: new Date().toISOString() };
    localStorage.setItem('nw_attendance', JSON.stringify(records));

    if (window.NexusNotify && email === currentUser.email) {
      window.NexusNotify.add({ icon: '✅', text: 'Attendance marked for today.', type: 'success' });
    }

    return records[key][email];
  }

  function clearAttendance(email) {
    const key = getTodayKey();
    const records = JSON.parse(localStorage.getItem('nw_attendance') || '{}');
    if (records[key] && records[key][email]) {
      delete records[key][email];
      localStorage.setItem('nw_attendance', JSON.stringify(records));
    }
  }

  let attendanceBound = { admin: false, emp: false };

  function initSimpleAttendance(role) {
    const isAdminRole = role === 'admin';
    const statusEl = document.getElementById(isAdminRole ? 'adminSelfAttendanceStatus' : 'empAttendanceStatus');
    const metaEl = document.getElementById(isAdminRole ? 'adminSelfAttendanceMeta' : 'empAttendanceMeta');
    const btn = document.getElementById(isAdminRole ? 'adminMarkAttendanceBtn' : 'empMarkAttendanceBtn');
    const statEl = document.getElementById('empAttendanceStat');
    if (!btn || !statusEl) return;

    function refreshUI() {
      const present = isMarkedPresent(currentUser.email);
      const record = getTodayAttendanceMap()[currentUser.email];
      if (present) {
        statusEl.textContent = 'Present today';
        if (metaEl) metaEl.textContent = `Marked at ${record.time || '—'}. Click to undo.`;
        btn.textContent = 'Undo Attendance';
        btn.className = 'ghost-btn';
      } else {
        statusEl.textContent = 'Not marked today';
        if (metaEl) metaEl.textContent = 'Click below to mark yourself present.';
        btn.textContent = 'Mark Present';
        btn.className = 'primary-btn';
      }
      if (statEl && !isAdminRole) statEl.textContent = present ? 'Yes' : 'No';
    }

    if (!attendanceBound[role]) {
      attendanceBound[role] = true;
      btn.addEventListener('click', () => {
        if (isMarkedPresent(currentUser.email)) {
          clearAttendance(currentUser.email);
        } else {
          markAttendancePresent(currentUser.email, currentUser.name);
        }
        refreshUI();
        if (isAdminRole) {
          api.getAllUsersInOrg(currentUser.organizationId).then((users) => {
            renderAdminAttendanceList(users || [], getTodayAttendanceMap());
          }).catch(() => {
            renderAdminAttendanceList([currentUser], getTodayAttendanceMap());
          });
        }
      });
    }

    refreshUI();
  }

  function renderAdminAttendanceList(users, todayAttendance) {
    const container = document.getElementById('adminAttendanceList');
    if (!container) return;

    if (!users.length) {
      container.innerHTML = `<div class="empty-inline">No team members found.</div>`;
      return;
    }

    const presentUsers = users.filter((u) => {
      const record = todayAttendance[u.email];
      return record && (record.status === 'in' || record.status === 'present');
    });

    if (!presentUsers.length) {
      container.innerHTML = `<div class="empty-inline">No attendance marked yet today.</div>`;
      return;
    }

    const esc = (s) => (typeof AppHelpers !== 'undefined' && AppHelpers.escapeHTML) ? AppHelpers.escapeHTML(s) : String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    container.innerHTML = presentUsers.map((u) => {
      const record = todayAttendance[u.email];
      return `
        <div class="attendance-admin-item">
          <div style="display:flex;align-items:center;gap:0.6rem;">
            <span style="font-size:0.9rem;">🟢</span>
            <div>
              <strong>${esc(u.name || u.email)}</strong>
              <small style="display:block;color:var(--ink-soft);font-size:0.75rem;">${esc(u.email)}</small>
            </div>
          </div>
          <span class="attendance-time-tag">${esc(record.time || 'Present')}</span>
        </div>
      `;
    }).join('');
  }

  function renderAdminActivityFeed(user) {
    const container = document.getElementById('adminActivityFeed');
    if (!container) return;

    const activity = user.activity || [];
    if (!activity.length) {
      container.innerHTML = `<div class="empty-inline">No recent activity logged.</div>`;
      return;
    }

    const esc = (s) => (typeof AppHelpers !== 'undefined' && AppHelpers.escapeHTML) ? AppHelpers.escapeHTML(s) : String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    container.innerHTML = activity.slice(0, 6).map(act => `
      <div class="activity-item">
        <span>${esc(act.text || act.description || String(act))}</span>
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

    if (empProfileAvatar) empProfileAvatar.textContent = (currentUser.name || currentUser.email).charAt(0).toUpperCase();
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
      return diffDays <= 3;
    }).length;

    const empAssignedEl = document.getElementById('empAssignedTasks');
    const empCompletedEl = document.getElementById('empCompletedTasks');
    const empDeadlinesEl = document.getElementById('empUpcomingDeadlines');
    if (empAssignedEl) empAssignedEl.textContent = assignedCount;
    if (empCompletedEl) empCompletedEl.textContent = completedCount;
    if (empDeadlinesEl) empDeadlinesEl.textContent = upcomingDeadlines;

    try { initSimpleAttendance('emp'); } catch (err) { console.warn('Attendance widget error:', err); }
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
      const todo = tasks.filter(t => t.status === 'Todo' || !t.status).length;
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
            <strong>${task.title || 'Untitled Task'}</strong>
            <small>${projectName}</small>
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
            items.push({ icon: '⚠️', text: `"${t.title}" is overdue by ${Math.abs(diffDays)} day(s).`, time: 'Deadline' });
          } else if (diffDays <= 2) {
            items.push({ icon: '⏰', text: `"${t.title}" is due ${diffDays === 0 ? 'today' : 'in ' + diffDays + ' day(s)'}.`, time: 'Upcoming' });
          }
        }
      }
      if (String(t.priority || '').toLowerCase() === 'high') {
        items.push({ icon: '🔥', text: `High priority task: "${t.title}" needs attention.`, time: 'Priority' });
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
    
    // Focus hours from tracker / activity
    const focusTracker = window.NexusTracker;
    const focusHours = focusTracker ? focusTracker.calculateWorkingHours(currentUser.email, 'weekly') : Math.max(12, Math.round(completedCount * 1.4));

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
    if (hoursEl) hoursEl.textContent = `${focusHours}h`;
    if (velocityEl) velocityEl.textContent = `${weeklyDone}/wk`;

    // Render Heatmap
    renderPersonalHeatmap(userTasks);

    // Render Productivity Chart
    renderPersonalProductivityChart(userTasks);

    // Render Active Tasks
    renderPersonalTasksList(userTasks);
  }

  async function renderPersonalHeatmap(tasks) {
    const grid = document.getElementById('personalHeatmapGrid');
    if (!grid) return;

    // Prefer server heatmap; fall back to local task dates
    let completionMap = null;
    if (api.fetchTaskHeatmap) {
      completionMap = await api.fetchTaskHeatmap();
    }
    if (!completionMap) {
      completionMap = {};
      tasks.forEach(t => {
        if (t.status === 'Done' && (t.completedAt || t.updatedAt || t.createdAt)) {
          const dateString = t.completedAt || t.updatedAt || t.createdAt;
          const dateKey = new Date(dateString).toISOString().split('T')[0];
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
      const dateKey = currentDate.toISOString().split('T')[0];
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
    let todayKey = checkDate.toISOString().split('T')[0];
    if (!completionMap[todayKey]) {
      checkDate.setDate(checkDate.getDate() - 1);
      todayKey = checkDate.toISOString().split('T')[0];
    }
    while (completionMap[todayKey] && completionMap[todayKey] > 0) {
      currentStreak++;
      checkDate.setDate(checkDate.getDate() - 1);
      todayKey = checkDate.toISOString().split('T')[0];
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

    tasks.filter(t => t.status === 'Done').forEach(t => {
      const d = t.completedAt ? new Date(t.completedAt) : new Date();
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
      container.innerHTML = `<div class="empty-inline">All personal tasks completed! High five! ✋</div>`;
      return;
    }

    container.innerHTML = pending.slice(0, 5).map(task => `
      <div class="deadline-item">
        <div class="deadline-info">
          <strong>${task.title || 'Untitled Task'}</strong>
          <small>${task.priority || 'Medium'} priority • ${task.dueDate || 'No deadline'}</small>
        </div>
        <span class="profile-role-badge role-personal">${task.status || 'Todo'}</span>
      </div>
    `).join('');
  }

  /* ── Automatic Live Updates ── */
  function refreshActiveDashboard() {
    const freshUser = api.getMe();
    if (!freshUser) return;
    Object.assign(currentUser, freshUser);
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
    socket.on('attendance:marked', refreshActiveDashboard);
  }
})();
