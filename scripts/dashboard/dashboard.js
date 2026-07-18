const DB_KEY = 'users';
const SESSION_KEY = 'session';
const JWT_KEY = 'jwt';
const PROVIDER_KEY = 'authProvider';
const helpers = window.AppHelpers;

let state = null;
const sessionEmail = localStorage.getItem(SESSION_KEY);
let database = JSON.parse(localStorage.getItem(DB_KEY) || '{}');
const storedTheme = localStorage.getItem('nexus-theme') || 'light';

function normalizeUser(user, fallbackEmail = sessionEmail) {
  const resolvedEmail = fallbackEmail || user?.email || 'demo@nexusweave.app';
  return {
    ...(user || {}),
    email: resolvedEmail,
    theme: user?.theme || localStorage.getItem('nexus-theme') || storedTheme || 'light',
    projects: Array.isArray(user?.projects) ? user.projects : [],
    tasks: Array.isArray(user?.tasks) ? user.tasks : [],
    activity: Array.isArray(user?.activity) ? user.activity : []
  };
}

function notifyTaskSync() {
  window.dispatchEvent(new CustomEvent('nexus:tasks-updated'));
}

let currentUser = sessionEmail ? normalizeUser(database[sessionEmail], sessionEmail) : null;

if (!currentUser) {
  window.location.href = 'index.html';
}

const welcomeText = document.getElementById('welcomeText');
const projectCount = document.getElementById('projectCount');
const taskCount = document.getElementById('taskCount');
const doneCount = document.getElementById('doneCount');
const overdueCount = document.getElementById('overdueCount');
const completionRate = document.getElementById('completionRate');
const projectsContainer = document.getElementById('projects');
const alertBox = document.getElementById('alertBox');
const heatmap = document.getElementById('heatmap');
const activityFeed = document.getElementById('activityFeed');
const themeToggle = document.querySelector('[data-theme-toggle]');
const dashboardSearchInput = document.getElementById('dashboardTaskSearch');

// Project Modal Elements
const projectModal = document.getElementById('projectModal');
const closeProjectModalBtn = document.getElementById('closeProjectModal');
const cancelProjectModalBtn = document.getElementById('cancelProjectModal');
const projectForm = document.getElementById('projectForm');
const projectIdInput = document.getElementById('projectId');
const projectNameInput = document.getElementById('projectName');
const projectDescriptionInput = document.getElementById('projectDescription');
const projectDeadlineInput = document.getElementById('projectDeadline');
const projectTimelineInput = document.getElementById('projectTimeline');
const aiSuggestBtn = document.getElementById('aiSuggestBtn');
const aiSuggestStatus = document.getElementById('aiSuggestStatus');
let aiSuggestedTasks = null;
let aiSuggestedBg = null;

state = {
  currentUser,
  selectedProjectId: null
};

function saveUser() {
  if (!state) return;
  const storedUsers = JSON.parse(localStorage.getItem(DB_KEY) || '{}');
  const safeUser = normalizeUser(state.currentUser, sessionEmail || state.currentUser?.email);
  state.currentUser = safeUser;
  storedUsers[sessionEmail || safeUser.email] = safeUser;
  localStorage.setItem(DB_KEY, JSON.stringify(storedUsers));
  database = storedUsers;
  notifyTaskSync();
}

function refreshCurrentUserFromStorage() {
  if (!state) return;
  const storedUsers = JSON.parse(localStorage.getItem(DB_KEY) || '{}');
  const storedUser = sessionEmail ? storedUsers[sessionEmail] : null;
  database = storedUsers;
  if (storedUser) {
    state.currentUser = normalizeUser(storedUser, sessionEmail);
  }
}

function pushActivity(message) {
  state.currentUser = normalizeUser(state.currentUser, sessionEmail);
  state.currentUser.activity.unshift({
    id: `activity-${Date.now()}`,
    message,
    createdAt: new Date().toISOString()
  });
  state.currentUser.activity = state.currentUser.activity.slice(0, 6);
  saveUser();
}

