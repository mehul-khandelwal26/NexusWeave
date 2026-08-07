(function () {
  const DB_KEY = 'users';
  const SESSION_KEY = 'session';
  const helpers = window.AppHelpers;

  let currentUser = window.NexusAPI ? window.NexusAPI.getMe() : null;

  if (!currentUser) {
    window.location.href = 'index.html';
    return;
  }

  // DOM Elements
  const overallCompletionRateEl = document.getElementById('overallCompletionRate');
  const todoCountEl = document.getElementById('todoCount');
  const progressCountEl = document.getElementById('progressCount');
  const completedCountEl = document.getElementById('completedCount');

  const highPriorityPctEl = document.getElementById('highPriorityPct');
  const mediumPriorityPctEl = document.getElementById('mediumPriorityPct');
  const lowPriorityPctEl = document.getElementById('lowPriorityPct');

  const highPriorityBarEl = document.getElementById('highPriorityBar');
  const mediumPriorityBarEl = document.getElementById('mediumPriorityBar');
  const lowPriorityBarEl = document.getElementById('lowPriorityBar');

  const projectProgressListEl = document.getElementById('projectProgressList');
  const actionItemsListEl = document.getElementById('actionItemsList');

  function calculateAndRender() {
    const tasks = currentUser.tasks || [];
    const projects = currentUser.projects || [];

    // Overall metrics
    const totalTasks = tasks.length;
    const todoTasks = tasks.filter(t => t.status === 'Todo').length;
    const progressTasks = tasks.filter(t => t.status === 'In Progress').length;
    const completedTasks = tasks.filter(t => t.status === 'Done').length;

    const completionRate = totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0;

    if (overallCompletionRateEl) overallCompletionRateEl.textContent = `${completionRate}%`;
    if (todoCountEl) todoCountEl.textContent = todoTasks;
    if (progressCountEl) progressCountEl.textContent = progressTasks;
    if (completedCountEl) completedCountEl.textContent = completedTasks;

    // Priorities
    const highTasks = tasks.filter(t => t.priority === 'High').length;
    const mediumTasks = tasks.filter(t => t.priority === 'Medium').length;
    const lowTasks = tasks.filter(t => t.priority === 'Low').length;

    const highPct = totalTasks ? Math.round((highTasks / totalTasks) * 100) : 0;
    const mediumPct = totalTasks ? Math.round((mediumTasks / totalTasks) * 100) : 0;
    const lowPct = totalTasks ? Math.round((lowTasks / totalTasks) * 100) : 0;

    if (highPriorityPctEl) highPriorityPctEl.textContent = `${highPct}%`;
    if (mediumPriorityPctEl) mediumPriorityPctEl.textContent = `${mediumPct}%`;
    if (lowPriorityPctEl) lowPriorityPctEl.textContent = `${lowPct}%`;

    if (highPriorityBarEl) highPriorityBarEl.style.width = `${highPct}%`;
    if (mediumPriorityBarEl) mediumPriorityBarEl.style.width = `${mediumPct}%`;
    if (lowPriorityBarEl) lowPriorityBarEl.style.width = `${lowPct}%`;

    // Projects
    if (projectProgressListEl) {
      if (!projects.length) {
        projectProgressListEl.innerHTML = '<div class="empty-inline">No projects found.</div>';
      } else {
        projectProgressListEl.innerHTML = projects.map(project => {
          const progress = helpers.getProjectProgress(project, tasks);
          const projectTasksCount = tasks.filter(t => t.projectId === project.id).length;
          return `
            <div class="project-progress-item">
              <div class="project-progress-info">
                <strong>${project.name}</strong>
                <span>${progress}% complete • ${projectTasksCount} task(s)</span>
              </div>
              <div class="bar-track">
                <div class="bar-fill" style="width: ${progress}%; background: var(--accent);"></div>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    // Action Items (Overdue tasks)
    if (actionItemsListEl) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const overdueTasks = tasks.filter(task => {
        if (task.status === 'Done' || !task.dueDate) return false;
        const dueDate = new Date(task.dueDate);
        return dueDate < today;
      });

      if (!overdueTasks.length) {
        actionItemsListEl.innerHTML = '<div class="empty-inline">All tasks are on track. Great job!</div>';
      } else {
        actionItemsListEl.innerHTML = overdueTasks.map(task => {
          const projectObj = projects.find(p => p.id === task.projectId);
          const projectName = projectObj ? projectObj.name : 'No project';
          return `
            <div class="action-task-item">
              <div class="action-task-details">
                <strong>${task.title}</strong>
                <span class="text-soft">${projectName} • Overdue since ${helpers.formatDisplayDate(task.dueDate)}</span>
              </div>
              <span class="priority-pill priority-high">Overdue</span>
            </div>
          `;
        }).join('');
      }
    }

    renderAdminReportsSection();
  }

  let adminChartInstance = null;
  const rankIcons = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];

  async function renderAdminReportsSection() {
    const adminSection = document.getElementById('adminReportsSection');
    if (!adminSection) return;

    if (currentUser.role !== 'admin') {
      adminSection.classList.add('hidden');
      return;
    }

    adminSection.classList.remove('hidden');

    const api = window.NexusAPI;
    const orgId = currentUser.organizationId;
    const orgUsers = (api && orgId) ? await api.getAllUsersInOrg(orgId) : [currentUser];
    const allOrgTasks = Array.isArray(currentUser.tasks) ? currentUser.tasks.slice() : [];

    const usersWithTasks = orgUsers.map((u) => {
      const email = (u.email || '').toLowerCase();
      const memberTasks = allOrgTasks.filter((t) => {
        const owner = (t.assignedUserEmail || t.userEmail || '').toLowerCase();
        return owner === email;
      });
      return { ...u, tasks: memberTasks };
    });

    renderAdminProductivityChart(allOrgTasks);

    let backendLeaderboard = null;
    if (api && api.fetchBackendLeaderboard) {
      backendLeaderboard = await api.fetchBackendLeaderboard();
    }
    renderAdminLeaderboard(usersWithTasks, backendLeaderboard);
  }

  function renderAdminProductivityChart(allTasks) {
    const ctx = document.getElementById('adminProductivityChart');
    if (!ctx || typeof Chart === 'undefined') return;

    if (adminChartInstance) {
      adminChartInstance.destroy();
    }

    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const completedByDay = [0, 0, 0, 0, 0, 0, 0];

    allTasks.filter(t => t.status === 'Done').forEach(t => {
      const date = t.completedAt ? new Date(t.completedAt) : new Date();
      const dayIdx = (date.getDay() + 6) % 7;
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

  function renderAdminLeaderboard(users, backendLeaderboard = null) {
    const container = document.getElementById('adminLeaderboardList');
    if (!container) return;

    const esc = (s) => (typeof AppHelpers !== 'undefined' && AppHelpers.escapeHTML) ? AppHelpers.escapeHTML(s) : String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    let ranked = [];

    if (Array.isArray(backendLeaderboard)) {
      ranked = backendLeaderboard.map((item) => ({
        name: item.name || (item.email ? item.email.split('@')[0] : 'User'),
        email: item.email || '',
        role: item.role || 'employee',
        done: item.completedTaskCount || 0
      }));
    } else {
      ranked = (users || []).map(u => {
        const tasks = u.tasks || [];
        const done = tasks.filter(t => t.status === 'Done').length;
        return {
          name: u.name || (u.email ? u.email.split('@')[0] : 'User'),
          email: u.email || '',
          role: u.role || 'employee',
          done
        };
      }).sort((a, b) => b.done - a.done);
    }

    if (!ranked.length) {
      container.innerHTML = `<div class="empty-inline">No task completions recorded yet.</div>`;
      return;
    }

    container.innerHTML = ranked.slice(0, 5).map((user, idx) => `
      <div class="leaderboard-item">
        <div class="leaderboard-rank rank-${idx + 1}">${rankIcons[idx] || '#' + (idx + 1)}</div>
        <div class="leaderboard-user">
          <span class="leaderboard-avatar">${esc((user.name || 'U').charAt(0).toUpperCase())}</span>
          <div class="leaderboard-meta">
            <strong>${esc(user.name)}</strong>
            <small>${esc(user.email)}</small>
          </div>
        </div>
        <div class="leaderboard-score">
          <strong>${user.done} Done</strong>
          <small>completed task${user.done === 1 ? '' : 's'}</small>
        </div>
      </div>
    `).join('');
  }

  // Handle external storage changes
  window.addEventListener('nexus:tasks-updated', async () => {
    if (window.NexusAPI) {
      const data = await window.NexusAPI.getUserData();
      if (data) {
        currentUser.tasks = data.tasks || [];
        currentUser.projects = data.projects || [];
      }
      calculateAndRender();
    }
  });

  async function init() {
    if (window.NexusAPI) {
      const data = await window.NexusAPI.getUserData();
      if (data) {
        currentUser.tasks = data.tasks || [];
        currentUser.projects = data.projects || [];
      }
    }
    calculateAndRender();
  }

  init();
})();
