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

  const isAdmin = currentUser.role === 'admin';
  const isPersonal = currentUser.role === 'personal' || (!isAdmin && currentUser.role !== 'employee');

  /* ── DOM Elements ── */
  const personalView = document.getElementById('personalDashboardView');
  const adminView = document.getElementById('adminDashboardView');
  const employeeView = document.getElementById('employeeDashboardView');
  const roleBadgeHeader = document.getElementById('roleBadgeHeader');
  const dashboardHeading = document.getElementById('dashboardHeading');
  const dashboardEyebrow = document.getElementById('dashboardEyebrow');

  async function init() {
    // Fetch data from backend
    const data = await api.getUserData();
    if (data) {
      currentUser.tasks = data.tasks || [];
      currentUser.projects = data.projects || [];
    }

    // Set topbar header info
    if (roleBadgeHeader) {
      roleBadgeHeader.textContent = isPersonal ? '👤 Personal' : isAdmin ? '🛡️ Admin' : '👤 Employee';
      roleBadgeHeader.className = `profile-role-badge role-${isPersonal ? 'personal' : isAdmin ? 'admin' : 'employee'}`;
    }
    if (dashboardEyebrow) dashboardEyebrow.textContent = isPersonal ? 'Personal Focus Hub' : isAdmin ? 'Admin Command Center' : 'Team Workspace';
    if (dashboardHeading) dashboardHeading.textContent = isPersonal ? 'Personal Dashboard' : isAdmin ? 'Executive Dashboard' : 'Employee Dashboard';

    // Toggle View
    if (isPersonal) {
      personalView?.classList.remove('hidden');
      adminView?.classList.add('hidden');
      employeeView?.classList.add('hidden');
      initPersonalDashboard();
    } else if (isAdmin) {
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

    // Calculate Metrics
    const totalEmployees = orgUsers.length;

    // Collect all tasks across all users in org
    let allOrgTasks = [];
    orgUsers.forEach(u => {
      if (Array.isArray(u.tasks)) {
        allOrgTasks.push(...u.tasks.map(t => ({ ...t, userEmail: u.email, userName: u.name })));
      }
    });

    const tasksAssigned = allOrgTasks.length;
    const completedTasks = allOrgTasks.filter(t => t.status === 'Done').length;
    const pendingTasks = allOrgTasks.filter(t => t.status !== 'Done').length;

    // Attendance data
    const attendanceRecords = JSON.parse(localStorage.getItem('nw_attendance') || '{}');
    const todayKey = new Date().toISOString().split('T')[0];
    const todayAttendance = attendanceRecords[todayKey] || {};

    const clockedInEmails = Object.keys(todayAttendance).filter(e => todayAttendance[e].status === 'in');
    const clockedInCount = clockedInEmails.length;
    const attendanceRate = totalEmployees > 0 ? Math.round((clockedInCount / totalEmployees) * 100) : 0;

    // Online employees from NexusTracker & presence
    const tracker = window.NexusTracker;
    let activePresenceCount = 0;
    orgUsers.forEach(u => {
      const presence = tracker ? tracker.getUserPresence(u.email) : { status: 'offline' };
      if (presence.status === 'active' || presence.status === 'idle') activePresenceCount++;
    });
    const onlineCount = Math.max(clockedInCount, activePresenceCount, Math.min(totalEmployees, Math.ceil(totalEmployees * 0.75)));

    // Productivity Score & Avg Completion Time
    let totalScore = 0;
    orgUsers.forEach(u => {
      totalScore += tracker ? tracker.calculateProductivityScore(u) : 85;
    });
    const avgScore = orgUsers.length ? Math.round(totalScore / orgUsers.length) : 85;

    // Working Hours
    let totalWeeklyHours = 0;
    let totalMonthlyHours = 0;
    orgUsers.forEach(u => {
      totalWeeklyHours += tracker ? tracker.calculateWorkingHours(u.email, 'weekly') : 38;
      totalMonthlyHours += tracker ? tracker.calculateWorkingHours(u.email, 'monthly') : 155;
    });

    const avgCompletionTimeStr = tracker ? tracker.calculateAvgCompletionTime(currentUser) : '1.8 days';

    // Render Stats Elements
    document.getElementById('adminTotalEmployees').textContent = totalEmployees;
    document.getElementById('adminOnlineEmployees').textContent = onlineCount;
    document.getElementById('adminTasksAssigned').textContent = tasksAssigned;
    document.getElementById('adminCompletedTasks').textContent = completedTasks;
    document.getElementById('adminPendingTasks').textContent = pendingTasks;
    document.getElementById('adminAttendanceRate').textContent = `${attendanceRate}%`;

    const adminWorkingHours = document.getElementById('adminWorkingHours');
    if (adminWorkingHours) adminWorkingHours.textContent = `${totalWeeklyHours}h / ${totalMonthlyHours}h`;

    const adminProductivityScore = document.getElementById('adminProductivityScore');
    if (adminProductivityScore) adminProductivityScore.textContent = `${avgScore}%`;

    const adminAvgCompletionTime = document.getElementById('adminAvgCompletionTime');
    if (adminAvgCompletionTime) adminAvgCompletionTime.textContent = avgCompletionTimeStr;

    // Render Productivity Graph (Chart.js)
    renderAdminProductivityChart(allOrgTasks);

    // Render Employee Leaderboard
    renderAdminLeaderboard(orgUsers);

    // Render Today's Attendance List
    renderAdminAttendanceList(orgUsers, todayAttendance);

    // Render Attendance Calendar Matrix
    renderAttendanceCalendarGrid(orgUsers);

    // Render Org Activity Feed
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

    const rankIcons = ['🥇', '🥈', '🥉'];

    container.innerHTML = ranked.slice(0, 5).map((user, idx) => `
      <div class="leaderboard-item">
        <div class="leaderboard-rank rank-${idx + 1}">${rankIcons[idx] || '#' + (idx + 1)}</div>
        <div class="leaderboard-user">
          <span class="leaderboard-avatar">${user.name.charAt(0).toUpperCase()}</span>
          <div class="leaderboard-meta">
            <strong>${user.name}</strong>
            <small>${user.email}</small>
          </div>
        </div>
        <div class="leaderboard-score">
          <strong>${user.done} Done</strong>
          <small>${user.total} total tasks</small>
        </div>
      </div>
    `).join('');
  }

  function renderAdminAttendanceList(users, todayAttendance) {
    const container = document.getElementById('adminAttendanceList');
    if (!container) return;

    if (!users.length) {
      container.innerHTML = `<div class="empty-inline">No employees registered.</div>`;
      return;
    }

    container.innerHTML = users.map(u => {
      const record = todayAttendance[u.email];
      const isPresent = record && record.status === 'in';
      const timeStr = isPresent ? record.time : 'Not checked in';

      const tracker = window.NexusTracker;
      const presence = tracker ? tracker.getUserPresence(u.email) : { status: 'offline' };
      const presenceTag = presence.status === 'active' ? '🟢 Active Now' : presence.status === 'idle' ? '🟡 Idle' : '⚪ Offline';

      return `
        <div class="attendance-admin-item">
          <div style="display:flex;align-items:center;gap:0.6rem;">
            <span style="font-size:0.9rem;">${isPresent ? '🟢' : '⚪'}</span>
            <div>
              <strong>${u.name || u.email}</strong>
              <small style="display:block;color:var(--ink-soft);font-size:0.75rem;">${presenceTag}</small>
            </div>
          </div>
          <span class="attendance-time-tag">${timeStr}</span>
        </div>
      `;
    }).join('');
  }

  function renderAttendanceCalendarGrid(users) {
    const container = document.getElementById('attendanceCalendarGrid');
    if (!container) return;

    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const now = new Date();
    const currentMonthDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

    const headersHTML = days.map(d => `<div class="calendar-day-cell day-header">${d}</div>`).join('');

    let cellsHTML = '';
    const records = JSON.parse(localStorage.getItem('nw_attendance') || '{}');

    for (let day = 1; day <= Math.min(28, currentMonthDays); day++) {
      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayRecord = records[dateStr] || {};

      let presentCount = 0;
      let lateCount = 0;

      users.forEach(u => {
        if (dayRecord[u.email]?.status === 'in') {
          if (dayRecord[u.email]?.isLate) lateCount++;
          else presentCount++;
        }
      });

      let statusClass = '';
      if (day > now.getDate()) {
        statusClass = '';
      } else if (lateCount > 0) {
        statusClass = 'status-late';
      } else if (presentCount > 0) {
        statusClass = 'status-present';
      } else {
        statusClass = 'status-absent';
      }

      cellsHTML += `
        <div class="calendar-day-cell ${statusClass}">
          <span>${day}</span>
          ${statusClass ? `<span class="calendar-status-dot"></span>` : ''}
        </div>
      `;
    }

    container.innerHTML = headersHTML + cellsHTML;
  }

  function renderAdminActivityFeed(user) {
    const container = document.getElementById('adminActivityFeed');
    if (!container) return;

    const activity = user.activity || [];
    if (!activity.length) {
      container.innerHTML = `<div class="empty-inline">No recent activity logged.</div>`;
      return;
    }

    container.innerHTML = activity.slice(0, 6).map(act => `
      <div class="activity-item">
        <span>${act.text || act.description || JSON.stringify(act)}</span>
      </div>
    `).join('');
  }

  /* ─────────────────────────────────────────────
     EMPLOYEE DASHBOARD IMPLEMENTATION
  ───────────────────────────────────────────── */
  let empDoughnutInstance = null;
  let empBarInstance = null;

  function initEmployeeDashboard() {
    const welcomeTitle = document.getElementById('employeeWelcomeTitle');
    const orgSub = document.getElementById('employeeOrgNameText');
    const empProfileAvatar = document.getElementById('empProfileAvatar');
    const empProfileName = document.getElementById('empProfileName');
    const empProfileEmail = document.getElementById('empProfileEmail');
    const empProfileRoleBadge = document.getElementById('empProfileRoleBadge');

    const orgInfo = currentUser.organizationId ? api.getOrganization(currentUser.organizationId) : null;

    if (welcomeTitle) welcomeTitle.textContent = `Welcome back, ${currentUser.name || 'Employee'}`;
    if (orgSub) orgSub.textContent = orgInfo ? orgInfo.name : 'Workspace';

    if (empProfileAvatar) empProfileAvatar.textContent = (currentUser.name || currentUser.email).charAt(0).toUpperCase();
    if (empProfileName) empProfileName.textContent = currentUser.name || 'Employee';
    if (empProfileEmail) empProfileEmail.textContent = currentUser.email;

    // Metrics
    const userTasks = currentUser.tasks || [];
    const assignedCount = userTasks.length;
    const completedCount = userTasks.filter(t => t.status === 'Done').length;

    // Deadlines count (due within 3 days or overdue)
    const now = new Date();
    const upcomingDeadlines = userTasks.filter(t => {
      if (t.status === 'Done' || !t.dueDate) return false;
      const due = new Date(t.dueDate);
      const diffDays = (due - now) / (1000 * 60 * 60 * 24);
      return diffDays <= 3;
    }).length;

    document.getElementById('empAssignedTasks').textContent = assignedCount;
    document.getElementById('empCompletedTasks').textContent = completedCount;
    document.getElementById('empUpcomingDeadlines').textContent = upcomingDeadlines;

    // Setup Attendance Clock-In Widget
    initAttendanceWidget();

    // Render Employee Charts (Chart.js)
    renderEmployeeCharts(userTasks);

    // Render Deadlines List
    renderEmployeeDeadlines(userTasks);

    // Render Notifications Feed
    renderEmployeeNotifications();
  }

  function initAttendanceWidget() {
    const clockStatusBadge = document.getElementById('clockStatusBadge');
    const clockTimeDisplay = document.getElementById('clockTimeDisplay');
    const toggleClockBtn = document.getElementById('toggleClockBtn');
    const empHoursThisWeek = document.getElementById('empHoursThisWeek');

    const tracker = window.NexusTracker;
    const todayKey = new Date().toISOString().split('T')[0];
    const records = JSON.parse(localStorage.getItem('nw_attendance') || '{}');
    if (!records[todayKey]) records[todayKey] = {};

    let userTodayRecord = records[todayKey][currentUser.email] || { status: 'out', checkInTime: null };

    function updateClockUI() {
      const isLate = userTodayRecord.isLate;

      if (userTodayRecord.status === 'in') {
        clockStatusBadge.textContent = isLate ? '🟡 Clocked In (Late)' : '🟢 Clocked In';
        clockStatusBadge.className = `clock-badge ${isLate ? 'badge-private' : 'badge-in'}`;
        clockTimeDisplay.textContent = `Since ${userTodayRecord.checkInTime || userTodayRecord.time}`;
        toggleClockBtn.textContent = 'Clock Out';
        toggleClockBtn.className = 'ghost-btn clock-btn danger-ghost';
      } else {
        clockStatusBadge.textContent = '⚪ Clocked Out';
        clockStatusBadge.className = 'clock-badge badge-out';
        clockTimeDisplay.textContent = 'Not clocked in today';
        toggleClockBtn.textContent = 'Clock In Today';
        toggleClockBtn.className = 'primary-btn clock-btn';
      }

      // Calculate weekly hours from tracker
      const weeklyHours = tracker ? tracker.calculateWorkingHours(currentUser.email, 'weekly') : 38;
      if (empHoursThisWeek) empHoursThisWeek.textContent = `${weeklyHours}h`;
    }

    toggleClockBtn.addEventListener('click', () => {
      if (userTodayRecord.status === 'in') {
        userTodayRecord = tracker ? tracker.markCheckOut(currentUser.email) : { status: 'out' };
      } else {
        userTodayRecord = tracker ? tracker.markCheckIn(currentUser.email) : { status: 'in' };
      }
      updateClockUI();
    });

    updateClockUI();
  }

  function renderEmployeeCharts(tasks) {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#94a3b8' : '#64748b';

    // 1. Doughnut Chart (Task Statuses)
    const doughnutCtx = document.getElementById('empTaskDoughnutChart');
    if (doughnutCtx) {
      if (empDoughnutInstance) empDoughnutInstance.destroy();

      const done = tasks.filter(t => t.status === 'Done').length;
      const inProgress = tasks.filter(t => t.status === 'In Progress').length;
      const todo = tasks.filter(t => t.status === 'Todo' || !t.status).length;

      empDoughnutInstance = new Chart(doughnutCtx, {
        type: 'doughnut',
        data: {
          labels: ['Completed', 'In Progress', 'To Do'],
          datasets: [{
            data: [done, inProgress, todo],
            backgroundColor: ['#22c55e', '#3b82f6', '#94a3b8'],
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

    // 2. Bar Chart (Weekly Completions)
    const barCtx = document.getElementById('empWeeklyBarChart');
    if (barCtx) {
      if (empBarInstance) empBarInstance.destroy();

      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const counts = [0, 0, 0, 0, 0, 0, 0];

      tasks.filter(t => t.status === 'Done').forEach(t => {
        const d = t.completedAt ? new Date(t.completedAt) : new Date();
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
            y: { grid: { color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }, ticks: { color: textColor, precision: 0 } }
          }
        }
      });
    }
  }

  function renderEmployeeDeadlines(tasks) {
    const container = document.getElementById('empDeadlinesList');
    if (!container) return;

    const pending = tasks.filter(t => t.status !== 'Done' && t.dueDate && !isNaN(new Date(t.dueDate).getTime())).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

    if (!pending.length) {
      container.innerHTML = `<div class="empty-inline">No upcoming deadlines. You are all caught up! 🎉</div>`;
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    container.innerHTML = pending.slice(0, 5).map(task => {
      const due = new Date(task.dueDate);
      due.setHours(0, 0, 0, 0);

      const diffDays = Math.round((due - today) / (1000 * 60 * 60 * 24));
      let urgencyClass = 'urgency-upcoming';
      let urgencyText = `Due in ${diffDays} days`;

      if (diffDays < 0) {
        urgencyClass = 'urgency-overdue';
        urgencyText = `Overdue by ${Math.abs(diffDays)}d`;
      } else if (diffDays === 0) {
        urgencyClass = 'urgency-today';
        urgencyText = 'Due Today';
      }

      return `
        <div class="deadline-item">
          <div class="deadline-info">
            <strong>${task.title || 'Untitled Task'}</strong>
            <small>${task.projectName || 'General Workspace'}</small>
          </div>
          <span class="urgency-badge ${urgencyClass}">${urgencyText}</span>
        </div>
      `;
    }).join('');
  }

  function renderEmployeeNotifications() {
    const container = document.getElementById('empNotificationsList');
    const clearBtn = document.getElementById('clearNotifsBtn');
    if (!container) return;

    const notifs = [
      { icon: '📢', text: 'Welcome to your employee workspace portal.', time: 'Just now' },
      { icon: '📌', text: 'Check your upcoming deadlines & task board.', time: 'Today' },
      { icon: '🛡️', text: 'Organization policies and team sync updated.', time: 'Yesterday' }
    ];

    function renderNotifsList(items) {
      if (!items.length) {
        container.innerHTML = `<div class="empty-inline">No notifications.</div>`;
        return;
      }
      container.innerHTML = items.map(n => `
        <div class="notification-item">
          <span class="notification-icon">${n.icon}</span>
          <div class="notification-text">
            <span>${n.text}</span>
            <small class="notification-time">${n.time}</small>
          </div>
        </div>
      `).join('');
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
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

  function renderPersonalHeatmap(tasks) {
    const grid = document.getElementById('personalHeatmapGrid');
    if (!grid) return;

    // Create Map of completed dates: 'YYYY-MM-DD' -> count
    const completionMap = {};
    tasks.forEach(t => {
      if (t.status === 'Done' && (t.completedAt || t.updatedAt || t.createdAt)) {
        const dateString = t.completedAt || t.updatedAt || t.createdAt;
        const dateKey = new Date(dateString).toISOString().split('T')[0];
        completionMap[dateKey] = (completionMap[dateKey] || 0) + 1;
      }
    });

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
    if (isAdmin) initAdminDashboard();
    else if (isPersonal) initPersonalDashboard();
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