function showAlert(message) {
  if (!alertBox) return;
  alertBox.textContent = message;
  alertBox.classList.remove('hidden');
  setTimeout(() => alertBox.classList.add('hidden'), 2600);
}

function applyTheme(theme, persist = true) {
  document.documentElement.setAttribute('data-theme', theme);
  document.body.setAttribute('data-theme', theme);
  if (themeToggle) {
    const label = themeToggle.lastElementChild;
    if (label) {
      label.textContent = theme === 'dark' ? 'Dark' : 'Light';
    }
  }
  if (state) {
    state.currentUser.theme = theme;
    if (persist) {
      saveUser();
    }
  }
}

window.addEventListener('themechange', (event) => {
  const nextTheme = event.detail?.theme || 'light';
  if (state) {
    state.currentUser.theme = nextTheme;
    saveUser();
  }
  applyTheme(nextTheme, false);
});

function getDisplayName(email) {
  const name = (email || '').split('@')[0] || 'there';
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function getOverdueCount(tasks) {
  return tasks.filter((task) => task.status !== 'Done' && task.dueDate && new Date(task.dueDate) < new Date()).length;
}

function renderStats() {
  refreshCurrentUserFromStorage();
  const summary = helpers.getTaskSummary(state.currentUser.tasks);
  const completion = summary.total ? Math.round((summary.done / summary.total) * 100) : 0;
  const overdue = getOverdueCount(state.currentUser.tasks);
  welcomeText.textContent = `Welcome, ${getDisplayName(sessionEmail)}`;
  projectCount.textContent = state.currentUser.projects.length;
  taskCount.textContent = summary.total;
  doneCount.textContent = summary.done;
  overdueCount.textContent = overdue;
  completionRate.textContent = `${completion}%`;
}

function renderProjects() {
  refreshCurrentUserFromStorage();
  projectsContainer.innerHTML = '';

  if (!state.currentUser.projects.length) {
    projectsContainer.innerHTML = '<div class="empty-state"><h3>No projects yet</h3><p>Start your first project to bring structure to your work.</p></div>';
    return;
  }

  state.currentUser.projects.forEach((project) => {
    const progress = helpers.getProjectProgress(project, state.currentUser.tasks);
    const projectCard = document.createElement('article');
    projectCard.className = 'project-card';
    projectCard.innerHTML = `
      <div class="project-foot">
        <strong>${project.name}</strong>
        <span class="status-pill status-progress">${project.timeline || 'Planning'}</span>
      </div>
      <p class="meta">${project.description || 'Focused project workspace'}</p>
      <p class="meta">${helpers.formatDisplayDate(project.deadline)} • ${state.currentUser.tasks.filter((task) => task.projectId === project.id).length} tasks</p>
      <div class="project-foot">
        <span class="priority-pill priority-low">${progress}% complete</span>
        <div class="project-actions">
          <button class="inline-btn" data-action="edit-project">Edit</button>
          <button class="inline-btn danger" data-action="delete-project">Delete</button>
        </div>
      </div>
    `;
    projectCard.addEventListener('click', (event) => {
      const action = event.target.dataset.action;
      if (action === 'edit-project') {
        event.stopPropagation();
        editProject(project.id);
        return;
      }
      if (action === 'delete-project') {
        event.stopPropagation();
        deleteProject(project.id);
        return;
      }
      // Redirect to full board workspace
      const viewState = JSON.parse(localStorage.getItem('nexus-task-view-state') || '{}');
      viewState.project = project.id;
      localStorage.setItem('nexus-task-view-state', JSON.stringify(viewState));
      window.location.href = 'board.html';
    });
    projectsContainer.appendChild(projectCard);
  });
}

function openProjectModal(projectId = null) {
  projectForm.reset();
  projectIdInput.value = '';
  document.getElementById('projectModalTitle').textContent = 'Create project';
  document.getElementById('projectSubmitBtn').textContent = 'Create project';

  if (projectId) {
    const project = state.currentUser.projects.find((p) => p.id === projectId);
    if (project) {
      projectIdInput.value = project.id;
      projectNameInput.value = project.name;
      projectDescriptionInput.value = project.description || '';
      projectDeadlineInput.value = project.deadline || '';
      projectTimelineInput.value = project.timeline || 'Planning';
      document.getElementById('projectModalTitle').textContent = 'Edit project';
      document.getElementById('projectSubmitBtn').textContent = 'Save changes';
    }
  }
  projectModal.classList.remove('hidden');
}

function closeProjectModal() {
  projectModal.classList.add('hidden');
}

function handleProjectSubmit(event) {
  event.preventDefault();
  const name = projectNameInput.value.trim();
  if (!name) return;

  const projectId = projectIdInput.value;
  const projectPayload = {
    name,
    description: projectDescriptionInput.value.trim(),
    deadline: projectDeadlineInput.value,
    timeline: projectTimelineInput.value
  };

  if (projectId) {
    const project = state.currentUser.projects.find((p) => p.id === projectId);
    if (project) {
      Object.assign(project, projectPayload);
      pushActivity(`Updated project ${name}.`);
    }
  } else {
    const newProjectId = `project-${Date.now()}`;
    const newProject = {
      id: newProjectId,
      ...projectPayload,
      boardBg: aiSuggestedBg || 'none',
      createdAt: new Date().toISOString()
    };
    state.currentUser.projects.push(newProject);

    if (aiSuggestedTasks) {
      aiSuggestedTasks.forEach((title, idx) => {
        state.currentUser.tasks.unshift({
          id: `task-${Date.now()}-${idx}`,
          title,
          priority: idx === 0 ? 'High' : idx <= 2 ? 'Medium' : 'Low',
          dueDate: new Date(Date.now() + (idx + 1) * 86400000).toISOString().slice(0, 10),
          status: idx === 3 ? 'In Progress' : 'Todo',
          description: 'AI-suggested workspace task breakdown.',
          projectId: newProjectId,
          labels: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      });
      aiSuggestedTasks = null;
    }
    aiSuggestedBg = null;

    pushActivity(`Created project ${name}.`);
  }

  saveUser();
  renderProjects();
  renderStats();
  closeProjectModal();

  if (aiSuggestBtn) {
    aiSuggestBtn.innerHTML = '✨ AI Auto-Suggest Tasks & Background';
  }
}

function editProject(projectId) {
  openProjectModal(projectId);
}

function deleteProject(projectId) {
  if (!window.confirm('Delete this project? All associated tasks will be unassigned.')) return;
  state.currentUser.projects = state.currentUser.projects.filter((p) => p.id !== projectId);
  state.currentUser.tasks.forEach((task) => {
    if (task.projectId === projectId) {
      task.projectId = null;
    }
  });
  saveUser();
  pushActivity('Removed a project.');
  renderProjects();
  renderStats();
}

function getLocalDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildContributionGrid(tasks) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const totalCells = 31; // Last 31 days
  return Array.from({ length: totalCells }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (totalCells - 1 - index));
    const key = getLocalDateString(date);
    
    const value = tasks.filter((task) => {
      if (task.status !== 'Done' || !task.completedAt) return false;
      const completedDate = new Date(task.completedAt);
      return getLocalDateString(completedDate) === key;
    }).length;

    const intensity = value === 0 ? 0 : value <= 1 ? 1 : value <= 2 ? 2 : value <= 3 ? 3 : 4;
    return { key, value, intensity, label: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) };
  });
}

function renderActivity() {
  refreshCurrentUserFromStorage();
  const feed = state.currentUser.activity;
  if (!feed.length) {
    activityFeed.innerHTML = '<div class="empty-inline">No recent activity.</div>';
    return;
  }
  activityFeed.innerHTML = feed.map((entry) => `
    <div class="activity-item" style="display: flex; justify-content: space-between; align-items: center; gap: 0.5rem;">
      <span>${entry.message}</span>
      <button type="button" class="close-activity-btn" data-activity-id="${entry.id}" style="border: 0; background: transparent; font-size: 1.15rem; cursor: pointer; color: var(--text-soft); padding: 0 0.2rem; line-height: 1;">&times;</button>
    </div>
  `).join('');
}

function renderHeatmap() {
  refreshCurrentUserFromStorage();
  const grid = buildContributionGrid(state.currentUser.tasks);
  heatmap.innerHTML = grid.map((item) => `<div class="heatmap-cell level-${item.intensity}" title="${item.label}: ${item.value} completed"></div>`).join('');
  
  let legend = heatmap.parentElement.querySelector('.heatmap-legend');
  if (!legend) {
    heatmap.insertAdjacentHTML('afterend', '<div class="heatmap-legend"><span>Less</span><span class="legend-swatch level-0"></span><span class="legend-swatch level-1"></span><span class="legend-swatch level-2"></span><span class="legend-swatch level-3"></span><span class="legend-swatch level-4"></span><span>More</span></div>');
  }
}

function bindEvents() {
  document.getElementById('logout')?.addEventListener('click', () => {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(JWT_KEY);
    localStorage.removeItem(PROVIDER_KEY);
    window.location.href = 'index.html';
  });

  themeToggle?.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme);
    window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: nextTheme } }));
  });

  // Project Modal bindings
  document.getElementById('newProject')?.addEventListener('click', () => {
    openProjectModal();
  });
  closeProjectModalBtn?.addEventListener('click', closeProjectModal);
  cancelProjectModalBtn?.addEventListener('click', closeProjectModal);
  projectModal?.addEventListener('click', (event) => {
    if (event.target === projectModal) closeProjectModal();
  });
  projectForm?.addEventListener('submit', handleProjectSubmit);

  aiSuggestBtn?.addEventListener('click', () => {
    const projectName = projectNameInput.value.trim();
    if (!projectName) {
      showAlert('Please enter a project name first.');
      return;
    }

    aiSuggestStatus.classList.remove('hidden');
    aiSuggestBtn.disabled = true;

    setTimeout(() => {
      aiSuggestStatus.classList.add('hidden');
      aiSuggestBtn.disabled = false;

      const nameLower = projectName.toLowerCase();
      let suggestions = [];
      if (nameLower.includes('web') || nameLower.includes('app') || nameLower.includes('site') || nameLower.includes('design')) {
        suggestions = [
          'Design landing page high-fidelity mockups',
          'Set up structural components & stylesheet foundations',
          'Implement user auth flow redirects',
          'Deploy staging build to Vercel/Netlify'
        ];
      } else if (nameLower.includes('research') || nameLower.includes('paper') || nameLower.includes('study') || nameLower.includes('college')) {
        suggestions = [
          'Conduct comprehensive literature review of sources',
          'Define research methodology & target goals',
          'Draft abstract, findings, and analysis sections',
          'Format citations & proofread document final draft'
        ];
      } else {
        suggestions = [
          `Define scope & core milestones for ${projectName}`,
          'Assign team member roles & project timeline schedules',
          'Draft initial mockups & functional specs draft',
          'Conduct final milestone delivery demo review'
        ];
      }

      aiSuggestedTasks = suggestions;

      let bgTheme = 'aurora';
      if (nameLower.includes('web') || nameLower.includes('app') || nameLower.includes('site') || nameLower.includes('design')) bgTheme = 'tech';
      else if (nameLower.includes('research') || nameLower.includes('paper') || nameLower.includes('study') || nameLower.includes('college')) bgTheme = 'calm';

      const themeUrls = {
        tech: "url('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=800')",
        calm: "url('https://images.unsplash.com/photo-1557683316-973673baf926?q=80&w=800')",
        aurora: "url('https://images.unsplash.com/photo-1506318137071-a8e063b4bec0?q=80&w=800')"
      };
      aiSuggestedBg = themeUrls[bgTheme] || themeUrls.aurora;

      showAlert(`AI generated ${suggestions.length} suggested tasks & custom board theme background successfully!`);
      aiSuggestBtn.innerHTML = '✨ AI Suggested (Ready)';
    }, 1500);
  });

  // Quick Action Buttons
  document.querySelectorAll('[data-quick-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const action = button.dataset.quickAction;
      if (action === 'new-project') {
        openProjectModal();
      } else if (action === 'new-task') {
        window.location.href = 'create.html?type=task';
      } else if (action === 'open-board') {
        window.location.href = 'board.html';
      }
    });
  });

  // Global search redirect
  dashboardSearchInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      const query = event.target.value.trim();
      if (query) {
        const viewState = JSON.parse(localStorage.getItem('nexus-task-view-state') || '{}');
        viewState.query = query;
        localStorage.setItem('nexus-task-view-state', JSON.stringify(viewState));
        window.location.href = 'tasks.html';
      }
    }
  });

  // Clear activity feed
  document.getElementById('clearActivity')?.addEventListener('click', () => {
    if (!window.confirm('Clear all recent activity?')) return;
    state.currentUser.activity = [];
    saveUser();
    renderActivity();
    showAlert('Activity log cleared.');
  });

  // Delete individual activity item
  activityFeed?.addEventListener('click', (event) => {
    const deleteBtn = event.target.closest('.close-activity-btn');
    if (!deleteBtn) return;
    const activityId = deleteBtn.dataset.activityId;
    state.currentUser.activity = state.currentUser.activity.filter(act => act.id !== activityId);
    saveUser();
    renderActivity();
  });
}

function initDashboard() {
  if (!state.currentUser.projects.length) {
    state.currentUser.projects.unshift({
      id: 'project-demo',
      name: 'Launch Sprint',
      description: 'A starter project for your first week.',
      deadline: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      timeline: 'Execution',
      createdAt: new Date().toISOString()
    });
    state.selectedProjectId = 'project-demo';
    state.currentUser.tasks = [
      { id: 'task-demo-1', title: 'Draft roadmap', priority: 'High', dueDate: new Date().toISOString().slice(0, 10), status: 'Todo', description: 'Capture your plan.', projectId: 'project-demo', createdAt: new Date().toISOString() },
      { id: 'task-demo-2', title: 'Review notes', priority: 'Medium', dueDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10), status: 'In Progress', description: 'Share updates.', projectId: 'project-demo', createdAt: new Date().toISOString() },
      { id: 'task-demo-3', title: 'Ship weekly update', priority: 'Low', dueDate: new Date(Date.now() + 172800000).toISOString().slice(0, 10), status: 'Done', description: 'Celebrate the close.', projectId: 'project-demo', completedAt: new Date().toISOString(), createdAt: new Date().toISOString() }
    ];
    state.currentUser.activity = [
      { id: 'activity-demo-1', message: 'Created project Launch Sprint.', createdAt: new Date().toISOString() },
      { id: 'activity-demo-2', message: 'Completed Ship weekly update.', createdAt: new Date().toISOString() }
    ];
    saveUser();
  }

  const preferredTheme = localStorage.getItem('nexus-theme') || state.currentUser.theme || 'light';
  state.currentUser.theme = preferredTheme;
  applyTheme(preferredTheme, false);
  renderStats();
  renderProjects();
  renderActivity();
  renderHeatmap();
  bindEvents();

  const dueSoonTasks = helpers.getDueSoonTasks(state.currentUser.tasks);
  if (dueSoonTasks.length > 0) {
    const titles = dueSoonTasks.map((t) => `“${t.title}”`).join(', ');
    showAlert(`Alert: task ${titles} is approaching deadline!`);
  }
}

initDashboard();
